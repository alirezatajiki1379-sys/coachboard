"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { playerAbsenceReasonLabels, syncPlayerAvailabilityToFutureTrainings, type PlayerAbsenceReason } from "@/lib/squad/availability";
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

function playerPathWithError(playerId: string, message: string) {
  return `${playerPath(playerId, "details")}&medicalError=${encodeURIComponent(message)}`;
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
  if (email && !isEmail(email)) redirect(`${playerPath(playerId, "details")}&contactError=${encodeURIComponent("Enter a valid contact email address.")}`);

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
  const endDate = formString(formData, "endDate");
  const expectedReturnDate = formString(formData, "expectedReturnDate");
  const actualReturnDate = formString(formData, "actualReturnDate");
  const description = formString(formData, "description");
  if (!playerId || !startDate || !description) redirect(playerPath(playerId, "details"));
  if (endDate && endDate < startDate) redirect(playerPathWithError(playerId, "End date cannot be before the start date."));
  if (actualReturnDate && actualReturnDate < startDate) redirect(playerPathWithError(playerId, "Actual return date cannot be before the start date."));
  if (description.length > 160) redirect(playerPathWithError(playerId, "Keep the injury or sickness description under 160 characters."));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const type = formString(formData, "type") === "sick" ? "sick" : "injured";
  const status = statusValue(formString(formData, "status"));
  const { error } = await db.from("player_medical_periods").insert({
    user_id: user.id,
    player_id: playerId,
    type,
    start_date: startDate,
    end_date: optional(endDate),
    expected_return_date: optional(expectedReturnDate),
    actual_return_date: optional(actualReturnDate),
    description,
    notes: optional(formString(formData, "notes")),
    status
  });
  if (error) redirect(playerPathWithError(playerId, "Medical period could not be saved. Please check the dates and try again."));
  await syncPlayerAvailabilityToFutureTrainings(db, user.id, playerId);
  revalidatePlayer(playerId);
  revalidatePath("/squad/attendance");
  revalidatePath("/trainings");
  redirect(formString(formData, "returnTo") || playerPath(playerId, "details"));
}

export async function updatePlayerMedicalPeriodStatus(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const periodId = formString(formData, "periodId");
  const actualReturnDate = formString(formData, "actualReturnDate");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  if (actualReturnDate) {
    const { data: existing } = await db.from("player_medical_periods").select("start_date").eq("id", periodId).eq("player_id", playerId).eq("user_id", user.id).maybeSingle();
    if (existing?.start_date && actualReturnDate < existing.start_date) redirect(playerPathWithError(playerId, "Actual return date cannot be before the start date."));
  }
  const { error } = await db
    .from("player_medical_periods")
    .update({
      status: statusValue(formString(formData, "status")),
      actual_return_date: optional(actualReturnDate)
    })
    .eq("id", periodId)
    .eq("player_id", playerId)
    .eq("user_id", user.id);
  if (error) redirect(playerPathWithError(playerId, "Medical period could not be updated. Please try again."));
  await syncPlayerAvailabilityToFutureTrainings(db, user.id, playerId);
  revalidatePlayer(playerId);
  revalidatePath("/squad/attendance");
  revalidatePath("/trainings");
  redirect(formString(formData, "returnTo") || playerPath(playerId, "medical"));
}

export async function updatePlayerMedicalPeriodDetails(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const periodId = formString(formData, "periodId");
  const description = formString(formData, "description");
  const expectedReturnDate = formString(formData, "expectedReturnDate");
  const notes = formString(formData, "notes");
  if (!playerId || !periodId || !description) redirect(playerPathWithError(playerId, "Description is required."));
  if (description.length > 160) redirect(playerPathWithError(playerId, "Keep the injury or sickness description under 160 characters."));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: existing } = await db
    .from("player_medical_periods")
    .select("start_date")
    .eq("id", periodId)
    .eq("player_id", playerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.start_date && expectedReturnDate && expectedReturnDate < existing.start_date) {
    redirect(playerPathWithError(playerId, "Expected return cannot be before the start date."));
  }

  const { error } = await db
    .from("player_medical_periods")
    .update({
      expected_return_date: optional(expectedReturnDate),
      description,
      notes: optional(notes)
    })
    .eq("id", periodId)
    .eq("player_id", playerId)
    .eq("user_id", user.id);
  if (error) redirect(playerPathWithError(playerId, "Medical period could not be updated. Please try again."));
  await syncPlayerAvailabilityToFutureTrainings(db, user.id, playerId);
  revalidatePlayer(playerId);
  revalidatePath("/squad/attendance");
  revalidatePath("/trainings");
  redirect(formString(formData, "returnTo") || playerPath(playerId, "medical"));
}

function relationshipValue(value: string) {
  return value === "mother" || value === "father" || value === "guardian" || value === "emergency" || value === "other" ? value : "parent";
}

function statusValue(value: string) {
  return value === "completed" || value === "cancelled" ? value : "active";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function createPlayerAvailabilityPeriod(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const startsOn = formString(formData, "startsOn");
  const endsOn = formString(formData, "endsOn") || startsOn;
  const note = formString(formData, "note");
  const reason = absenceReasonValue(formString(formData, "reason"));
  if (!playerId || !startsOn) redirect(playerPathWithError(playerId, "Start date is required."));
  if (endsOn && endsOn < startsOn) redirect(playerPathWithError(playerId, "Until date cannot be before the start date."));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: player, error: playerError } = await db.from("squad_players").select("squad_id").eq("id", playerId).eq("user_id", user.id).maybeSingle();
  if (playerError || !player) redirect(playerPathWithError(playerId, "Player was not found."));

  if (reason === "injured" || reason === "sick") {
    const { error } = await db.from("player_medical_periods").insert({
      user_id: user.id,
      player_id: playerId,
      type: reason,
      start_date: startsOn,
      end_date: optional(endsOn),
      description: note || playerAbsenceReasonLabels[reason],
      notes: optional(note),
      status: "active"
    });
    if (error) redirect(playerPathWithError(playerId, "Medical absence could not be saved."));
  } else {
    const { error } = await db.from("player_availability_periods").insert({
      user_id: user.id,
      player_id: playerId,
      squad_id: player.squad_id ?? null,
      reason,
      starts_on: startsOn,
      ends_on: optional(endsOn),
      note: optional(note),
      status: "active"
    });
    if (error) redirect(playerPathWithError(playerId, "Absence could not be saved."));
  }

  await syncPlayerAvailabilityToFutureTrainings(db, user.id, playerId);
  revalidatePlayer(playerId);
  revalidatePath("/squad/attendance");
  revalidatePath("/trainings");
  revalidatePath("/dashboard");
  redirect(formString(formData, "returnTo") || playerPath(playerId, "medical"));
}

export async function deletePlayerAvailabilityPeriod(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const periodId = formString(formData, "periodId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("player_availability_periods")
    .update({ status: "cancelled" })
    .eq("id", periodId)
    .eq("player_id", playerId)
    .eq("user_id", user.id);
  if (error) redirect(playerPathWithError(playerId, "Absence could not be deleted."));
  await syncPlayerAvailabilityToFutureTrainings(db, user.id, playerId);
  revalidatePlayer(playerId);
  revalidatePath("/squad/attendance");
  revalidatePath("/trainings");
  revalidatePath("/dashboard");
  redirect(formString(formData, "returnTo") || playerPath(playerId, "medical"));
}

function absenceReasonValue(value: string): PlayerAbsenceReason {
  return value === "sick" || value === "school" || value === "work" || value === "holiday" || value === "private" || value === "other" ? value : "injured";
}
