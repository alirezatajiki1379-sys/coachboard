import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type { TrainingSessionDrillFeedbackStatus } from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DrillUsageStats = {
  drillId: string;
  historicalUseCount: number;
  lastUsedAt?: string;
  reviewedUseCount: number;
  averageEffectiveness?: number;
  feedbackCounts: Record<TrainingSessionDrillFeedbackStatus, number>;
  usageUnavailable?: boolean;
  history: DrillUsageHistoryItem[];
  teamBreakdown: DrillUsageTeamBreakdownItem[];
};

export type DrillUsageHistoryItem = {
  instanceId: string;
  eventId: string;
  date: string;
  startTime?: string;
  teamId?: string;
  teamName?: string;
  trainingTitle: string;
  trainingFocus?: string;
  block?: string;
  durationMinutes?: number;
  effectivenessRating?: number;
  feedbackStatus?: TrainingSessionDrillFeedbackStatus;
  reviewNote?: string;
};

export type DrillUsageTeamBreakdownItem = {
  teamId: string;
  teamName: string;
  count: number;
};

type InstanceRow = {
  id: string;
  event_id: string;
  source_drill_id: string | null;
  block: string | null;
  planned_duration_minutes: number | null;
  status: string;
};

type EventRow = {
  id: string;
  squad_id: string | null;
  date: string;
  start_time: string | null;
  label: string | null;
  focus: string | null;
  deleted_at: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type ReviewRow = {
  session_drill_instance_id: string;
  feedback_status: TrainingSessionDrillFeedbackStatus | null;
  effectiveness_rating: number | null;
  note: string | null;
};

export function emptyDrillUsageStats(drillId: string, usageUnavailable = false): DrillUsageStats {
  return {
    drillId,
    historicalUseCount: 0,
    reviewedUseCount: 0,
    feedbackCounts: { worked_well: 0, needs_adjustment: 0, not_effective: 0 },
    usageUnavailable,
    history: [],
    teamBreakdown: []
  };
}

export async function getDrillUsageStatsByDrillId(
  supabase: SupabaseServerClient,
  userId: string,
  drillIds: string[]
): Promise<Map<string, DrillUsageStats>> {
  const uniqueDrillIds = Array.from(new Set(drillIds.filter(Boolean)));
  const result = new Map(uniqueDrillIds.map((id) => [id, emptyDrillUsageStats(id)]));
  if (!uniqueDrillIds.length) return result;

  const db = supabase as unknown as SupabaseClient;
  try {
    const { data: instanceData, error: instanceError } = await db
      .from("training_session_drill_instances")
      .select("id,event_id,source_drill_id,block,planned_duration_minutes,status")
      .eq("user_id", userId)
      .in("source_drill_id", uniqueDrillIds)
      .neq("status", "removed");

    if (instanceError) throw new Error(instanceError.message);

    const instances = ((instanceData ?? []) as InstanceRow[]).filter((row) => row.source_drill_id);
    const eventIds = Array.from(new Set(instances.map((row) => row.event_id)));
    if (!eventIds.length) return result;

    const today = new Date().toISOString().slice(0, 10);
    const { data: eventData, error: eventError } = await db
      .from("squad_training_events")
      .select("id,squad_id,date,start_time,label,focus,deleted_at")
      .eq("user_id", userId)
      .in("id", eventIds)
      .is("deleted_at", null)
      .lte("date", today);

    if (eventError) throw new Error(eventError.message);

    const events = new Map(((eventData ?? []) as EventRow[]).map((row) => [row.id, row]));
    const historicalInstances = instances.filter((row) => events.has(row.event_id));
    const instanceIds = historicalInstances.map((row) => row.id);
    const squadIds = Array.from(new Set(Array.from(events.values()).map((event) => event.squad_id).filter((id): id is string => Boolean(id))));

    const [reviewsResult, teamsResult] = await Promise.all([
      instanceIds.length
        ? db
            .from("training_session_drill_reviews")
            .select("session_drill_instance_id,feedback_status,effectiveness_rating,note")
            .eq("user_id", userId)
            .in("session_drill_instance_id", instanceIds)
        : Promise.resolve({ data: [], error: null }),
      squadIds.length
        ? db
            .from("squads")
            .select("id,name")
            .eq("user_id", userId)
            .in("id", squadIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (reviewsResult.error) throw new Error(reviewsResult.error.message);
    if (teamsResult.error) throw new Error(teamsResult.error.message);

    const reviewsByInstance = new Map<string, ReviewRow>();
    for (const review of (reviewsResult.data ?? []) as ReviewRow[]) {
      reviewsByInstance.set(review.session_drill_instance_id, review);
    }
    const teams = new Map(((teamsResult.data ?? []) as TeamRow[]).map((row) => [row.id, row.name]));
    const grouped = new Map<string, DrillUsageHistoryItem[]>();

    for (const instance of historicalInstances) {
      if (!instance.source_drill_id) continue;
      const event = events.get(instance.event_id);
      if (!event) continue;
      const review = reviewsByInstance.get(instance.id);
      const item: DrillUsageHistoryItem = {
        instanceId: instance.id,
        eventId: event.id,
        date: event.date,
        startTime: event.start_time ?? undefined,
        teamId: event.squad_id ?? undefined,
        teamName: event.squad_id ? teams.get(event.squad_id) ?? "Team" : undefined,
        trainingTitle: event.label || "Training",
        trainingFocus: event.focus ?? undefined,
        block: instance.block ?? undefined,
        durationMinutes: instance.planned_duration_minutes ?? undefined,
        effectivenessRating: review?.effectiveness_rating ?? undefined,
        feedbackStatus: review?.feedback_status ?? undefined,
        reviewNote: review?.note ?? undefined
      };
      grouped.set(instance.source_drill_id, [...(grouped.get(instance.source_drill_id) ?? []), item]);
    }

    for (const drillId of uniqueDrillIds) {
      const history = (grouped.get(drillId) ?? []).sort((a, b) => `${b.date} ${b.startTime ?? ""}`.localeCompare(`${a.date} ${a.startTime ?? ""}`));
      const rated = history.filter((item) => typeof item.effectivenessRating === "number");
      const feedbackCounts = history.reduce<DrillUsageStats["feedbackCounts"]>((counts, item) => {
        if (item.feedbackStatus) counts[item.feedbackStatus] += 1;
        return counts;
      }, { worked_well: 0, needs_adjustment: 0, not_effective: 0 });
      const breakdown = buildTeamBreakdown(history);
      result.set(drillId, {
        drillId,
        historicalUseCount: history.length,
        lastUsedAt: history[0]?.date,
        reviewedUseCount: rated.length,
        averageEffectiveness: rated.length
          ? rated.reduce((sum, item) => sum + (item.effectivenessRating ?? 0), 0) / rated.length
          : undefined,
        feedbackCounts,
        history,
        teamBreakdown: breakdown
      });
    }

    return result;
  } catch {
    return new Map(uniqueDrillIds.map((id) => [id, emptyDrillUsageStats(id, true)]));
  }
}

function buildTeamBreakdown(history: DrillUsageHistoryItem[]): DrillUsageTeamBreakdownItem[] {
  const counts = new Map<string, DrillUsageTeamBreakdownItem>();
  for (const item of history) {
    const teamId = item.teamId ?? "unknown";
    const current = counts.get(teamId);
    counts.set(teamId, {
      teamId,
      teamName: item.teamName ?? "No Team",
      count: (current?.count ?? 0) + 1
    });
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName));
}
