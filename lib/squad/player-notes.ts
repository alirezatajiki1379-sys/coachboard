import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { PlayerNote } from "@/types/domain";

export type PlayerNoteRow = Database["public"]["Tables"]["player_notes"]["Row"];

export function mapPlayerNote(row: PlayerNoteRow): PlayerNote {
  return {
    id: row.id,
    userId: row.user_id,
    squadId: row.squad_id,
    playerId: row.player_id,
    note: row.note,
    noteDate: row.note_date,
    visibility: row.visibility,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listPlayerNotes(db: SupabaseClient, userId: string, playerId: string) {
  const { data, error } = await db
    .from("player_notes")
    .select("id,user_id,squad_id,player_id,note,note_date,visibility,pinned,created_at,updated_at")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .order("pinned", { ascending: false })
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PlayerNoteRow[]).map(mapPlayerNote);
}
