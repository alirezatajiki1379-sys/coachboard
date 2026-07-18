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

function optional(value: string) {
  return value ? value : null;
}

function playerPath(playerId: string, tab = "overview") {
  return `/squad/players/${playerId}?tab=${tab}`;
}

function revalidatePlayer(playerId: string) {
  revalidatePath("/squad");
  revalidatePath(`/squad/players/${playerId}`);
  revalidatePath(`/squad/players/${playerId}/edit`);
}

export async function savePlayerHeaderPreferences(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("player_header_preferences").upsert(
    {
      user_id: user.id,
      show_height: formData.get("showHeight") === "on",
      show_weight: formData.get("showWeight") === "on",
      show_jersey_number: formData.get("showJerseyNumber") === "on",
      show_captain: formData.get("showCaptain") === "on",
      show_joined_date: formData.get("showJoinedDate") === "on",
      show_last_training: formData.get("showLastTraining") === "on"
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
  if (playerId) revalidatePlayer(playerId);
  redirect(formString(formData, "returnTo") || (playerId ? playerPath(playerId) : "/squad"));
}

export async function createPlayerContact(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const name = formString(formData, "name");
  const phone = formString(formData, "phone");
  const email = formString(formData, "email");
  if (!playerId || (!name && !phone && !email)) redirect(playerPath(playerId, "details"));

  const relationship = relationshipValue(formString(formData, "relationship"));
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("player_contacts").insert({
    user_id: user.id,
    player_id: playerId,
    name: optional(name),
    relationship,
    phone: optional(phone),
    email: optional(email),
    is_primary: formData.get("isPrimary") === "on",
    is_emergency: formData.get("isEmergency") === "on",
    notes: optional(formString(formData, "notes"))
  });
  if (error) throw new Error(error.message);
  revalidatePlayer(playerId);
  redirect(playerPath(playerId, "details"));
}

export async function deletePlayerContact(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const contactId = formString(formData, "contactId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("player_contacts").delete().eq("id", contactId).eq("player_id", playerId).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePlayer(playerId);
  redirect(playerPath(playerId, "details"));
}

export async function createPlayerMedicalPeriod(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const startDate = formString(formData, "startDate");
  const description = formString(formData, "description");
  if (!playerId || !startDate || !description) redirect(playerPath(playerId, "details"));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const type = formString(formData, "type") === "sick" ? "sick" : "injured";
  const { error } = await db.from("player_medical_periods").insert({
    user_id: user.id,
    player_id: playerId,
    type,
    start_date: startDate,
    end_date: optional(formString(formData, "endDate")),
    expected_return_date: optional(formString(formData, "expectedReturnDate")),
    actual_return_date: optional(formString(formData, "actualReturnDate")),
    description,
    notes: optional(formString(formData, "notes")),
    status: statusValue(formString(formData, "status"))
  });
  if (error) throw new Error(error.message);
  revalidatePlayer(playerId);
  revalidatePath("/squad/attendance");
  revalidatePath("/trainings");
  redirect(playerPath(playerId, "details"));
}

export async function updatePlayerMedicalPeriodStatus(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const periodId = formString(formData, "periodId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("player_medical_periods")
    .update({
      status: statusValue(formString(formData, "status")),
      actual_return_date: optional(formString(formData, "actualReturnDate"))
    })
    .eq("id", periodId)
    .eq("player_id", playerId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePlayer(playerId);
  revalidatePath("/squad/attendance");
  revalidatePath("/trainings");
  redirect(playerPath(playerId, "details"));
}

function relationshipValue(value: string) {
  return value === "mother" || value === "father" || value === "guardian" || value === "emergency" || value === "other" ? value : "parent";
}

function statusValue(value: string) {
  return value === "completed" || value === "cancelled" ? value : "active";
}
