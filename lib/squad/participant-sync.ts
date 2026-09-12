import type { SupabaseClient } from "@supabase/supabase-js";

type EligiblePlayerRow = {
  id: string;
  player_type: "roster" | "trial";
  converted_at: string | null;
  trial_start_date: string | null;
  trial_duration_mode: "training_count" | "end_date" | null;
  trial_training_limit: number | null;
  trial_end_date: string | null;
};

type TrainingCountEventRow = {
  id: string;
  date: string;
};

export async function currentEligibleSquadPlayerIds(db: SupabaseClient, userId: string, eventDate: string, squadId?: string | null) {
  let query = db
    .from("squad_players")
    .select("id,player_type,converted_at,trial_start_date,trial_duration_mode,trial_training_limit,trial_end_date")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null);
  if (squadId) query = query.eq("squad_id", squadId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const players = (data ?? []) as EligiblePlayerRow[];
  const rosterIds = players.filter((player) => player.player_type === "roster").map((player) => player.id);
  const trialPlayers = players.filter((player) => player.player_type === "trial" && !player.converted_at);
  if (!trialPlayers.length) return Array.from(new Set(rosterIds));

  const trainingCountEvents = await loadTrainingCountEvents(db, userId, eventDate, squadId, trialPlayers);
  const trialIds = trialPlayers
    .filter((player) => isTrialPlayerEligibleForDate(player, eventDate, trainingCountEvents))
    .map((player) => player.id);

  return Array.from(new Set([...rosterIds, ...trialIds]));
}

function isTrialPlayerEligibleForDate(player: EligiblePlayerRow, eventDate: string, trainingCountEvents: TrainingCountEventRow[]) {
  if (player.trial_start_date && eventDate < player.trial_start_date) return false;

  if (player.trial_duration_mode === "end_date") {
    if (player.trial_end_date && eventDate > player.trial_end_date) return false;
    return true;
  }

  if (player.trial_duration_mode === "training_count" && player.trial_training_limit && player.trial_training_limit > 0) {
    const startDate = player.trial_start_date ?? "0000-01-01";
    const eligibleEvents = trainingCountEvents.filter((event) => event.date >= startDate && event.date <= eventDate);
    return eligibleEvents.length <= player.trial_training_limit;
  }

  if (player.trial_end_date && eventDate > player.trial_end_date) return false;
  return true;
}

async function loadTrainingCountEvents(
  db: SupabaseClient,
  userId: string,
  eventDate: string,
  squadId: string | null | undefined,
  trialPlayers: EligiblePlayerRow[]
) {
  const trainingCountTrials = trialPlayers.filter((player) => player.trial_duration_mode === "training_count" && player.trial_training_limit && player.trial_training_limit > 0);
  if (!trainingCountTrials.length) return [];
  const startDates = trainingCountTrials.map((player) => player.trial_start_date).filter((date): date is string => Boolean(date));
  const minStartDate = startDates.length ? startDates.sort()[0] : "0000-01-01";

  let query = db
    .from("squad_training_events")
    .select("id,date")
    .eq("user_id", userId)
    .eq("participant_source_mode", "current_squad_sync")
    .is("deleted_at", null)
    .gte("date", minStartDate)
    .lte("date", eventDate)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (squadId) query = query.eq("squad_id", squadId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as TrainingCountEventRow[];
}
