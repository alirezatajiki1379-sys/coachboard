import type { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Squad } from "@/types/domain";

type SquadRow = {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapSquadRow(row: SquadRow): Squad {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    isActive: row.is_active,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

type DatabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function ensureActiveSquad(db: DatabaseClient, userId: string): Promise<Squad> {
  const dynamicDb = db as unknown as SupabaseClient;
  const { data: active, error: activeError } = await dynamicDb
    .from("squads")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (activeError) throw new Error(activeError.message);
  if (active) return mapSquadRow(active as SquadRow);

  const { data: existing, error: existingError } = await dynamicDb
    .from("squads")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    await dynamicDb.from("squads").update({ is_active: true }).eq("id", existing.id).eq("user_id", userId);
    return mapSquadRow({ ...(existing as SquadRow), is_active: true });
  }

  const { data: created, error: createdError } = await dynamicDb
    .from("squads")
    .insert({ user_id: userId, name: "Active Squad", is_active: true })
    .select("*")
    .single();
  if (createdError) throw new Error(createdError.message);
  return mapSquadRow(created as SquadRow);
}

export async function listSquads(db: DatabaseClient, userId: string): Promise<Squad[]> {
  const active = await ensureActiveSquad(db, userId);
  const dynamicDb = db as unknown as SupabaseClient;
  const { data, error } = await dynamicDb
    .from("squads")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as SquadRow[]).map(mapSquadRow);
  return rows.some((squad) => squad.id === active.id) ? rows : [active, ...rows];
}
