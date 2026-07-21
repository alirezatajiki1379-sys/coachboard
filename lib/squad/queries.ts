import type { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapAttendanceRow, mapTrainingEventRow, type SquadAttendanceRow, type SquadTrainingEventRow } from "@/lib/squad/attendance-mappers";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import type { SquadAttendanceEntry, SquadPlayer, SquadTrainingEvent } from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SquadView = "active" | "archived";

export function parseSquadView(searchParams: Record<string, string | string[] | undefined>): SquadView {
  const value = searchParams.view;
  const view = Array.isArray(value) ? value[0] : value;
  return view === "archived" ? "archived" : "active";
}

export async function listSquadPlayers(
  supabase: SupabaseServerClient,
  userId: string,
  view: SquadView = "active"
): Promise<SquadPlayer[]> {
  let query = supabase
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .eq("player_type", "roster")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  query = view === "archived" ? query.not("archived_at", "is", null).is("deleted_at", null) : query.is("archived_at", null).is("deleted_at", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);
}

export async function getSquadPlayer(
  supabase: SupabaseServerClient,
  userId: string,
  playerId: string
): Promise<SquadPlayer | null> {
  const { data, error } = await supabase
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .eq("id", playerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapSquadPlayerRow(data as SquadPlayerRow) : null;
}

export async function getSquadPlayerTrainingHistory(
  supabase: SupabaseServerClient,
  userId: string,
  playerId: string
): Promise<Array<SquadAttendanceEntry & { event?: SquadTrainingEvent }>> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("squad_attendance_records")
    .select("*, squad_training_events(*)")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<
    SquadAttendanceRow & {
      squad_training_events?: SquadTrainingEventRow | null;
    }
  >).map((row) => ({
    ...mapAttendanceRow(row),
    event: row.squad_training_events ? mapTrainingEventRow(row.squad_training_events) : undefined
  }));
}
