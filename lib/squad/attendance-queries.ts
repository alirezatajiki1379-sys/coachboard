import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import {
  mapAttendanceRow,
  mapTrainingEventRow,
  type SquadAttendanceRow,
  type SquadTrainingEventRow
} from "@/lib/squad/attendance-mappers";
import type { SquadPlayerRow } from "@/lib/squad/mappers";
import type { SquadTrainingEvent, SquadTrainingEventDetail } from "@/types/domain";
import type { PlayerMedicalPeriod } from "@/types/domain";
import { isMedicalPeriodActiveOnDate, latestApplicableMedicalPeriod, medicalLabel, medicalNeedsReview, medicalReasonForType } from "@/lib/squad/player-hub";
import { mapPlayerMedicalPeriodRow, type PlayerMedicalPeriodRow } from "@/lib/squad/mappers";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type LinkedSessionRow = {
  id: string;
  title: string;
  duration_target_minutes?: number | null;
};

export async function listTrainingEvents(supabase: SupabaseServerClient, userId: string): Promise<SquadTrainingEvent[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("squad_training_events")
    .select("*, training_sessions(id, title, duration_target_minutes)")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null }>).map((row) =>
    {
      const mapped = mapTrainingEventRow(row, row.training_sessions?.title);
      return { ...mapped, linkedTrainingSessionDuration: row.training_sessions?.duration_target_minutes ?? undefined };
    }
  );
}

export async function listTrainingEventDetails(supabase: SupabaseServerClient, userId: string): Promise<SquadTrainingEventDetail[]> {
  const events = await listTrainingEvents(supabase, userId);
  if (!events.length) return [];
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("squad_attendance_records")
    .select("*, squad_players(*)")
    .eq("user_id", userId)
    .in("event_id", events.map((event) => event.id))
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const attendanceByEvent = new Map<string, ReturnType<typeof mapAttendanceRow>[]>();
  for (const row of (data ?? []) as Array<
    SquadAttendanceRow & {
      squad_players?: SquadPlayerRow | null;
    }
  >) {
    const mapped = mapAttendanceRow(row, row.squad_players ?? undefined);
    attendanceByEvent.set(row.event_id, [...(attendanceByEvent.get(row.event_id) ?? []), mapped]);
  }
  return events.map((event) => ({ ...event, attendance: attendanceByEvent.get(event.id) ?? [] }));
}

export async function getTrainingEventDetail(
  supabase: SupabaseServerClient,
  userId: string,
  eventId: string
): Promise<SquadTrainingEventDetail | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data: eventData, error } = await db
    .from("squad_training_events")
    .select("*, training_sessions(id, title, duration_target_minutes)")
    .eq("user_id", userId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!eventData) return null;

  const { data: attendanceData, error: attendanceError } = await db
    .from("squad_attendance_records")
    .select("*, squad_players(*)")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (attendanceError) throw new Error(attendanceError.message);

  const attendanceRows = (attendanceData ?? []) as Array<
    SquadAttendanceRow & {
      squad_players?: SquadPlayerRow | null;
    }
  >;

  const medicalByPlayer = await getMedicalByPlayer(db, userId, eventData.date, attendanceRows.map((row) => row.player_id));
  const attendance = attendanceRows.map((row) => applyMedicalPrefill(mapAttendanceRow(row, row.squad_players ?? undefined), medicalByPlayer.get(row.player_id)));

  const event = mapTrainingEventRow(
    eventData as SquadTrainingEventRow,
    (eventData as SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null }).training_sessions?.title
  );

  const linked = (eventData as SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null }).training_sessions;
  return { ...event, linkedTrainingSessionDuration: linked?.duration_target_minutes ?? undefined, attendance };
}

async function getMedicalByPlayer(db: SupabaseClient, userId: string, eventDate: string, playerIds: string[]) {
  const result = new Map<string, PlayerMedicalPeriod>();
  if (!playerIds.length) return result;
  const { data, error } = await db
    .from("player_medical_periods")
    .select("*")
    .eq("user_id", userId)
    .in("player_id", Array.from(new Set(playerIds)))
    .eq("status", "active")
    .lte("start_date", eventDate)
    .or(`end_date.is.null,end_date.gte.${eventDate}`);
  if (error) return result;
  const byPlayer = new Map<string, PlayerMedicalPeriod[]>();
  for (const row of (data ?? []) as PlayerMedicalPeriodRow[]) {
    const period = mapPlayerMedicalPeriodRow(row);
    if (!isMedicalPeriodActiveOnDate(period, eventDate)) continue;
    byPlayer.set(period.playerId, [...(byPlayer.get(period.playerId) ?? []), period]);
  }
  for (const [playerId, periods] of byPlayer) {
    const latest = latestApplicableMedicalPeriod(periods, eventDate);
    if (latest) result.set(playerId, latest);
  }
  return result;
}

function applyMedicalPrefill<T extends ReturnType<typeof mapAttendanceRow>>(entry: T, medical: PlayerMedicalPeriod | undefined): T {
  if (!medical) {
    if (entry.plannedStatusSource === "medical" && !entry.finalStatus) {
      return { ...entry, plannedStatus: "expected", plannedReason: undefined, plannedReasonNote: undefined, plannedStatusSource: "default" };
    }
    return entry;
  }
  const availability = {
    periodId: medical.id,
    type: medical.type,
    label: medicalLabel(medical),
    until: medical.actualReturnDate ?? medical.expectedReturnDate ?? medical.endDate,
    description: medical.description,
    needsReview: medicalNeedsReview(medical)
  };
  if (entry.finalStatus || entry.plannedStatusSource === "manual") return { ...entry, medicalAvailability: availability };
  return {
    ...entry,
    plannedStatus: "unavailable",
    plannedReason: medicalReasonForType(medical.type),
    plannedReasonNote: medical.description,
    plannedStatusSource: "medical",
    medicalAvailability: availability
  };
}

export async function getLinkableTrainingSessions(supabase: SupabaseServerClient, userId: string): Promise<LinkedSessionRow[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("training_sessions")
    .select("id, title")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LinkedSessionRow[];
}

export async function listAvailableTrialPlayers(
  supabase: SupabaseServerClient,
  userId: string,
  eventId: string
): Promise<SquadPlayerRow[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data: existing, error: existingError } = await db
    .from("squad_attendance_records")
    .select("player_id")
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (existingError) throw new Error(existingError.message);
  const existingIds = new Set((existing ?? []).map((row: { player_id: string }) => row.player_id));

  const { data, error } = await db
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .eq("player_type", "trial")
    .is("converted_at", null)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as SquadPlayerRow[]).filter((player) => !existingIds.has(player.id));
}
