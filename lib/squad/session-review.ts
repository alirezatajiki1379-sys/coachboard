import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n";
import type {
  TrainingSessionDrillFeedbackStatus,
  TrainingSessionDrillReview,
  TrainingSessionObjectiveOutcome,
  TrainingSessionReview
} from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const objectiveOutcomeLabels: Record<TrainingSessionObjectiveOutcome, string> = {
  achieved: "Achieved",
  partly_achieved: "Partly achieved",
  not_achieved: "Not achieved"
};

export const drillFeedbackStatusLabels: Record<TrainingSessionDrillFeedbackStatus, string> = {
  worked_well: "Worked well",
  needs_adjustment: "Needs adjustment",
  not_effective: "Not effective"
};

export type SessionReviewRatingKind = "quality" | "intensity" | "playerResponse";

export type PreviousTrainingPlanningContext = {
  sourceEventId: string;
  sourceDate: string;
  sourceLabel: string;
  nextTrainingNote: string;
  objectiveOutcome?: TrainingSessionObjectiveOutcome;
};

export const sessionReviewRatingAnchors: Record<Locale, Record<SessionReviewRatingKind, Record<number, string>>> = {
  en: {
    quality: { 1: "Poor", 2: "Below expectations", 3: "Solid", 4: "Good", 5: "Excellent" },
    intensity: { 1: "Very low", 2: "Low", 3: "Moderate", 4: "High", 5: "Very high" },
    playerResponse: { 1: "Very weak", 2: "Weak", 3: "Mixed", 4: "Good", 5: "Very good" }
  },
  de: {
    quality: { 1: "Schwach", 2: "Unter den Erwartungen", 3: "Solide", 4: "Gut", 5: "Sehr gut" },
    intensity: { 1: "Sehr niedrig", 2: "Niedrig", 3: "Mittel", 4: "Hoch", 5: "Sehr hoch" },
    playerResponse: { 1: "Sehr schwach", 2: "Schwach", 3: "Durchwachsen", 4: "Gut", 5: "Sehr gut" }
  }
};

export function sessionReviewRatingLabel(kind: SessionReviewRatingKind, value: number, locale: Locale = "en") {
  return sessionReviewRatingAnchors[locale][kind][value] ?? "";
}

export function sessionReviewStarFillStates(value: number | "", hoverValue?: number) {
  const activeValue = hoverValue ?? value;
  return [1, 2, 3, 4, 5].map((rating) => typeof activeValue === "number" && rating <= activeValue);
}

export type TrainingSessionReviewSummary = Pick<
  TrainingSessionReview,
  "id" | "eventId" | "objectiveOutcome" | "overallQuality" | "intensity" | "updatedAt"
>;

type ReviewRow = {
  id: string;
  user_id: string;
  squad_id: string;
  event_id: string;
  objective_outcome: TrainingSessionObjectiveOutcome;
  overall_quality: number;
  intensity: number;
  player_response: number | null;
  worked_well: string | null;
  needs_improvement: string | null;
  next_training_note: string | null;
  created_at: string;
  updated_at: string;
};

type DrillReviewRow = {
  id: string;
  user_id: string;
  session_review_id: string;
  session_drill_instance_id: string;
  feedback_status: TrainingSessionDrillFeedbackStatus | null;
  effectiveness_rating: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export async function getTrainingSessionReview(
  supabase: SupabaseServerClient,
  userId: string,
  eventId: string
): Promise<TrainingSessionReview | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("training_session_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as ReviewRow | null;
  if (!row) return null;

  const { data: drillData, error: drillError } = await db
    .from("training_session_drill_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("session_review_id", row.id);

  if (drillError) throw new Error(drillError.message);

  return mapReviewRow(row, (drillData ?? []) as DrillReviewRow[]);
}

export async function listTrainingSessionReviewSummaries(
  supabase: SupabaseServerClient,
  userId: string,
  eventIds: string[]
): Promise<Map<string, TrainingSessionReviewSummary>> {
  const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)));
  const result = new Map<string, TrainingSessionReviewSummary>();
  if (!uniqueEventIds.length) return result;

  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("training_session_reviews")
    .select("id,event_id,objective_outcome,overall_quality,intensity,updated_at")
    .eq("user_id", userId)
    .in("event_id", uniqueEventIds);

  if (error) {
    if (isMissingReviewTableError(error)) return result;
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as Array<Pick<ReviewRow, "id" | "event_id" | "objective_outcome" | "overall_quality" | "intensity" | "updated_at">>) {
    result.set(row.event_id, {
      id: row.id,
      eventId: row.event_id,
      objectiveOutcome: row.objective_outcome,
      overallQuality: row.overall_quality,
      intensity: row.intensity,
      updatedAt: row.updated_at
    });
  }
  return result;
}

export async function countTrainingObservations(supabase: SupabaseServerClient, userId: string, eventId: string) {
  const db = supabase as unknown as SupabaseClient;
  const { count, error } = await db
    .from("player_observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getPreviousTrainingPlanningContext(
  supabase: SupabaseServerClient,
  userId: string,
  target: { id: string; squadId?: string; date: string; startTime: string }
): Promise<PreviousTrainingPlanningContext | null> {
  if (!target.squadId) return null;
  const db = supabase as unknown as SupabaseClient;
  const { data: previousData, error: previousError } = await db
    .from("squad_training_events")
    .select("id,date,start_time,label,training_sessions(title)")
    .eq("user_id", userId)
    .eq("squad_id", target.squadId)
    .is("deleted_at", null)
    .is("archived_at", null)
    .or(`date.lt.${target.date},and(date.eq.${target.date},start_time.lt.${target.startTime})`)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  if (!previousData) return null;

  const previous = previousData as {
    id: string;
    date: string;
    label: string | null;
    training_sessions?: { title?: string | null } | Array<{ title?: string | null }> | null;
  };
  const { data: reviewData, error: reviewError } = await db
    .from("training_session_reviews")
    .select("next_training_note,objective_outcome")
    .eq("user_id", userId)
    .eq("squad_id", target.squadId)
    .eq("event_id", previous.id)
    .maybeSingle();
  if (reviewError) throw new Error(reviewError.message);

  const review = reviewData as Pick<ReviewRow, "next_training_note" | "objective_outcome"> | null;
  const note = review?.next_training_note?.trim();
  if (!note) return null;
  const linkedSession = Array.isArray(previous.training_sessions) ? previous.training_sessions[0] : previous.training_sessions;
  return {
    sourceEventId: previous.id,
    sourceDate: previous.date,
    sourceLabel: previous.label?.trim() || linkedSession?.title?.trim() || "",
    nextTrainingNote: note,
    objectiveOutcome: review?.objective_outcome
  };
}

function mapReviewRow(row: ReviewRow, drillRows: DrillReviewRow[]): TrainingSessionReview {
  return {
    id: row.id,
    userId: row.user_id,
    squadId: row.squad_id,
    eventId: row.event_id,
    objectiveOutcome: row.objective_outcome,
    overallQuality: row.overall_quality,
    intensity: row.intensity,
    playerResponse: row.player_response ?? undefined,
    workedWell: row.worked_well ?? undefined,
    needsImprovement: row.needs_improvement ?? undefined,
    nextTrainingNote: row.next_training_note ?? undefined,
    drillReviews: drillRows.map(mapDrillReviewRow),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isMissingReviewTableError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (
      message.includes("training_session_reviews") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("relation"))
    )
  );
}

function mapDrillReviewRow(row: DrillReviewRow): TrainingSessionDrillReview {
  return {
    id: row.id,
    userId: row.user_id,
    sessionReviewId: row.session_review_id,
    sessionDrillInstanceId: row.session_drill_instance_id,
    feedbackStatus: row.feedback_status ?? undefined,
    effectivenessRating: row.effectiveness_rating ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
