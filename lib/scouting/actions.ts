"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { asScoutingDb, type ScoutingDb } from "@/lib/scouting/db";
import { syncFutureAutoSyncTrainingsForPlayer } from "@/lib/squad/attendance-actions";
import { formText, observationPayload, playerPayload, targetPayload, validDate } from "@/lib/scouting/validation";
import type { ScoutingHistoryRow, ScoutingPlayerRow } from "@/types/database";

export type ScoutingFormState = { error?: string; duplicates?: Array<{ id: string; name: string; kind: "scouting" | "squad" }> };

async function requireScoutingUser() {
  const db = asScoutingDb(await createClient());
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  return { db, userId: user.id };
}

async function logHistory(db: ScoutingDb, userId: string, playerId: string, eventType: ScoutingHistoryRow["event_type"], detail?: string) {
  await db.from("scouting_history").insert({ user_id: userId, player_id: playerId, event_type: eventType, detail: detail ?? null });
}

function samePerson(a: { first_name: string; last_name: string | null; date_of_birth: string | null; current_club?: string | null }, b: { first_name: string; last_name: string | null; date_of_birth: string | null; current_club?: string | null }) {
  const normalize = (value?: string | null) => (value ?? "").trim().toLocaleLowerCase("de");
  if (normalize(a.first_name) !== normalize(b.first_name) || normalize(a.last_name) !== normalize(b.last_name)) return false;
  if (a.date_of_birth && b.date_of_birth) return a.date_of_birth === b.date_of_birth;
  return Boolean(a.current_club && b.current_club && normalize(a.current_club) === normalize(b.current_club));
}

async function findDuplicates(db: ScoutingDb, userId: string, candidate: ReturnType<typeof playerPayload>) {
  const [scouting, squad] = await Promise.all([
    db.from("scouting_players").select("id,first_name,last_name,date_of_birth,current_club").eq("user_id", userId).limit(1000),
    db.from("squad_players").select("id,first_name,last_name,date_of_birth,club").eq("user_id", userId).is("deleted_at", null).limit(1000)
  ]);
  if (scouting.error || squad.error) throw new Error(scouting.error?.message ?? squad.error?.message);
  const prospectMatches = (scouting.data ?? []).filter((row) => samePerson(row, candidate)).map((row) => ({
    id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(" "), kind: "scouting" as const
  }));
  const squadMatches = (squad.data ?? []).filter((row) => samePerson({ ...row, current_club: row.club }, candidate)).map((row) => ({
    id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(" "), kind: "squad" as const
  }));
  return [...prospectMatches, ...squadMatches];
}

export async function createScoutingPlayer(_: ScoutingFormState, form: FormData): Promise<ScoutingFormState> {
  try {
    const payload = playerPayload(form);
    if (payload.status === "added_to_squad") return { error: "Invite the prospect to a team before marking them as added." };
    const { db, userId } = await requireScoutingUser();
    const duplicates = await findDuplicates(db, userId, payload);
    if (duplicates.length && formText(form, "confirmDuplicate") !== "yes") return { duplicates };
    const { data, error } = await db.from("scouting_players").insert({ user_id: userId, ...payload }).select("id").single();
    if (error) return { error: error.message };
    await logHistory(db, userId, data.id, "created");
    revalidatePath("/scouting");
    redirect(`/scouting/players/${data.id}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: message(error) };
  }
}

export async function updateScoutingPlayer(playerId: string, _: ScoutingFormState, form: FormData): Promise<ScoutingFormState> {
  try {
    const payload = playerPayload(form);
    const { db, userId } = await requireScoutingUser();
    const { data: current, error: loadError } = await db.from("scouting_players").select("status,linked_squad_player_id").eq("id", playerId).eq("user_id", userId).maybeSingle();
    if (loadError) return { error: loadError.message };
    if (!current) return { error: "Prospect not found." };
    if (payload.status === "added_to_squad" && !current.linked_squad_player_id) return { error: "This prospect is not linked to a squad player." };
    const { error } = await db.from("scouting_players").update(payload).eq("id", playerId).eq("user_id", userId);
    if (error) return { error: error.message };
    if (current.status !== payload.status) await logHistory(db, userId, playerId, payload.status === "archived" ? "archived" : payload.status === "added_to_squad" ? "added_to_squad" : "status_changed", payload.status);
    revalidatePath("/scouting");
    revalidatePath(`/scouting/players/${playerId}`);
    redirect(`/scouting/players/${playerId}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: message(error) };
  }
}

export async function createScoutingObservation(playerId: string, _: ScoutingFormState, form: FormData): Promise<ScoutingFormState> {
  return saveObservation(playerId, null, form);
}

export async function updateScoutingObservation(playerId: string, observationId: string, _: ScoutingFormState, form: FormData): Promise<ScoutingFormState> {
  return saveObservation(playerId, observationId, form);
}

async function saveObservation(playerId: string, observationId: string | null, form: FormData): Promise<ScoutingFormState> {
  try {
    const payload = observationPayload(form);
    const { db, userId } = await requireScoutingUser();
    const { data: player } = await db.from("scouting_players").select("id").eq("id", playerId).eq("user_id", userId).maybeSingle();
    if (!player) return { error: "Prospect not found." };
    if (observationId) {
      const { data, error } = await db.from("scouting_observations").update(payload).eq("id", observationId).eq("player_id", playerId).eq("user_id", userId).select("id").maybeSingle();
      if (error || !data) return { error: error?.message ?? "Observation not found." };
    } else {
      const { error } = await db.from("scouting_observations").insert({ ...payload, user_id: userId, player_id: playerId });
      if (error) return { error: error.message };
      await logHistory(db, userId, playerId, "observation_added", payload.observed_on);
    }
    revalidatePath("/scouting");
    revalidatePath(`/scouting/players/${playerId}`);
    redirect(`/scouting/players/${playerId}?tab=observations`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: message(error) };
  }
}

export async function createScoutingTarget(_: ScoutingFormState, form: FormData): Promise<ScoutingFormState> {
  return saveTarget(null, form);
}

export async function updateScoutingTarget(targetId: string, _: ScoutingFormState, form: FormData): Promise<ScoutingFormState> {
  return saveTarget(targetId, form);
}

async function saveTarget(targetId: string | null, form: FormData): Promise<ScoutingFormState> {
  try {
    const payload = targetPayload(form);
    const { db, userId } = await requireScoutingUser();
    if (payload.squad_id) {
      const { data: squad, error } = await db.from("squads").select("id").eq("id", payload.squad_id).eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (error || !squad) return { error: error?.message ?? "Target team is not available." };
    }
    let id = targetId;
    if (id) {
      const { data, error } = await db.from("scouting_targets").update(payload).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
      if (error || !data) return { error: error?.message ?? "Target not found." };
    } else {
      const { data, error } = await db.from("scouting_targets").insert({ user_id: userId, ...payload }).select("id").single();
      if (error) return { error: error.message };
      id = data.id;
    }
    revalidatePath("/scouting");
    redirect(`/scouting/targets/${id}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: message(error) };
  }
}

export async function linkScoutingTarget(form: FormData) {
  const playerId = formText(form, "playerId", 36);
  const targetId = formText(form, "targetId", 36);
  const { db, userId } = await requireScoutingUser();
  const [player, target] = await Promise.all([
    db.from("scouting_players").select("id").eq("id", playerId).eq("user_id", userId).maybeSingle(),
    db.from("scouting_targets").select("id,title").eq("id", targetId).eq("user_id", userId).maybeSingle()
  ]);
  if (player.error || target.error || !player.data || !target.data) throw new Error("Player or target not found.");
  const { data, error } = await db.from("scouting_target_players").upsert({ user_id: userId, player_id: playerId, target_id: targetId }, { onConflict: "target_id,player_id", ignoreDuplicates: true }).select("player_id");
  if (error) throw new Error(error.message);
  if (data?.length) await logHistory(db, userId, playerId, "target_linked", target.data.title);
  revalidatePath("/scouting");
  revalidatePath(`/scouting/players/${playerId}`);
  revalidatePath(`/scouting/targets/${targetId}`);
}

export async function unlinkScoutingTarget(form: FormData) {
  const playerId = formText(form, "playerId", 36);
  const targetId = formText(form, "targetId", 36);
  const { db, userId } = await requireScoutingUser();
  const { data, error } = await db.from("scouting_target_players").delete().eq("user_id", userId).eq("player_id", playerId).eq("target_id", targetId).select("player_id");
  if (error) throw new Error(error.message);
  if (data?.length) await logHistory(db, userId, playerId, "target_removed");
  revalidatePath("/scouting");
  revalidatePath(`/scouting/players/${playerId}`);
  revalidatePath(`/scouting/targets/${targetId}`);
}

export async function inviteScoutingPlayerToTrial(playerId: string, _: ScoutingFormState, form: FormData): Promise<ScoutingFormState> {
  try {
    const squadId = formText(form, "squadId", 36);
    const startDate = formText(form, "startDate", 10);
    const durationMode = formText(form, "durationMode");
    const endDate = formText(form, "endDate", 10);
    const trainingLimit = Number(formText(form, "trainingLimit", 4));
    if (!squadId) return { error: "Choose a target team." };
    if (!validDate(startDate) || (durationMode === "end_date" && (!validDate(endDate) || endDate < startDate)) ||
      (durationMode === "training_count" && (!Number.isInteger(trainingLimit) || trainingLimit < 1 || trainingLimit > 100))) {
      return { error: "Check the trial start and duration." };
    }
    if (durationMode !== "end_date" && durationMode !== "training_count") return { error: "Choose a trial duration." };
    const { db, userId } = await requireScoutingUser();
    const [playerResult, teamResult] = await Promise.all([
      db.from("scouting_players").select("*").eq("id", playerId).eq("user_id", userId).maybeSingle(),
      db.from("squads").select("id").eq("id", squadId).eq("user_id", userId).is("archived_at", null).maybeSingle()
    ]);
    if (playerResult.error || teamResult.error || !playerResult.data || !teamResult.data) return { error: "Prospect or team not found." };
    const player: ScoutingPlayerRow = playerResult.data;
    if (player.linked_squad_player_id) return { error: "This prospect is already linked to a squad player." };
    const { data: squadPlayer, error: insertError } = await db.from("squad_players").insert({
      user_id: userId, squad_id: squadId, player_type: "trial",
      first_name: player.first_name, last_name: player.last_name,
      date_of_birth: player.date_of_birth, position: player.primary_position,
      secondary_positions: player.secondary_positions, strong_foot: player.strong_foot,
      club: player.current_club, height_cm: player.height_cm, weight_kg: player.weight_kg,
      scouting_source: player.source, trial_start_date: startDate,
      trial_duration_mode: durationMode, trial_training_limit: durationMode === "training_count" ? trainingLimit : null,
      trial_end_date: durationMode === "end_date" ? endDate : null
    }).select("id").single();
    if (insertError) return { error: insertError.message };
    const { data: linked, error: linkError } = await db.from("scouting_players")
      .update({ linked_squad_player_id: squadPlayer.id, status: "trial" })
      .eq("id", playerId).eq("user_id", userId).is("linked_squad_player_id", null).select("id").maybeSingle();
    if (linkError || !linked) {
      await db.from("squad_players").delete().eq("id", squadPlayer.id).eq("user_id", userId);
      return { error: linkError?.message ?? "This prospect was already invited." };
    }
    await logHistory(db, userId, playerId, "invited_to_trial");
    await syncFutureAutoSyncTrainingsForPlayer(db as unknown as SupabaseClient, userId, squadPlayer.id);
    revalidatePath("/scouting");
    revalidatePath("/squad");
    redirect(`/scouting/players/${playerId}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: message(error) };
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Could not save."; }
function isRedirect(error: unknown) { return error instanceof Error && "digest" in error && String((error as Error & { digest?: string }).digest).startsWith("NEXT_REDIRECT"); }
