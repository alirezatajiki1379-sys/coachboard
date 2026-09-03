"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isGoalCategory, isGoalPriority, isGoalProgress, isGoalStatus } from "@/lib/squad/development";

export async function createDevelopmentGoal(formData: FormData) {
  const supabase = await createClient();
  const userId = await requireUserId(supabase as unknown as SupabaseClient);
  const playerId = stringValue(formData.get("playerId"));
  const title = stringValue(formData.get("title"));
  const successCriteria = stringValue(formData.get("successCriteria"));
  if (!playerId || !title || !successCriteria) return;
  const player = await assertPlayerOwner(supabase as unknown as SupabaseClient, userId, playerId);

  const category = isGoalCategory(formData.get("category")) ? formData.get("category") : "technical";
  const priority = isGoalPriority(formData.get("priority")) ? formData.get("priority") : "medium";
  const status = isGoalStatus(formData.get("status")) ? formData.get("status") : "in_progress";
  const progress = isGoalProgress(formData.get("progress")) ? formData.get("progress") : "developing";

  await (supabase as unknown as SupabaseClient).from("player_development_goals").insert({
    user_id: userId,
    squad_id: player.squad_id,
    player_id: playerId,
    title: title.slice(0, 120),
    description: nullableString(formData.get("description")),
    success_criteria: successCriteria,
    coach_notes: nullableString(formData.get("coachNotes")),
    category,
    priority,
    status,
    progress,
    start_date: stringValue(formData.get("startDate")) || new Date().toISOString().slice(0, 10),
    target_date: nullableString(formData.get("targetDate")),
    review_date: nullableString(formData.get("reviewDate"))
  });

  revalidateDevelopment(playerId);
}

export async function updateDevelopmentGoal(formData: FormData) {
  const supabase = await createClient();
  const userId = await requireUserId(supabase as unknown as SupabaseClient);
  const goalId = stringValue(formData.get("goalId"));
  if (!goalId) return;
  const goal = await assertGoalOwner(supabase as unknown as SupabaseClient, userId, goalId);
  const status = isGoalStatus(formData.get("status")) ? formData.get("status") : goal.status;
  const progress = isGoalProgress(formData.get("progress")) ? formData.get("progress") : goal.progress;
  const title = stringValue(formData.get("title"));
  const successCriteria = stringValue(formData.get("successCriteria"));

  await (supabase as unknown as SupabaseClient)
    .from("player_development_goals")
    .update({
      ...(title ? { title: title.slice(0, 120) } : {}),
      ...(isGoalCategory(formData.get("category")) ? { category: formData.get("category") } : {}),
      ...(isGoalPriority(formData.get("priority")) ? { priority: formData.get("priority") } : {}),
      ...(successCriteria ? { success_criteria: successCriteria } : {}),
      coach_notes: formData.has("coachNotes") ? nullableString(formData.get("coachNotes")) : goal.coach_notes,
      status,
      progress,
      target_date: nullableString(formData.get("targetDate")),
      review_date: nullableString(formData.get("reviewDate")),
      completed_at: status === "achieved" && !goal.completed_at ? new Date().toISOString() : status !== "achieved" ? null : goal.completed_at,
      achieved_at: status === "achieved" && !goal.achieved_at ? new Date().toISOString() : status !== "achieved" ? null : goal.achieved_at
    })
    .eq("user_id", userId)
    .eq("id", goalId);

  revalidateDevelopment(goal.player_id);
}

export async function createDevelopmentProgressUpdate(formData: FormData) {
  const supabase = await createClient();
  const db = supabase as unknown as SupabaseClient;
  const userId = await requireUserId(db);
  const goalId = stringValue(formData.get("goalId"));
  const note = stringValue(formData.get("note"));
  const progressLevel = isGoalProgress(formData.get("progressLevel")) ? formData.get("progressLevel") : "developing";
  if (!goalId || !note) return;
  const goal = await assertGoalOwner(db, userId, goalId);
  const trainingEventId = nullableString(formData.get("trainingEventId"));
  if (trainingEventId) await assertTrainingOwner(db, userId, trainingEventId, goal.squad_id);

  await db.from("player_development_progress").insert({
    user_id: userId,
    squad_id: goal.squad_id,
    player_id: goal.player_id,
    goal_id: goalId,
    training_event_id: trainingEventId,
    progress_level: progressLevel,
    note,
    recorded_at: stringValue(formData.get("recordedAt")) || new Date().toISOString().slice(0, 10)
  });

  await db.from("player_development_goals").update({ progress: progressLevel }).eq("user_id", userId).eq("id", goalId);
  revalidateDevelopment(goal.player_id);
}

export async function createGoalAction(formData: FormData) {
  const supabase = await createClient();
  const userId = await requireUserId(supabase as unknown as SupabaseClient);
  const goalId = stringValue(formData.get("goalId"));
  const description = stringValue(formData.get("description"));
  if (!goalId || !description) return;
  const goal = await assertGoalOwner(supabase as unknown as SupabaseClient, userId, goalId);
  await (supabase as unknown as SupabaseClient).from("player_goal_actions").insert({
    user_id: userId,
    goal_id: goalId,
    description,
    due_date: nullableString(formData.get("dueDate")),
    notes: nullableString(formData.get("notes"))
  });
  revalidateDevelopment(goal.player_id);
}

export async function updateGoalActionCompletion(formData: FormData) {
  const supabase = await createClient();
  const userId = await requireUserId(supabase as unknown as SupabaseClient);
  const actionId = stringValue(formData.get("actionId"));
  if (!actionId) return;
  const { data } = await (supabase as unknown as SupabaseClient)
    .from("player_goal_actions")
    .select("id, goal_id, player_development_goals!inner(player_id)")
    .eq("user_id", userId)
    .eq("id", actionId)
    .maybeSingle();
  const row = data as { id: string; goal_id: string; player_development_goals?: { player_id: string } } | null;
  if (!row) return;
  await (supabase as unknown as SupabaseClient)
    .from("player_goal_actions")
    .update({ completed: formData.get("completed") === "on" })
    .eq("user_id", userId)
    .eq("id", actionId);
  revalidateDevelopment(row.player_development_goals?.player_id);
}

export async function createPlayerObservation(formData: FormData) {
  const supabase = await createClient();
  const userId = await requireUserId(supabase as unknown as SupabaseClient);
  const playerId = stringValue(formData.get("playerId"));
  const note = stringValue(formData.get("note"));
  if (!playerId || !note) return;
  await assertPlayerOwner(supabase as unknown as SupabaseClient, userId, playerId);
  const goalId = nullableString(formData.get("goalId"));
  if (goalId) {
    const goal = await assertGoalOwner(supabase as unknown as SupabaseClient, userId, goalId);
    if (goal.player_id !== playerId) throw new Error("Development goal does not belong to this player.");
  }

  const category = isGoalCategory(formData.get("category")) ? formData.get("category") : null;
  const eventId = nullableString(formData.get("eventId"));
  await (supabase as unknown as SupabaseClient).from("player_observations").insert({
    user_id: userId,
    player_id: playerId,
    goal_id: goalId,
    event_id: eventId,
    observation_date: stringValue(formData.get("observationDate")) || new Date().toISOString().slice(0, 10),
    category,
    note
  });

  revalidateDevelopment(playerId);
  const returnTo = stringValue(formData.get("returnTo"));
  if (returnTo) redirect(returnTo);
}

async function requireUserId(supabase: SupabaseClient) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

async function assertPlayerOwner(supabase: SupabaseClient, userId: string, playerId: string) {
  const { data, error } = await supabase.from("squad_players").select("id,squad_id").eq("user_id", userId).eq("id", playerId).maybeSingle();
  if (error || !data) throw new Error("Player not found.");
  if (!data.squad_id) throw new Error("Player is not assigned to a Team.");
  return data as { id: string; squad_id: string };
}

async function assertGoalOwner(supabase: SupabaseClient, userId: string, goalId: string) {
  const { data, error } = await supabase.from("player_development_goals").select("id, player_id, squad_id, status, progress, completed_at, achieved_at, coach_notes").eq("user_id", userId).eq("id", goalId).maybeSingle();
  if (error || !data) throw new Error("Development goal not found.");
  return data as { id: string; player_id: string; squad_id: string; status: string; progress: string; completed_at: string | null; achieved_at: string | null; coach_notes: string | null };
}

async function assertTrainingOwner(supabase: SupabaseClient, userId: string, eventId: string, squadId: string) {
  const { data, error } = await supabase.from("squad_training_events").select("id").eq("user_id", userId).eq("id", eventId).eq("squad_id", squadId).maybeSingle();
  if (error || !data) throw new Error("Training not found.");
}

function revalidateDevelopment(playerId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/squad/development");
  revalidatePath("/squad/analysis");
  if (playerId) revalidatePath(`/squad/players/${playerId}`);
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: FormDataEntryValue | null) {
  const text = stringValue(value);
  return text || null;
}
