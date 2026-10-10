import type { SupabaseClient } from "@supabase/supabase-js";
import { trainingNowParts } from "@/lib/trainings/utils";
import type { SquadPlayer } from "@/types/domain";

export type TrialTrainingEvent = {
  id: string;
  date: string;
  startTime: string;
};

export type TrialPeriodSummary = {
  status: "active" | "expired";
  mode: "training_count" | "end_date";
  currentEndDate?: string;
  trainingLimit?: number;
  completedTrainingCount: number;
  remainingTrainingCount?: number;
  extensionBaseCount: number;
  upcomingTrainingDates: string[];
  updatedAt: string;
};

type TrialPlayerFields = Pick<
  SquadPlayer,
  "playerType" | "trialStartDate" | "trialDurationMode" | "trialTrainingLimit" | "trialEndDate" | "updatedAt"
>;

type TrialPlayerRow = {
  id: string;
  squad_id: string | null;
  player_type: "roster" | "trial";
  trial_start_date: string | null;
  trial_duration_mode: "training_count" | "end_date" | null;
  trial_training_limit: number | null;
  trial_end_date: string | null;
  updated_at: string;
};

type TrialEventRow = {
  id: string;
  date: string;
  start_time: string;
};

export function calculateTrialPeriodSummary(
  player: TrialPlayerFields,
  events: TrialTrainingEvent[],
  now = trainingNowParts()
): TrialPeriodSummary | undefined {
  if (player.playerType !== "trial") return undefined;

  const mode = player.trialDurationMode === "end_date" ? "end_date" : "training_count";
  const orderedEvents = trialEventsFromStart(events, player.trialStartDate);
  const completedTrainingCount = orderedEvents.filter((event) => trainingKey(event) < `${now.date} ${now.time}`).length;
  const upcomingEvents = orderedEvents.filter((event) => trainingKey(event) >= `${now.date} ${now.time}`);

  if (mode === "end_date") {
    const currentEndDate = player.trialEndDate;
    const expired = Boolean(currentEndDate && currentEndDate < now.date);
    const extensionAnchor = expired ? now.date : currentEndDate;
    const extensionBaseCount = extensionAnchor
      ? orderedEvents.filter((event) => event.date <= extensionAnchor).length
      : completedTrainingCount;
    return {
      status: expired ? "expired" : "active",
      mode,
      currentEndDate,
      completedTrainingCount,
      extensionBaseCount: Math.max(extensionBaseCount, completedTrainingCount),
      upcomingTrainingDates: upcomingEvents.map((event) => event.date),
      updatedAt: player.updatedAt
    };
  }

  const trainingLimit = Math.max(0, player.trialTrainingLimit ?? 0);
  const endEvent = trainingLimit > 0 ? orderedEvents[trainingLimit - 1] : undefined;
  const expired = trainingLimit > 0 && Boolean(endEvent && trainingKey(endEvent) < `${now.date} ${now.time}`);
  const extensionBaseCount = expired ? Math.max(trainingLimit, completedTrainingCount) : trainingLimit;
  return {
    status: expired ? "expired" : "active",
    mode,
    currentEndDate: endEvent?.date,
    trainingLimit,
    completedTrainingCount,
    remainingTrainingCount: Math.max(0, trainingLimit - completedTrainingCount),
    extensionBaseCount,
    upcomingTrainingDates: upcomingEvents.map((event) => event.date),
    updatedAt: player.updatedAt
  };
}

export function extendedTrainingLimit(summary: TrialPeriodSummary, additionalSessions: number) {
  return summary.extensionBaseCount + additionalSessions;
}

export function estimatedSessionExtensionEnd(
  summary: TrialPeriodSummary,
  events: TrialTrainingEvent[],
  additionalSessions: number,
  trialStartDate?: string
) {
  const target = extendedTrainingLimit(summary, additionalSessions);
  return trialEventsFromStart(events, trialStartDate)[target - 1]?.date;
}

export function isValidTrialDateExtension(summary: TrialPeriodSummary, newEndDate: string, today = trainingNowParts().date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newEndDate)) return false;
  if (summary.status === "expired" && newEndDate <= today) return false;
  return !summary.currentEndDate || newEndDate > summary.currentEndDate;
}

export async function loadTrialPeriodData(
  db: SupabaseClient,
  userId: string,
  playerId: string
): Promise<{ player: TrialPlayerRow; events: TrialTrainingEvent[]; summary: TrialPeriodSummary } | null> {
  const { data: rawPlayer, error: playerError } = await db
    .from("squad_players")
    .select("id,squad_id,player_type,trial_start_date,trial_duration_mode,trial_training_limit,trial_end_date,updated_at")
    .eq("id", playerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (!rawPlayer || rawPlayer.player_type !== "trial") return null;

  const player = rawPlayer as TrialPlayerRow;
  let query = db
    .from("squad_training_events")
    .select("id,date,start_time")
    .eq("user_id", userId)
    .eq("participant_source_mode", "current_squad_sync")
    .is("deleted_at", null)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (player.squad_id) query = query.eq("squad_id", player.squad_id);
  else query = query.is("squad_id", null);
  if (player.trial_start_date) query = query.gte("date", player.trial_start_date);

  const { data: rawEvents, error: eventError } = await query;
  if (eventError) throw new Error(eventError.message);
  const events = ((rawEvents ?? []) as TrialEventRow[]).map((event) => ({
    id: event.id,
    date: event.date,
    startTime: event.start_time.slice(0, 5)
  }));
  const summary = calculateTrialPeriodSummary(
    {
      playerType: player.player_type,
      trialStartDate: player.trial_start_date ?? undefined,
      trialDurationMode: player.trial_duration_mode ?? undefined,
      trialTrainingLimit: player.trial_training_limit ?? undefined,
      trialEndDate: player.trial_end_date ?? undefined,
      updatedAt: player.updated_at
    },
    events
  );
  return summary ? { player, events, summary } : null;
}

function trialEventsFromStart(events: TrialTrainingEvent[], trialStartDate?: string) {
  return events
    .filter((event) => !trialStartDate || event.date >= trialStartDate)
    .toSorted((left, right) => trainingKey(left).localeCompare(trainingKey(right)) || left.id.localeCompare(right.id));
}

function trainingKey(event: TrialTrainingEvent) {
  return `${event.date} ${normalizeTime(event.startTime)}`;
}

function normalizeTime(value: string) {
  const [hours = "00", minutes = "00", seconds = "00"] = value.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}
