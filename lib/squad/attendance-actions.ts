"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { calculateSuggestedOverallRating } from "@/lib/squad/attendance-utils";

export type TrainingEventActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"date" | "startTime" | "label", string>>;
  values?: {
    date: string;
    startTime: string;
    endTime: string;
    label: string;
    linkedTrainingSessionId: string;
    generalNotes: string;
  };
  submissionId?: number;
};

const plannedStatuses = ["expected", "unavailable", "unclear"] as const;
const plannedReasons = ["V", "K", "E", "P", "S", "Z", "U"] as const;
const finalStatuses = ["present", "Z", "V", "K", "E", "P", "S", "U"] as const;

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

function numberOrNull(value: string) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedRating(value: string) {
  const parsed = numberOrNull(value);
  return parsed && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function eventPath(eventId: string, suffix = "") {
  return `/squad/attendance/${eventId}${suffix}`;
}

function revalidateEvent(eventId: string) {
  revalidatePath("/squad");
  revalidatePath("/squad/attendance");
  revalidatePath("/squad/ratings");
  revalidatePath(eventPath(eventId));
  revalidatePath(eventPath(eventId, "/check-in"));
  revalidatePath(eventPath(eventId, "/ratings"));
}

export async function createTrainingEvent(_: TrainingEventActionState, formData: FormData): Promise<TrainingEventActionState> {
  const values = {
    date: formString(formData, "date"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    label: formString(formData, "label"),
    linkedTrainingSessionId: formString(formData, "linkedTrainingSessionId"),
    generalNotes: formString(formData, "generalNotes")
  };
  const fieldErrors: TrainingEventActionState["fieldErrors"] = {};
  if (!values.date) fieldErrors.date = "Choose the training date.";
  if (!values.startTime) fieldErrors.startTime = "Add the start time.";
  if (values.endTime && values.startTime && values.endTime < values.startTime) fieldErrors.startTime = "End time cannot be before the start time.";

  if (Object.keys(fieldErrors).length) {
    return { error: "Please fix the highlighted event details.", fieldErrors, values, submissionId: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("squad_training_events")
    .insert({
      user_id: user.id,
      date: values.date,
      start_time: values.startTime,
      end_time: optional(values.endTime),
      label: optional(values.label),
      linked_training_session_id: optional(values.linkedTrainingSessionId),
      general_notes: optional(values.generalNotes),
      status: "draft"
    })
    .select("id")
    .single();

  if (error) return { error: error.message, values, submissionId: Date.now() };

  revalidatePath("/squad/attendance");
  redirect(data?.id ? eventPath(data.id) : "/squad/attendance");
}

export async function addSquadPlayersToEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: players, error: playersError } = await db
    .from("squad_players")
    .select("id")
    .eq("user_id", user.id)
    .eq("player_type", "roster")
    .is("archived_at", null);
  if (playersError) throw new Error(playersError.message);

  const rows = ((players ?? []) as { id: string }[]).map((player) => ({
    user_id: user.id,
    event_id: eventId,
    player_id: player.id,
    planned_status: "expected"
  }));

  if (rows.length) {
    const { error } = await db.from("squad_attendance_records").upsert(rows, { onConflict: "event_id,player_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function addTrialPlayerToEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const displayName = formString(formData, "displayName");
  if (!displayName) redirect(eventPath(eventId));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: player, error: playerError } = await db
    .from("squad_players")
    .insert({
      user_id: user.id,
      player_type: "trial",
      first_name: displayName,
      player_phone: optional(formString(formData, "contact")),
      notes: optional(formString(formData, "notes"))
    })
    .select("id")
    .single();
  if (playerError) throw new Error(playerError.message);

  await upsertAttendanceRecord(db, user.id, eventId, player.id);
  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function addExistingTrialPlayerToEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const playerId = formString(formData, "playerId");
  if (!playerId) redirect(eventPath(eventId));
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: player, error: playerError } = await db
    .from("squad_players")
    .select("id")
    .eq("id", playerId)
    .eq("user_id", user.id)
    .eq("player_type", "trial")
    .is("converted_at", null)
    .maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (player) await upsertAttendanceRecord(db, user.id, eventId, player.id);

  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function removePlayerFromEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .delete()
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function updatePlannedAttendance(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const plannedStatus = formString(formData, "plannedStatus");
  if (!plannedStatuses.includes(plannedStatus as (typeof plannedStatuses)[number])) redirect(eventPath(eventId));
  const plannedReason = formString(formData, "plannedReason");
  const safeReason =
    plannedStatus === "unavailable" && plannedReasons.includes(plannedReason as (typeof plannedReasons)[number])
      ? plannedReason
      : null;

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({
      planned_status: plannedStatus,
      planned_reason: safeReason,
      planned_reason_note: plannedStatus === "unavailable" ? optional(formString(formData, "plannedReasonNote")) : null
    })
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(formString(formData, "returnTo") || eventPath(eventId));
}

export async function markAllExpected(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({ planned_status: "expected", planned_reason: null, planned_reason_note: null })
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function updateFinalAttendance(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const finalStatus = formString(formData, "finalStatus");
  if (!finalStatuses.includes(finalStatus as (typeof finalStatuses)[number])) redirect(eventPath(eventId));

  const lateMinutes = finalStatus === "Z" ? numberOrNull(formString(formData, "lateMinutes")) : null;
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({
      final_status: finalStatus,
      late_minutes: lateMinutes,
      late_penalty_applied: finalStatus === "Z" ? formData.get("latePenaltyApplied") !== "off" : true
    })
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventInProgress(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(formString(formData, "returnTo") || eventPath(eventId));
}

export async function markAllExpectedPresent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({ final_status: "present" })
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .is("final_status", null)
    .or("planned_status.is.null,planned_status.eq.expected");
  if (error) throw new Error(error.message);

  await markEventInProgress(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId, "/check-in"));
}

export async function markAllPresent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({ final_status: "present" })
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventInProgress(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId, "/check-in"));
}

export async function updateAttendanceRating(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const ratingTechnique = boundedRating(formString(formData, "ratingTechnique"));
  const ratingGameUnderstanding = boundedRating(formString(formData, "ratingGameUnderstanding"));
  const ratingIntensity = boundedRating(formString(formData, "ratingIntensity"));
  const ratingBehavior = boundedRating(formString(formData, "ratingBehavior"));
  const suggestion = calculateSuggestedOverallRating([ratingTechnique, ratingGameUnderstanding, ratingIntensity, ratingBehavior]);
  const overallRating = boundedRating(formString(formData, "overallRating"));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({
      overall_rating: overallRating,
      rating_technique: ratingTechnique,
      rating_game_understanding: ratingGameUnderstanding,
      rating_intensity: ratingIntensity,
      rating_behavior: ratingBehavior,
      rating_auto_suggestion: suggestion,
      coach_note: optional(formString(formData, "coachNote")),
      sensitive_note: formData.get("sensitiveNote") === "on"
    })
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventRatingOpen(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId, "/ratings"));
}

export async function completeTrainingEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: existing, error: existingError } = await db
    .from("squad_training_events")
    .select("completed_at")
    .eq("id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const { error } = await db
    .from("squad_training_events")
    .update({ status: "completed", completed_at: existing?.completed_at ?? new Date().toISOString() })
    .eq("id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function convertTrialPlayerToSquadPlayer(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const playerId = formString(formData, "playerId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_players")
    .update({ player_type: "roster", converted_at: new Date().toISOString() })
    .eq("id", playerId)
    .eq("user_id", user.id)
    .eq("player_type", "trial");
  if (error) throw new Error(error.message);

  revalidateEvent(eventId);
  revalidatePath("/squad");
  redirect(eventPath(eventId));
}

async function upsertAttendanceRecord(db: SupabaseClient, userId: string, eventId: string, playerId: string) {
  const { error } = await db
    .from("squad_attendance_records")
    .upsert(
      {
        user_id: userId,
        event_id: eventId,
        player_id: playerId,
        planned_status: "expected"
      },
      { onConflict: "event_id,player_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

async function markEventPrepared(db: SupabaseClient, userId: string, eventId: string) {
  await db.from("squad_training_events").update({ status: "prepared" }).eq("id", eventId).eq("user_id", userId).neq("status", "completed");
}

async function markEventInProgress(db: SupabaseClient, userId: string, eventId: string) {
  await db.from("squad_training_events").update({ status: "in_progress" }).eq("id", eventId).eq("user_id", userId).neq("status", "completed");
}

async function markEventRatingOpen(db: SupabaseClient, userId: string, eventId: string) {
  await db.from("squad_training_events").update({ status: "rating_open" }).eq("id", eventId).eq("user_id", userId).neq("status", "completed");
}
