import type { createClient } from "@/lib/supabase/server";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import type { SquadPlayer } from "@/types/domain";

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
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  query = view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);

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
