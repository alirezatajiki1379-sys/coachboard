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
  if (!playerId || !title) return;
  await assertPlayerOwner(supabase as unknown as SupabaseClient, userId, playerId);

  const category = isGoalCategory(formData.get("category")) ? formData.get("category") : "individual";
  const priority = isGoalPriority(formData.get("priority")) ? formData.get("priority") : "medium";
  const status = isGoalStatus(formData.get("status")) ? formData.get("status") : "active";
  const progress = isGoalProgress(formData.get("progress")) ? formData.get("progress") : "in_progress";

  await (supabase as unknown as SupabaseClient).from("player_development_goals").insert({
    user_id: userId,
    player_id: playerId,
    title,
    description: nullableString(formData.get("description")),
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

  await (supabase as unknown as SupabaseClient)
    .from("player_development_goals")
    .update({
      status,
      progress,
      review_date: nullableString(formData.get("reviewDate")),
      completed_at: status === "completed" && !goal.completed_at ? new Date().toISOString() : status !== "completed" ? null : goal.completed_at
    })
    .eq("user_id", userId)
    .eq("id", goalId);

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
  if (goalId) await assertGoalOwner(supabase as unknown as SupabaseClient, userId, goalId);

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
  const { data, error } = await supabase.from("squad_players").select("id").eq("user_id", userId).eq("id", playerId).maybeSingle();
  if (error || !data) throw new Error("Player not found.");
}

async function assertGoalOwner(supabase: SupabaseClient, userId: string, goalId: string) {
  const { data, error } = await supabase.from("player_development_goals").select("id, player_id, status, progress, completed_at").eq("user_id", userId).eq("id", goalId).maybeSingle();
  if (error || !data) throw new Error("Development goal not found.");
  return data as { id: string; player_id: string; status: string; progress: string; completed_at: string | null };
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
