import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export const staffRoleOptions = [
  "Head Coach",
  "Assistant Coach",
  "Goalkeeper Coach",
  "Athletic Coach",
  "Analyst"
] as const;

export type SquadStaffMember = {
  id: string;
  squadId: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type StaffRow = {
  id: string;
  squad_id: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listSquadStaff(
  supabase: ServerClient,
  userId: string,
  squadId: string
): Promise<SquadStaffMember[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("squad_staff")
    .select("id,squad_id,name,role,is_active,created_at,updated_at")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as StaffRow[]).map((row) => ({
    id: row.id,
    squadId: row.squad_id,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function isStandardStaffRole(role: string): role is (typeof staffRoleOptions)[number] {
  return staffRoleOptions.some((option) => option === role);
}
