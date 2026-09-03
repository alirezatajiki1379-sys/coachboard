import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
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

  if (error) throw new Error(error.message);

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

function mapReviewRow(row: ReviewRow, drillRows: DrillReviewRow[]): TrainingSessionReview {
  return {
    id: row.id,
    userId: row.user_id,
    squadId: row.squad_id,
    eventId: row.event_id,
    objectiveOutcome: row.objective_outcome,
    overallQuality: row.overall_quality,
    intensity: row.intensity,
    workedWell: row.worked_well ?? undefined,
    needsImprovement: row.needs_improvement ?? undefined,
    nextTrainingNote: row.next_training_note ?? undefined,
    drillReviews: drillRows.map(mapDrillReviewRow),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
