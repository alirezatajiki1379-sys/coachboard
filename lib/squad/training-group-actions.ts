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

function selectedValues(formData: FormData, key: string) {
  return Array.from(new Set(formData.getAll(key).filter((value): value is string => typeof value === "string" && Boolean(value))));
}

export async function createTrainingGroup(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const name = formString(formData, "name");
  const groupType = formString(formData, "groupType") === "label" ? "label" : "exclusive";
  if (!eventId || !name) redirect(eventId ? `/trainings/${eventId}` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedEvent(db, user.id, eventId);
  const { count } = await db.from("training_event_groups").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("user_id", user.id);
  const { error } = await db.from("training_event_groups").insert({
    user_id: user.id,
    event_id: eventId,
    name,
    group_type: groupType,
    sort_order: count ?? 0
  });
  if (error) throw new Error(error.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}`);
}

export async function addPlayersToTrainingGroup(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const groupId = formString(formData, "groupId");
  const playerIds = selectedValues(formData, "playerIds");
  if (!eventId || !groupId || !playerIds.length) redirect(eventId ? `/trainings/${eventId}` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedGroup(db, user.id, eventId, groupId);
  const validPlayerIds = await validateEventPlayers(db, user.id, eventId, playerIds);
  const { data: existingMembers, error: existingError } = await db
    .from("training_event_group_members")
    .select("player_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .in("player_id", validPlayerIds);
  if (existingError) throw new Error(existingError.message);
  const existingPlayerIds = new Set(
    ((existingMembers ?? []) as Array<{ player_id: string | null }>).map((member) => member.player_id).filter(Boolean) as string[]
  );
  const newPlayerIds = validPlayerIds.filter((playerId) => !existingPlayerIds.has(playerId));
  if (!newPlayerIds.length) redirect(`/trainings/${eventId}`);
  const { count } = await db.from("training_event_group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("user_id", user.id);
  const rows = newPlayerIds.map((playerId, index) => ({
    user_id: user.id,
    group_id: groupId,
    player_id: playerId,
    custom_name: null,
    sort_order: (count ?? 0) + index
  }));
  const { error } = await db.from("training_event_group_members").insert(rows);
  if (error) throw new Error(error.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}`);
}

export async function addPlayersToTrainingGroupInline(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const groupId = formString(formData, "groupId");
  const playerIds = selectedValues(formData, "playerIds");
  if (!eventId || !groupId || !playerIds.length) return { ok: false, message: "Choose a group and at least one Player." };
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedGroup(db, user.id, eventId, groupId);
  const validPlayerIds = await validateEventPlayers(db, user.id, eventId, playerIds);
  const { data: existingMembers, error: existingError } = await db
    .from("training_event_group_members")
    .select("player_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .in("player_id", validPlayerIds);
  if (existingError) throw new Error(existingError.message);
  const existingPlayerIds = new Set(
    ((existingMembers ?? []) as Array<{ player_id: string | null }>).map((member) => member.player_id).filter(Boolean) as string[]
  );
  const newPlayerIds = validPlayerIds.filter((playerId) => !existingPlayerIds.has(playerId));
  if (!newPlayerIds.length) return { ok: true, message: "Selected Players are already in this group." };
  const { count } = await db.from("training_event_group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("user_id", user.id);
  const rows = newPlayerIds.map((playerId, index) => ({
    user_id: user.id,
    group_id: groupId,
    player_id: playerId,
    custom_name: null,
    sort_order: (count ?? 0) + index
  }));
  const { error } = await db.from("training_event_group_members").insert(rows);
  if (error) throw new Error(error.message);
  revalidateTraining(eventId);
  return { ok: true, message: `${newPlayerIds.length} Player${newPlayerIds.length === 1 ? "" : "s"} added.` };
}

export async function createTrainingGroupWithPlayersInline(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const name = formString(formData, "name");
  const groupType = formString(formData, "groupType") === "label" ? "label" : "exclusive";
  const playerIds = selectedValues(formData, "playerIds");
  if (!eventId || !name) return { ok: false, message: "Enter a group name first." };
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedEvent(db, user.id, eventId);
  const { count } = await db.from("training_event_groups").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("user_id", user.id);
  const { data: group, error } = await db.from("training_event_groups").insert({
    user_id: user.id,
    event_id: eventId,
    name,
    group_type: groupType,
    sort_order: count ?? 0
  }).select("id").single();
  if (error) throw new Error(error.message);
  const groupId = (group as { id: string }).id;
  if (playerIds.length) {
    const validPlayerIds = await validateEventPlayers(db, user.id, eventId, playerIds);
    const rows = validPlayerIds.map((playerId, index) => ({
      user_id: user.id,
      group_id: groupId,
      player_id: playerId,
      custom_name: null,
      sort_order: index
    }));
    const { error: memberError } = await db.from("training_event_group_members").insert(rows);
    if (memberError) throw new Error(memberError.message);
  }
  revalidateTraining(eventId);
  return {
    ok: true,
    message: playerIds.length ? `${name} created and ${playerIds.length} Player${playerIds.length === 1 ? "" : "s"} added.` : `${name} created.`
  };
}

export async function addCustomNameToTrainingGroup(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const groupId = formString(formData, "groupId");
  const customName = formString(formData, "customName");
  if (!eventId || !groupId || !customName) redirect(eventId ? `/trainings/${eventId}` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedGroup(db, user.id, eventId, groupId);
  const { count } = await db.from("training_event_group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("user_id", user.id);
  const { error } = await db.from("training_event_group_members").insert({
    user_id: user.id,
    group_id: groupId,
    custom_name: customName,
    sort_order: count ?? 0
  });
  if (error) throw new Error(error.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}`);
}

export async function removeTrainingGroupMember(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const memberId = formString(formData, "memberId");
  if (!eventId || !memberId) redirect(eventId ? `/trainings/${eventId}` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("training_event_group_members").delete().eq("id", memberId).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}`);
}

export async function deleteTrainingGroup(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const groupId = formString(formData, "groupId");
  if (!eventId || !groupId) redirect(eventId ? `/trainings/${eventId}` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedGroup(db, user.id, eventId, groupId);
  const { error } = await db.from("training_event_groups").delete().eq("id", groupId).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}`);
}

async function assertOwnedEvent(db: SupabaseClient, userId: string, eventId: string) {
  const { data, error } = await db.from("squad_training_events").select("id").eq("id", eventId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Training not found.");
}

async function assertOwnedGroup(db: SupabaseClient, userId: string, eventId: string, groupId: string) {
  const { data, error } = await db.from("training_event_groups").select("id").eq("id", groupId).eq("event_id", eventId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Training group not found.");
}

async function validateEventPlayers(db: SupabaseClient, userId: string, eventId: string, playerIds: string[]) {
  const safeIds = Array.from(new Set(playerIds));
  const { data, error } = await db
    .from("squad_attendance_records")
    .select("player_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .in("player_id", safeIds);
  if (error) throw new Error(error.message);
  const validIds = ((data ?? []) as Array<{ player_id: string }>).map((row) => row.player_id);
  if (validIds.length !== safeIds.length) throw new Error("Some selected Players are not connected to this Training.");
  return validIds;
}

function revalidateTraining(eventId: string) {
  revalidatePath(`/trainings/${eventId}`);
  revalidatePath(`/squad/attendance/${eventId}`);
}
