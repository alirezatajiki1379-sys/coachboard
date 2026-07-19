"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { latestApplicableMedicalPeriod, medicalReasonForType } from "@/lib/squad/player-hub";
import { mapPlayerMedicalPeriodRow, type PlayerMedicalPeriodRow } from "@/lib/squad/mappers";
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
  await syncAutomaticMedicalAttendance(db, user.id, playerId);
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
  await syncAutomaticMedicalAttendance(db, user.id, playerId);
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
  await syncAutomaticMedicalAttendance(db, user.id, playerId);
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

async function syncAutomaticMedicalAttendance(db: SupabaseClient, userId: string, playerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [medicalResult, attendanceResult] = await Promise.all([
    db.from("player_medical_periods").select("*").eq("user_id", userId).eq("player_id", playerId).eq("status", "active"),
    db
      .from("squad_attendance_records")
      .select("id, planned_status_source, final_status, squad_training_events!inner(date,status)")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .is("final_status", null)
  ]);
  if (medicalResult.error || attendanceResult.error) return;

  const medicalPeriods = ((medicalResult.data ?? []) as PlayerMedicalPeriodRow[]).map(mapPlayerMedicalPeriodRow);
  const updates = ((attendanceResult.data ?? []) as unknown as Array<{
    id: string;
    planned_status_source: "default" | "manual" | "medical" | null;
    final_status: string | null;
    squad_training_events?: { date: string; status: string } | { date: string; status: string }[] | null;
  }>).filter((record) => {
    const event = Array.isArray(record.squad_training_events) ? record.squad_training_events[0] : record.squad_training_events;
    return Boolean(event && event.date >= today && event.status !== "completed" && record.planned_status_source !== "manual");
  }).map((record) => {
    const event = Array.isArray(record.squad_training_events) ? record.squad_training_events[0] : record.squad_training_events;
    const eventDate = event?.date ?? "";
    const activeMedical = latestApplicableMedicalPeriod(medicalPeriods, eventDate);
    return db
      .from("squad_attendance_records")
      .update(activeMedical ? {
        planned_status: "unavailable",
        planned_reason: medicalReasonForType(activeMedical.type),
        planned_reason_note: activeMedical.description,
        planned_status_source: "medical"
      } : {
        planned_status: "expected",
        planned_reason: null,
        planned_reason_note: null,
        planned_status_source: "default"
      })
      .eq("id", record.id)
      .eq("user_id", userId);
  });
  await Promise.all(updates);
}
