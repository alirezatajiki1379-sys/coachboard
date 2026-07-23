"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isGermanFederalState, normalizeCalendarCategory } from "@/lib/squad/regional-calendar";

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
  const countryCode = formString(formData, "countryCode") || "DE";
  const federalStateCode = formString(formData, "federalStateCode");
  const city = formString(formData, "city");
  if (!name) redirect("/teams?error=name");
  if (countryCode === "DE" && !isGermanFederalState(federalStateCode)) redirect("/teams?error=location");

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await db.from("squads").update({ is_active: false }).eq("user_id", user.id);
  const { error } = await db.from("squads").insert({
    user_id: user.id,
    name,
    is_active: true,
    country_code: countryCode,
    federal_state_code: countryCode === "DE" ? federalStateCode : null,
    city: city || null
  });
  if (error) throw new Error(error.message);

  revalidateTeamScopedPages();
  revalidatePath("/teams");
  redirect(returnTo);
}

export async function updateTeamCalendarSettings(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const returnTo = formString(formData, "returnTo") || "/teams";
  const countryCode = formString(formData, "countryCode") || "DE";
  const federalStateCode = formString(formData, "federalStateCode");
  const city = formString(formData, "city");
  if (!teamId) redirect("/teams");
  if (countryCode === "DE" && !isGermanFederalState(federalStateCode)) redirect("/teams?error=location");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squads")
    .update({
      country_code: countryCode,
      federal_state_code: countryCode === "DE" ? federalStateCode : null,
      city: city || null,
      calendar_preferences: {
        publicHolidays: preference(formString(formData, "publicHolidays"), ["ask", "exclude", "keep"], "ask"),
        schoolHolidays: preference(formString(formData, "schoolHolidays"), ["ask", "exclude", "keep"], "ask"),
        localMovableHolidays: preference(formString(formData, "localMovableHolidays"), ["confirmed_only", "ask", "exclude", "keep"], "confirmed_only"),
        customExclusions: preference(formString(formData, "customExclusions"), ["exclude", "ask", "keep"], "exclude")
      }
    })
    .eq("id", teamId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidateTeamScopedPages();
  revalidatePath("/teams");
  revalidatePath(`/teams/${teamId}/settings`);
  redirect(returnTo);
}

export async function createTeamCalendarExclusion(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const name = formString(formData, "name");
  const startsOn = formString(formData, "startsOn");
  const endsOn = formString(formData, "endsOn") || startsOn;
  const category = preference(
    normalizeCalendarCategory(formString(formData, "category")),
    ["movable_school_holiday", "local_school_free_day", "team_custom_exclusion"],
    "team_custom_exclusion"
  );
  if (!teamId || !name || !startsOn || endsOn < startsOn) redirect("/teams?error=calendar");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: team } = await db.from("squads").select("id").eq("id", teamId).eq("user_id", user.id).maybeSingle();
  if (!team) redirect("/teams");
  const { error } = await db.from("team_calendar_exclusions").insert({
    user_id: user.id,
    squad_id: teamId,
    name,
    starts_on: startsOn,
    ends_on: endsOn,
    category,
    reason: formString(formData, "reason") || null,
    exclude_by_default: formData.has("excludeByDefault")
  });
  if (error) throw new Error(error.message);
  revalidatePath("/teams");
  redirect("/teams");
}

export async function deleteTeamCalendarExclusion(formData: FormData) {
  const exclusionId = formString(formData, "exclusionId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await db.from("team_calendar_exclusions").delete().eq("id", exclusionId).eq("user_id", user.id);
  revalidatePath("/teams");
  redirect("/teams");
}

function preference<T extends string>(value: string, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export async function renameTeam(formData: FormData) {
  const teamId = formString(formData, "teamId");
  const name = formString(formData, "name");
  const returnTo = formString(formData, "returnTo") || "/teams";
  if (!teamId || !name) redirect("/teams?error=name");

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("squads").update({ name }).eq("id", teamId).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidateTeamScopedPages();
  revalidatePath("/teams");
  revalidatePath(`/teams/${teamId}/settings`);
  redirect(returnTo);
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
