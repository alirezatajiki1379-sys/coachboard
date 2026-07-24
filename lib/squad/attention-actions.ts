"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultAttentionPreferences,
  normalizeAttentionPreferences,
  type AttentionPreferences,
  type AttentionType
} from "@/lib/squad/attention";
import { createClient } from "@/lib/supabase/server";

const optionalRules: AttentionType[] = [
  "review-overdue",
  "training-review-incomplete",
  "training-plan-missing",
  "review-due",
  "no-recent-observation",
  "no-recent-rating",
  "declining-trend",
  "limited-evidence",
  "low-attendance",
  "repeated-lateness",
  "late-cancellation-pattern",
  "high-priority-goal-follow-up",
  "no-active-development-goal",
  "currently-unavailable",
  "trial-decision-open",
  "trial-duration-exceeded",
  "trial-insufficient-evidence",
  "missing-position",
  "missing-date-of-birth"
];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase: supabase as unknown as SupabaseClient, user };
}

function revalidateAttentionPaths(playerId?: string) {
  revalidatePath("/actions");
  revalidatePath("/dashboard");
  revalidatePath("/squad");
  if (playerId) revalidatePath(`/squad/players/${playerId}`);
}

export async function saveAttentionSettings(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = formString(formData, "returnTo") || "/actions";
  const preferences: AttentionPreferences = normalizeAttentionPreferences({
    version: 1,
    enabledRules: Object.fromEntries(optionalRules.map((rule) => [rule, formData.get(`rule:${rule}`) === "on"])),
    observationAgeDays: formString(formData, "observationAgeDays"),
    lowAttendancePercent: formString(formData, "lowAttendancePercent"),
    noRecentRatingTrainings: formString(formData, "noRecentRatingTrainings"),
    decliningTrendThreshold: formString(formData, "decliningTrendThreshold"),
    repeatedLatenessCount: formString(formData, "repeatedLatenessCount"),
    trialDurationDays: formString(formData, "trialDurationDays"),
    goalFollowUpDays: formString(formData, "goalFollowUpDays")
  });
  await supabase.from("coach_attention_preferences").upsert({ user_id: user.id, preferences }, { onConflict: "user_id" });
  revalidateAttentionPaths();
  redirect(returnTo);
}

export async function resetAttentionSettings(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = formString(formData, "returnTo") || "/actions";
  await supabase.from("coach_attention_preferences").upsert({ user_id: user.id, preferences: defaultAttentionPreferences }, { onConflict: "user_id" });
  revalidateAttentionPaths();
  redirect(returnTo);
}

export async function snoozeAttentionItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = formString(formData, "returnTo") || "/actions";
  const key = formString(formData, "attentionKey");
  const playerId = formString(formData, "playerId");
  const targetKind = formString(formData, "targetKind") || "player";
  const targetId = formString(formData, "targetId") || playerId;
  const attentionType = formString(formData, "attentionType");
  const until = snoozeDate(formString(formData, "snooze"));
  if (!key || !attentionType || !until || !targetId) redirect(returnTo);
  await supabase.from("coach_attention_states").upsert({
    user_id: user.id,
    attention_key: key,
    player_id: playerId || null,
    target_kind: targetKind === "training" ? "training" : "player",
    target_id: targetId,
    attention_type: attentionType,
    snoozed_until: until,
    dismissed_at: null,
    dismissal_reason: null,
    resolved_at: null
  }, { onConflict: "user_id,attention_key" });
  revalidateAttentionPaths(playerId);
  redirect(returnTo);
}

export async function dismissAttentionItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = formString(formData, "returnTo") || "/actions";
  const key = formString(formData, "attentionKey");
  const playerId = formString(formData, "playerId");
  const targetKind = formString(formData, "targetKind") || "player";
  const targetId = formString(formData, "targetId") || playerId;
  const attentionType = formString(formData, "attentionType");
  const reason = formString(formData, "reason");
  if (!key || !attentionType || !targetId) redirect(returnTo);
  const resolved = reason === "resolved";
  await supabase.from("coach_attention_states").upsert({
    user_id: user.id,
    attention_key: key,
    player_id: playerId || null,
    target_kind: targetKind === "training" ? "training" : "player",
    target_id: targetId,
    attention_type: attentionType,
    snoozed_until: null,
    dismissed_at: resolved ? null : new Date().toISOString(),
    dismissal_reason: reason === "not_relevant" ? "not_relevant" : resolved ? null : "dismissed",
    resolved_at: resolved ? new Date().toISOString() : null
  }, { onConflict: "user_id,attention_key" });
  revalidateAttentionPaths(playerId);
  redirect(returnTo);
}

export async function bulkUpdateAttentionItems(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = formString(formData, "returnTo") || "/actions";
  const operation = formString(formData, "operation");
  const snooze = snoozeDate(formString(formData, "snooze"));
  const now = new Date().toISOString();
  const items = formData.getAll("items")
    .map((value) => typeof value === "string" ? parseBulkItem(value) : null)
    .filter((item): item is NonNullable<ReturnType<typeof parseBulkItem>> => Boolean(item));
  if (!items.length) redirect(returnTo);
  const rows = items.map((item) => ({
    user_id: user.id,
    attention_key: item.key,
    player_id: item.playerId || null,
    target_kind: item.targetKind,
    target_id: item.targetId,
    attention_type: item.type,
    snoozed_until: operation === "snooze" ? snooze ?? addDays(3) : null,
    dismissed_at: operation === "dismiss" || operation === "not_relevant" ? now : null,
    dismissal_reason: operation === "not_relevant" ? "not_relevant" : operation === "dismiss" ? "dismissed" : null,
    resolved_at: operation === "resolved" ? now : null
  }));
  await supabase.from("coach_attention_states").upsert(rows, { onConflict: "user_id,attention_key" });
  revalidateAttentionPaths();
  redirect(returnTo);
}

export async function disableAttentionRule(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = formString(formData, "returnTo") || "/actions";
  const attentionType = formString(formData, "attentionType") as AttentionType;
  if (!optionalRules.includes(attentionType)) redirect(returnTo);
  const { data } = await supabase.from("coach_attention_preferences").select("preferences").eq("user_id", user.id).maybeSingle();
  const preferences = normalizeAttentionPreferences(data?.preferences);
  const nextPreferences: AttentionPreferences = {
    ...preferences,
    enabledRules: {
      ...preferences.enabledRules,
      [attentionType]: false
    }
  };
  await supabase.from("coach_attention_preferences").upsert({ user_id: user.id, preferences: nextPreferences }, { onConflict: "user_id" });
  revalidateAttentionPaths();
  redirect(returnTo);
}

export async function clearAttentionState(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = formString(formData, "returnTo") || "/actions";
  const key = formString(formData, "attentionKey");
  const playerId = formString(formData, "playerId");
  if (key) await supabase.from("coach_attention_states").delete().eq("user_id", user.id).eq("attention_key", key);
  revalidateAttentionPaths(playerId || undefined);
  redirect(returnTo);
}

function snoozeDate(value: string) {
  if (value === "tomorrow") return addDays(1);
  if (value === "3d") return addDays(3);
  if (value === "1w") return addDays(7);
  if (value === "2w") return addDays(14);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return undefined;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseBulkItem(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key : "";
    const type = typeof record.type === "string" ? record.type : "";
    const targetKind = record.targetKind === "training" ? "training" : "player";
    const targetId = typeof record.targetId === "string" ? record.targetId : "";
    const playerId = typeof record.playerId === "string" ? record.playerId : "";
    if (!key || !type || !targetId) return null;
    return { key, type, targetKind, targetId, playerId };
  } catch {
    return null;
  }
}
