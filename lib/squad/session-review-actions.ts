"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { TrainingSessionDrillFeedbackStatus, TrainingSessionObjectiveOutcome } from "@/types/domain";

type ReviewField = "objectiveOutcome" | "overallQuality" | "intensity";

export type SessionReviewActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<ReviewField, string>>;
  submissionId?: number;
};

const objectiveOutcomes: TrainingSessionObjectiveOutcome[] = ["achieved", "partly_achieved", "not_achieved"];
const feedbackStatuses: TrainingSessionDrillFeedbackStatus[] = ["worked_well", "needs_adjustment", "not_effective"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase: supabase as unknown as SupabaseClient, user };
}

export async function saveTrainingSessionReview(_: SessionReviewActionState, formData: FormData): Promise<SessionReviewActionState> {
  const eventId = formString(formData, "eventId");
  const objectiveOutcome = formString(formData, "objectiveOutcome") as TrainingSessionObjectiveOutcome;
  const overallQuality = numberValue(formData, "overallQuality");
  const intensity = numberValue(formData, "intensity");
  const fieldErrors: SessionReviewActionState["fieldErrors"] = {};

  if (!eventId) return { error: "Training not found.", submissionId: Date.now() };
  if (!objectiveOutcomes.includes(objectiveOutcome)) fieldErrors.objectiveOutcome = "Choose whether the training objective was achieved.";
  if (!overallQuality) fieldErrors.overallQuality = "Rate the overall training quality.";
  if (!intensity) fieldErrors.intensity = "Rate the training intensity.";
  if (Object.keys(fieldErrors).length) {
    return { error: "Please complete the required review fields.", fieldErrors, submissionId: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const { data: event, error: eventError } = await supabase
    .from("squad_training_events")
    .select("id,squad_id")
    .eq("user_id", user.id)
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) return { error: eventError.message, submissionId: Date.now() };
  if (!event) return { error: "Training not found.", submissionId: Date.now() };
  if (!event.squad_id) return { error: "This training is not assigned to a team yet. Assign a team before saving the session review.", submissionId: Date.now() };

  const reviewPayload = {
    user_id: user.id,
    squad_id: event.squad_id,
    event_id: eventId,
    objective_outcome: objectiveOutcome,
    overall_quality: overallQuality,
    intensity,
    worked_well: nullableText(formString(formData, "workedWell")),
    needs_improvement: nullableText(formString(formData, "needsImprovement")),
    next_training_note: nullableText(formString(formData, "nextTrainingNote"))
  };

  const { data: review, error: reviewError } = await supabase
    .from("training_session_reviews")
    .upsert(reviewPayload, { onConflict: "event_id" })
    .select("id")
    .single();

  if (reviewError) return { error: reviewError.message, submissionId: Date.now() };

  const { data: instances, error: instanceError } = await supabase
    .from("training_session_drill_instances")
    .select("id")
    .eq("user_id", user.id)
    .eq("event_id", eventId);

  if (instanceError) return { error: instanceError.message, submissionId: Date.now() };
  const allowedInstanceIds = new Set(((instances ?? []) as Array<{ id: string }>).map((row) => row.id));
  const meaningfulRows: Array<{
    user_id: string;
    session_review_id: string;
    session_drill_instance_id: string;
    feedback_status: TrainingSessionDrillFeedbackStatus | null;
    effectiveness_rating: number | null;
    note: string | null;
  }> = [];
  const emptyInstanceIds: string[] = [];

  for (const instanceId of formData.getAll("drillInstanceId")) {
    if (typeof instanceId !== "string" || !allowedInstanceIds.has(instanceId)) continue;
    const rawStatus = formString(formData, `drillStatus:${instanceId}`);
    const feedbackStatus = feedbackStatuses.includes(rawStatus as TrainingSessionDrillFeedbackStatus)
      ? rawStatus as TrainingSessionDrillFeedbackStatus
      : null;
    const effectivenessRating = numberValue(formData, `drillRating:${instanceId}`);
    const note = nullableText(formString(formData, `drillNote:${instanceId}`));
    if (!feedbackStatus && !effectivenessRating && !note) {
      emptyInstanceIds.push(instanceId);
      continue;
    }
    meaningfulRows.push({
      user_id: user.id,
      session_review_id: review.id,
      session_drill_instance_id: instanceId,
      feedback_status: feedbackStatus,
      effectiveness_rating: effectivenessRating,
      note
    });
  }

  if (meaningfulRows.length) {
    const { error } = await supabase
      .from("training_session_drill_reviews")
      .upsert(meaningfulRows, { onConflict: "session_review_id,session_drill_instance_id" });
    if (error) return { error: error.message, submissionId: Date.now() };
  }

  if (emptyInstanceIds.length) {
    const { error } = await supabase
      .from("training_session_drill_reviews")
      .delete()
      .eq("user_id", user.id)
      .eq("session_review_id", review.id)
      .in("session_drill_instance_id", emptyInstanceIds);
    if (error) return { error: error.message, submissionId: Date.now() };
  }

  revalidatePath(`/trainings/${eventId}`);
  revalidatePath(`/trainings/${eventId}/review`);
  revalidatePath("/drills");
  revalidatePath("/actions");
  revalidatePath("/dashboard");
  return { success: "Session review saved.", submissionId: Date.now() };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string) {
  const raw = formString(formData, key);
  if (!raw) return null;
  const number = Number.parseInt(raw, 10);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function nullableText(value: string) {
  return value || null;
}
