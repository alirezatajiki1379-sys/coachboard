import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SessionReviewForm } from "@/components/squad/session-review-form";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { countTrainingObservations, getTrainingSessionReview } from "@/lib/squad/session-review";
import { createClient } from "@/lib/supabase/server";
import { trainingRatingStats, trainingSummaryCounts } from "@/lib/trainings/utils";

type TrainingReviewPageProps = {
  params: Promise<{ id: string }>;
};

type TrainingDrillInstance = {
  id: string;
  title: string;
  block?: string;
  orderIndex: number;
  plannedDurationMinutes?: number;
};

type TrainingPlanInstance = {
  id: string;
  title: string;
};

export default async function TrainingReviewPage({ params }: TrainingReviewPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event) notFound();

  const [review, drills, planInstance, observationCount] = await Promise.all([
    getTrainingSessionReview(supabase, user.id, event.id),
    loadTrainingDrillInstances(supabase, user.id, event.id),
    loadPlanInstance(supabase, user.id, event.id),
    countTrainingObservations(supabase, user.id, event.id)
  ]);
  const { finalAttendance } = trainingSummaryCounts(event);
  const ratings = trainingRatingStats(event);

  return (
    <SessionReviewForm
      event={event}
      review={review}
      drills={drills}
      attendanceSummary={{
        present: finalAttendance.present,
        absent: finalAttendance.absent,
        late: finalAttendance.late,
        total: event.attendance.length
      }}
      ratingsSummary={ratings}
      observationCount={observationCount}
      planTitle={planInstance?.title ?? event.linkedTrainingSessionTitle}
    />
  );
}

async function loadPlanInstance(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, eventId: string): Promise<TrainingPlanInstance | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("training_session_plan_instances")
    .select("id,title")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; title: string } | null;
  return row ? { id: row.id, title: row.title } : null;
}

async function loadTrainingDrillInstances(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, eventId: string): Promise<TrainingDrillInstance[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("training_session_drill_instances")
    .select("id,title,block,order_index,planned_duration_minutes")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .neq("status", "removed")
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    id: string;
    title: string;
    block: string | null;
    order_index: number;
    planned_duration_minutes: number | null;
  }>).map((row) => ({
    id: row.id,
    title: row.title,
    block: row.block ?? undefined,
    orderIndex: row.order_index,
    plannedDurationMinutes: row.planned_duration_minutes ?? undefined
  }));
}
