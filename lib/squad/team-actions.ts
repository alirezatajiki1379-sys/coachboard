"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateTeamScopedPages() {
  revalidatePath("/dashboard");
  revalidatePath("/squad");
  revalidatePath("/trainings");
  revalidatePath("/sessions");
  revalidatePath("/actions");
}

export async function switchTeam(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const returnTo = formString(formData, "returnTo") || "/dashboard";
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;

  const { data: team, error } = await db
    .from("squads")
    .select("id")
    .eq("id", teamId)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!team) redirect("/teams");

  await db.from("squads").update({ is_active: false }).eq("user_id", user.id);
  await db.from("squads").update({ is_active: true }).eq("id", teamId).eq("user_id", user.id);
  revalidateTeamScopedPages();
  redirect(returnTo);
}

export async function createTeam(formData: FormData) {
  const name = formString(formData, "name");
  const returnTo = formString(formData, "returnTo") || "/dashboard";
  if (!name) redirect("/teams?error=name");

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await db.from("squads").update({ is_active: false }).eq("user_id", user.id);
  const { error } = await db.from("squads").insert({ user_id: user.id, name, is_active: true });
  if (error) throw new Error(error.message);

  revalidateTeamScopedPages();
  revalidatePath("/teams");
  redirect(returnTo);
}

export async function renameTeam(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const name = formString(formData, "name");
  if (!teamId || !name) redirect("/teams?error=name");

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("squads").update({ name }).eq("id", teamId).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidateTeamScopedPages();
  revalidatePath("/teams");
  redirect("/teams");
}

export async function archiveTeam(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squads")
    .update({ archived_at: new Date().toISOString(), is_active: false })
    .eq("id", teamId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  const { data: fallback } = await db
    .from("squads")
    .select("id")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fallback?.id) await db.from("squads").update({ is_active: true }).eq("id", fallback.id).eq("user_id", user.id);

  revalidateTeamScopedPages();
  revalidatePath("/teams");
  redirect("/teams");
}

export async function restoreTeam(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("squads").update({ archived_at: null }).eq("id", teamId).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/teams");
  redirect("/teams");
}
