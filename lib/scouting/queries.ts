import type { createClient } from "@/lib/supabase/server";
import { asScoutingDb } from "@/lib/scouting/db";
import type { ScoutingHistoryRow, ScoutingObservationRow, ScoutingPlayerRow, ScoutingTargetPlayerRow, ScoutingTargetRow } from "@/types/database";

type Db = Awaited<ReturnType<typeof createClient>>;

export type ScoutingListData = {
  players: ScoutingPlayerRow[];
  targets: ScoutingTargetRow[];
  links: ScoutingTargetPlayerRow[];
  lastObserved: Record<string, string>;
  recentlyObservedIds: string[];
};

export async function getScoutingListData(db: Db, userId: string): Promise<ScoutingListData> {
  const scoutingDb = asScoutingDb(db);
  const [playersResult, targetsResult, linksResult, observationsResult] = await Promise.all([
    scoutingDb.from("scouting_players").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1000),
    scoutingDb.from("scouting_targets").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(500),
    scoutingDb.from("scouting_target_players").select("*").eq("user_id", userId).limit(5000),
    scoutingDb.from("scouting_observations").select("player_id,observed_on").eq("user_id", userId).order("observed_on", { ascending: false }).limit(5000)
  ]);
  const error = playersResult.error ?? targetsResult.error ?? linksResult.error ?? observationsResult.error;
  if (error) throw new Error(error.message);
  const lastObserved: Record<string, string> = {};
  const recentlyObservedIds = new Set<string>();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  for (const row of observationsResult.data ?? []) {
    if (!lastObserved[row.player_id]) lastObserved[row.player_id] = row.observed_on;
    if (row.observed_on >= cutoffDate) recentlyObservedIds.add(row.player_id);
  }
  return {
    players: playersResult.data ?? [],
    targets: targetsResult.data ?? [],
    links: linksResult.data ?? [],
    lastObserved,
    recentlyObservedIds: [...recentlyObservedIds]
  };
}

export async function getScoutingPlayer(db: Db, userId: string, playerId: string) {
  const scoutingDb = asScoutingDb(db);
  const [playerResult, observationsResult, linksResult, historyResult, targetsResult] = await Promise.all([
    scoutingDb.from("scouting_players").select("*").eq("user_id", userId).eq("id", playerId).maybeSingle(),
    scoutingDb.from("scouting_observations").select("*").eq("user_id", userId).eq("player_id", playerId).order("observed_on", { ascending: false }).limit(300),
    scoutingDb.from("scouting_target_players").select("*").eq("user_id", userId).eq("player_id", playerId),
    scoutingDb.from("scouting_history").select("*").eq("user_id", userId).eq("player_id", playerId).order("created_at", { ascending: false }).limit(200),
    scoutingDb.from("scouting_targets").select("*").eq("user_id", userId).neq("status", "archived").order("title")
  ]);
  const error = playerResult.error ?? observationsResult.error ?? linksResult.error ?? historyResult.error ?? targetsResult.error;
  if (error) throw new Error(error.message);
  return playerResult.data ? {
    player: playerResult.data as ScoutingPlayerRow,
    observations: (observationsResult.data ?? []) as ScoutingObservationRow[],
    links: (linksResult.data ?? []) as ScoutingTargetPlayerRow[],
    history: (historyResult.data ?? []) as ScoutingHistoryRow[],
    targets: (targetsResult.data ?? []) as ScoutingTargetRow[]
  } : null;
}

export async function getScoutingTarget(db: Db, userId: string, targetId: string) {
  const scoutingDb = asScoutingDb(db);
  const [targetResult, linksResult, playersResult] = await Promise.all([
    scoutingDb.from("scouting_targets").select("*").eq("user_id", userId).eq("id", targetId).maybeSingle(),
    scoutingDb.from("scouting_target_players").select("*").eq("user_id", userId).eq("target_id", targetId),
    scoutingDb.from("scouting_players").select("*").eq("user_id", userId).neq("status", "archived").order("first_name").limit(1000)
  ]);
  const error = targetResult.error ?? linksResult.error ?? playersResult.error;
  if (error) throw new Error(error.message);
  return targetResult.data ? {
    target: targetResult.data as ScoutingTargetRow,
    links: (linksResult.data ?? []) as ScoutingTargetPlayerRow[],
    players: (playersResult.data ?? []) as ScoutingPlayerRow[]
  } : null;
}
