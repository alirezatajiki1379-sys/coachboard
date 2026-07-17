"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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

function eventPath(eventId: string, suffix = "") {
  return `/squad/attendance/${eventId}${suffix}`;
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
      status: "planned"
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
    .is("archived_at", null);
  if (playersError) throw new Error(playersError.message);

  const { data: existing, error: existingError } = await db
    .from("squad_event_attendance")
    .select("player_id")
    .eq("user_id", user.id)
    .eq("event_id", eventId);
  if (existingError) throw new Error(existingError.message);

  const existingIds = new Set((existing ?? []).map((row: { player_id: string | null }) => row.player_id).filter(Boolean));
  const rows = (players ?? [])
    .filter((player: { id: string }) => !existingIds.has(player.id))
    .map((player: { id: string }) => ({
      user_id: user.id,
      event_id: eventId,
      player_id: player.id,
      planned_status: "expected",
      status: "expected"
    }));

  if (rows.length) {
    const { error } = await db.from("squad_event_attendance").insert(rows);
    if (error) throw new Error(error.message);
  }

  revalidatePath(eventPath(eventId));
  redirect(eventPath(eventId));
}

export async function addTrialPlayerToEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const displayName = formString(formData, "displayName");
  if (!displayName) redirect(eventPath(eventId));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: trial, error: trialError } = await db
    .from("squad_trial_players")
    .insert({
      user_id: user.id,
      display_name: displayName,
      contact: optional(formString(formData, "contact")),
      notes: optional(formString(formData, "notes"))
    })
    .select("id")
    .single();
  if (trialError) throw new Error(trialError.message);

  const { error } = await db.from("squad_event_attendance").insert({
    user_id: user.id,
    event_id: eventId,
    trial_player_id: trial.id,
    planned_status: "expected",
    status: "expected"
  });
  if (error) throw new Error(error.message);

  revalidatePath(eventPath(eventId));
  redirect(eventPath(eventId));
}

export async function updateAttendanceStatus(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const status = formString(formData, "status");
  if (!["expected", "unavailable", "unclear", "present", "absent"].includes(status)) redirect(eventPath(eventId));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const plannedStatus = status === "present" || status === "absent" ? undefined : status;
  const { error } = await db
    .from("squad_event_attendance")
    .update({
      status,
      ...(plannedStatus ? { planned_status: plannedStatus } : {})
    })
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath(eventPath(eventId));
  revalidatePath(eventPath(eventId, "/check-in"));
  redirect(formString(formData, "returnTo") || eventPath(eventId));
}

export async function updateAttendanceRating(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const rating = numberOrNull(formString(formData, "rating"));
  const effortRating = numberOrNull(formString(formData, "effortRating"));
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_event_attendance")
    .update({
      rating,
      effort_rating: effortRating,
      notes: optional(formString(formData, "notes"))
    })
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath(eventPath(eventId));
  revalidatePath(eventPath(eventId, "/ratings"));
  redirect(eventPath(eventId, "/ratings"));
}

export async function completeTrainingEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_training_events")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/squad/attendance");
  revalidatePath(eventPath(eventId));
  redirect(eventPath(eventId));
}

export async function convertTrialPlayerToSquadPlayer(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const trialPlayerId = formString(formData, "trialPlayerId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: trial, error: trialError } = await db
    .from("squad_trial_players")
    .select("*")
    .eq("id", trialPlayerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (trialError) throw new Error(trialError.message);
  if (!trial) redirect(eventPath(eventId));

  const { data: player, error: playerError } = await db
    .from("squad_players")
    .insert({
      user_id: user.id,
      first_name: trial.display_name,
      notes: trial.notes,
      player_phone: trial.contact
    })
    .select("id")
    .single();
  if (playerError) throw new Error(playerError.message);

  const { error: trialUpdateError } = await db
    .from("squad_trial_players")
    .update({ converted_player_id: player.id })
    .eq("id", trialPlayerId)
    .eq("user_id", user.id);
  if (trialUpdateError) throw new Error(trialUpdateError.message);

  revalidatePath("/squad");
  revalidatePath(eventPath(eventId));
  redirect(eventPath(eventId));
}

function numberOrNull(value: string) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 5) : null;
}
