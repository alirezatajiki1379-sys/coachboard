"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type StaffActionState = {
  ok: boolean;
  message: string;
};

const initialError: StaffActionState = { ok: false, message: "Staff member could not be saved." };

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function staffContext(formData: FormData) {
  const squadId = formString(formData, "squadId");
  if (!squadId) throw new Error("Team is missing.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const db = supabase as unknown as SupabaseClient;
  const { data: squad, error } = await db
    .from("squads")
    .select("id")
    .eq("id", squadId)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !squad) throw new Error("Team is not available.");
  return { db, userId: user.id, squadId };
}

function validateStaff(name: string, role: string): StaffActionState | undefined {
  if (!name || name.length > 120) return { ok: false, message: "Enter a coach name up to 120 characters." };
  if (!role || role.length > 80) return { ok: false, message: "Enter a role up to 80 characters." };
}

function refreshStaff() {
  revalidatePath("/squad/staff");
  revalidatePath("/trainings");
}

export async function createSquadStaff(
  _previous: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const name = formString(formData, "name");
  const role = formString(formData, "role") || "Assistant Coach";
  const validation = validateStaff(name, role);
  if (validation) return validation;
  try {
    const { db, userId, squadId } = await staffContext(formData);
    const { error } = await db.from("squad_staff").insert({
      user_id: userId,
      squad_id: squadId,
      name,
      role,
      is_active: true
    });
    if (error) throw error;
    refreshStaff();
    return { ok: true, message: "Staff member saved." };
  } catch {
    return initialError;
  }
}

export async function updateSquadStaff(
  _previous: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const staffId = formString(formData, "staffId");
  const name = formString(formData, "name");
  const role = formString(formData, "role") || "Assistant Coach";
  const validation = validateStaff(name, role);
  if (!staffId) return { ok: false, message: "Staff member is missing." };
  if (validation) return validation;
  try {
    const { db, userId, squadId } = await staffContext(formData);
    const { data, error } = await db
      .from("squad_staff")
      .update({ name, role })
      .eq("id", staffId)
      .eq("user_id", userId)
      .eq("squad_id", squadId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw error ?? new Error("Staff member not found.");
    refreshStaff();
    return { ok: true, message: "Staff member updated." };
  } catch {
    return initialError;
  }
}

export async function toggleSquadStaffActive(
  _previous: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const staffId = formString(formData, "staffId");
  if (!staffId) return { ok: false, message: "Staff member is missing." };
  try {
    const { db, userId, squadId } = await staffContext(formData);
    const { data: current, error: readError } = await db
      .from("squad_staff")
      .select("id,is_active")
      .eq("id", staffId)
      .eq("user_id", userId)
      .eq("squad_id", squadId)
      .maybeSingle();
    if (readError || !current) throw readError ?? new Error("Staff member not found.");
    const { error } = await db
      .from("squad_staff")
      .update({ is_active: !current.is_active })
      .eq("id", staffId)
      .eq("user_id", userId)
      .eq("squad_id", squadId);
    if (error) throw error;
    refreshStaff();
    return { ok: true, message: "Staff availability updated." };
  } catch {
    return { ok: false, message: "Staff availability could not be updated." };
  }
}
