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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type LinkedSessionRow = {
  id: string;
  title: string;
};

export async function listTrainingEvents(supabase: SupabaseServerClient, userId: string): Promise<SquadTrainingEvent[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("squad_training_events")
    .select("*, training_sessions(id, title)")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null }>).map((row) =>
    mapTrainingEventRow(row, row.training_sessions?.title)
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
    .select("*, training_sessions(id, title)")
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

  const attendance = ((attendanceData ?? []) as Array<
    SquadAttendanceRow & {
      squad_players?: SquadPlayerRow | null;
    }
  >).map((row) => mapAttendanceRow(row, row.squad_players ?? undefined));

  const event = mapTrainingEventRow(
    eventData as SquadTrainingEventRow,
    (eventData as SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null }).training_sessions?.title
  );

  return { ...event, attendance };
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
