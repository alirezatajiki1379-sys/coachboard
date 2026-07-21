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
import { mapPlayerMedicalPeriodRow, mapSquadPlayerRow, type PlayerMedicalPeriodRow } from "@/lib/squad/mappers";
import { ensureActiveSquad } from "@/lib/squad/squads";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type LinkedSessionRow = {
  id: string;
  title: string;
  duration_target_minutes?: number | null;
};

type SquadNameRow = {
  name?: string | null;
};

type CompactAttendanceRow = SquadAttendanceRow & {
  squad_players?: Partial<SquadPlayerRow> | Partial<SquadPlayerRow>[] | null;
};

type TrainingEventListOptions = {
  squadId?: string;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
};

export async function listTrainingEvents(supabase: SupabaseServerClient, userId: string, options: TrainingEventListOptions = {}): Promise<SquadTrainingEvent[]> {
  const activeSquad = options.squadId ? undefined : await ensureActiveSquad(supabase, userId);
  const squadId = options.squadId ?? activeSquad?.id;
  const db = supabase as unknown as SupabaseClient;
  let query = db
    .from("squad_training_events")
    .select("*, training_sessions(id, title, duration_target_minutes), squads(name)")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });
  if (squadId) query = query.eq("squad_id", squadId);
  if (options.onlyDeleted) query = query.not("deleted_at", "is", null);
  else if (!options.includeDeleted) query = query.is("deleted_at", null);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null; squads?: SquadNameRow | null }>).map((row) =>
    {
      const mapped = mapTrainingEventRow(row, row.training_sessions?.title, row.squads?.name ?? undefined);
      return { ...mapped, linkedTrainingSessionDuration: row.training_sessions?.duration_target_minutes ?? undefined };
    }
  );
}

export async function listTrainingEventDetails(supabase: SupabaseServerClient, userId: string, options: TrainingEventListOptions = {}): Promise<SquadTrainingEventDetail[]> {
  const events = await listTrainingEvents(supabase, userId, options);
  if (!events.length) return [];
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("squad_attendance_records")
    .select("id,user_id,event_id,player_id,planned_status,planned_reason,planned_reason_note,planned_status_source,final_status,late_minutes,late_penalty_applied,overall_rating,rating_technique,rating_game_understanding,rating_intensity,rating_behavior,rating_auto_suggestion,coach_note,sensitive_note,created_at,updated_at,squad_players(id,user_id,first_name,last_name,position,player_type,archived_at,deleted_at,created_at,updated_at)")
    .eq("user_id", userId)
    .in("event_id", events.map((event) => event.id))
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const attendanceByEvent = new Map<string, ReturnType<typeof mapAttendanceRow>[]>();
  for (const row of (data ?? []) as unknown as CompactAttendanceRow[]) {
    const mapped = mapAttendanceRow(row, compactPlayerToRow(row.squad_players ?? undefined));
    attendanceByEvent.set(row.event_id, [...(attendanceByEvent.get(row.event_id) ?? []), mapped]);
  }
  return events.map((event) => ({ ...event, attendance: attendanceByEvent.get(event.id) ?? [] }));
}

function compactPlayerToRow(playerInput?: Partial<SquadPlayerRow> | Partial<SquadPlayerRow>[] | null): SquadPlayerRow | undefined {
  const player = Array.isArray(playerInput) ? playerInput[0] : playerInput;
  if (!player?.id || !player.user_id || !player.first_name) return undefined;
  return {
    id: player.id,
    user_id: player.user_id,
    squad_id: player.squad_id ?? null,
    player_type: player.player_type ?? "roster",
    first_name: player.first_name,
    last_name: player.last_name ?? null,
    date_of_birth: null,
    position: player.position ?? null,
    secondary_positions: [],
    strong_foot: null,
    club: null,
    original_club: null,
    club_training_schedule: null,
    external_player_id: null,
    trial_start_date: null,
    trial_duration_mode: null,
    trial_training_limit: null,
    trial_end_date: null,
    player_email: null,
    parent_guardian_name: null,
    parent_phone: null,
    player_phone: null,
    parent_email: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relationship: null,
    top_size: null,
    jacket_size: null,
    trouser_size: null,
    shoe_size: null,
    preferred_positions: [],
    original_preferred_positions: null,
    original_strong_foot: null,
    height_cm: null,
    weight_kg: null,
    jersey_number: null,
    captain_status: null,
    joined_date: null,
    allergies: null,
    medication: null,
    medical_notes: null,
    hobbies: null,
    development_goal: null,
    work_on: null,
    coach_expectations: null,
    onboarding_comments: null,
    recommended_players_raw: null,
    recommended_player_name: null,
    recommended_player_birth_year: null,
    recommended_player_position: null,
    recommended_player_club: null,
    onboarding_source: null,
    onboarding_submitted_at: null,
    onboarding_import_batch: null,
    import_batch_id: null,
    onboarding_original_answers: null,
    onboarding_normalized_values: null,
    onboarding_warnings: [],
    notes: null,
    converted_at: null,
    archived_at: null,
    deleted_at: player.deleted_at ?? null,
    created_at: player.created_at ?? "",
    updated_at: player.updated_at ?? ""
  };
}

export async function getTrainingEventDetail(
  supabase: SupabaseServerClient,
  userId: string,
  eventId: string
): Promise<SquadTrainingEventDetail | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data: eventData, error } = await db
    .from("squad_training_events")
    .select("*, training_sessions(id, title, duration_target_minutes), squads(name)")
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
    (eventData as SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null }).training_sessions?.title,
    (eventData as SquadTrainingEventRow & { squads?: SquadNameRow | null }).squads?.name ?? undefined
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

export async function listTrainingParticipantOptions(supabase: SupabaseServerClient, userId: string, squadId?: string) {
  const db = supabase as unknown as SupabaseClient;
  const activeSquad = squadId ? undefined : await ensureActiveSquad(supabase, userId);
  const { data, error } = await db
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("player_type", { ascending: true })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (error) throw new Error(error.message);
  const targetSquadId = squadId ?? activeSquad?.id;
  return ((data ?? []) as SquadPlayerRow[])
    .filter((player) => !targetSquadId || player.squad_id === targetSquadId)
    .filter((player) => player.player_type === "roster" || (player.player_type === "trial" && !player.converted_at))
    .map(mapSquadPlayerRow);
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
  const { data: event, error: eventError } = await db
    .from("squad_training_events")
    .select("squad_id")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);

  let query = db
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .eq("player_type", "trial")
    .is("converted_at", null)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (event?.squad_id) query = query.eq("squad_id", event.squad_id);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as SquadPlayerRow[]).filter((player) => !existingIds.has(player.id));
}
