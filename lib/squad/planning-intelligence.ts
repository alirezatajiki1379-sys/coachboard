import type { SupabaseClient } from "@supabase/supabase-js";
import { drillMatchesAgeFilter, formatDrillAgeSuitability } from "@/lib/drills/age-suitability";
import { mapDrillRow, type DrillRow } from "@/lib/drills/mappers";
import { getDrillUsageStatsByDrillId, type DrillUsageStats } from "@/lib/drills/usage";
import { getPositionFamily } from "@/lib/squad/positions";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { Drill, PlayerDevelopmentGoalCategory, SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type EventRow = Database["public"]["Tables"]["squad_training_events"]["Row"];
type SessionReviewRow = Database["public"]["Tables"]["training_session_reviews"]["Row"];
type DrillInstanceRow = Database["public"]["Tables"]["training_session_drill_instances"]["Row"];
type DrillReviewRow = Database["public"]["Tables"]["training_session_drill_reviews"]["Row"];
type GoalRow = Database["public"]["Tables"]["player_development_goals"]["Row"];
type ProgressRow = Database["public"]["Tables"]["player_development_progress"]["Row"];

export type PlanningInsightPlanDrill = {
  id: string;
  title: string;
  phase: string;
  sourceDrillId?: string;
};

export type PlanningParticipantComposition = {
  expectedPlayers: number;
  goalkeepers: number;
  fieldPlayers: number;
  positionMissing: number;
  ageContext?: number;
};

export type PlanningPreviousSessionInsight = {
  event: {
    id: string;
    label: string;
    date: string;
    focus?: string;
  };
  review?: {
    objectiveOutcome: "achieved" | "partly_achieved" | "not_achieved";
    overallQuality: number;
    intensity: number;
    nextTrainingNote?: string;
  };
  drillFeedback: Array<{
    title: string;
    feedbackStatus: "worked_well" | "needs_adjustment" | "not_effective";
    effectivenessRating?: number;
    note?: string;
  }>;
};

export type PlanningDevelopmentInsight = {
  unavailable: boolean;
  expectedPlayersWithActiveGoals: number;
  activeGoals: number;
  highPriorityGoals: number;
  goalsDueForReview: number;
  categories: Array<{ category: PlayerDevelopmentGoalCategory; count: number }>;
  examples: Array<{
    playerName: string;
    title: string;
    category: PlayerDevelopmentGoalCategory;
    priority: "low" | "medium" | "high";
    reviewDue: boolean;
    latestProgress?: "needs_attention" | "developing" | "consistent" | "achieved";
  }>;
};

export type PlanningTrainingBalanceInsight = {
  unavailable: boolean;
  lookbackCount: number;
  focusCoverage: number;
  focusDistribution: Array<{ focus: string; count: number }>;
  currentFocusCount?: number;
};

export type PlanningSuggestedDrill = {
  drill: Drill;
  phase: string;
  reasons: string[];
  context: string[];
  latestFeedback?: {
    feedbackStatus: "worked_well" | "needs_adjustment" | "not_effective";
    note?: string;
    effectivenessRating?: number;
  };
  usage: DrillUsageStats;
};

export type PlanningContext = {
  participantComposition: PlanningParticipantComposition;
  previousSession: PlanningPreviousSessionInsight | null;
  development: PlanningDevelopmentInsight;
  trainingBalance: PlanningTrainingBalanceInsight;
  suggestedDrills: PlanningSuggestedDrill[];
  errors: string[];
};

type ExpectedParticipant = {
  id: string;
  name: string;
  position?: string;
  dateOfBirth?: string;
};

export async function getPlanningContext(
  supabase: SupabaseServerClient,
  userId: string,
  event: SquadTrainingEvent & { attendance: SquadAttendanceEntry[] },
  planDrills: PlanningInsightPlanDrill[]
): Promise<PlanningContext> {
  const db = supabase as unknown as SupabaseClient;
  const expectedParticipants = expectedParticipantsFromAttendance(event.attendance);
  const errors: string[] = [];
  const [previousSession, development, trainingBalance, suggestedDrills] = await Promise.all([
    safeLoad(() => getPreviousSessionInsight(db, userId, event), errors, null),
    safeLoad(() => getDevelopmentInsight(db, userId, event.squadId, expectedParticipants), errors, unavailableDevelopment()),
    safeLoad(() => getTrainingBalanceInsight(db, userId, event), errors, unavailableBalance()),
    safeLoad(() => getSuggestedDrills(db, supabase, userId, event, expectedParticipants, planDrills), errors, [])
  ]);

  return {
    participantComposition: participantComposition(expectedParticipants),
    previousSession,
    development,
    trainingBalance,
    suggestedDrills,
    errors
  };
}

async function safeLoad<T>(loader: () => Promise<T>, errors: string[], fallback: T) {
  try {
    return await loader();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Planning insight unavailable.");
    return fallback;
  }
}

async function getPreviousSessionInsight(db: SupabaseClient, userId: string, event: SquadTrainingEvent): Promise<PlanningPreviousSessionInsight | null> {
  if (!event.squadId) return null;
  const { data, error } = await db
    .from("squad_training_events")
    .select("id,label,date,start_time,focus")
    .eq("user_id", userId)
    .eq("squad_id", event.squadId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .lte("date", event.date)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  const previous = ((data ?? []) as Pick<EventRow, "id" | "label" | "date" | "start_time" | "focus">[]).find((row) => eventDateTimeKey(row.date, row.start_time ?? "00:00") < eventDateTimeKey(event.date, event.startTime));
  if (!previous) return null;

  const { data: reviewData, error: reviewError } = await db
    .from("training_session_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("event_id", previous.id)
    .maybeSingle();
  if (reviewError) throw new Error(reviewError.message);
  const review = reviewData as SessionReviewRow | null;
  const drillFeedback = review ? await getReviewDrillFeedback(db, userId, previous.id, review.id) : [];

  return {
    event: {
      id: previous.id,
      label: previous.label ?? "Training",
      date: previous.date,
      focus: previous.focus ?? undefined
    },
    review: review
      ? {
          objectiveOutcome: review.objective_outcome,
          overallQuality: review.overall_quality,
          intensity: review.intensity,
          nextTrainingNote: review.next_training_note ?? undefined
        }
      : undefined,
    drillFeedback
  };
}

async function getReviewDrillFeedback(db: SupabaseClient, userId: string, eventId: string, reviewId: string) {
  const [{ data: instanceData, error: instanceError }, { data: reviewData, error: drillReviewError }] = await Promise.all([
    db.from("training_session_drill_instances").select("id,title").eq("user_id", userId).eq("event_id", eventId).neq("status", "removed"),
    db.from("training_session_drill_reviews").select("*").eq("user_id", userId).eq("session_review_id", reviewId)
  ]);
  if (instanceError) throw new Error(instanceError.message);
  if (drillReviewError) throw new Error(drillReviewError.message);
  const titleByInstance = new Map(((instanceData ?? []) as Pick<DrillInstanceRow, "id" | "title">[]).map((row) => [row.id, row.title]));
  return ((reviewData ?? []) as DrillReviewRow[])
    .filter((row) => row.feedback_status === "needs_adjustment" || row.feedback_status === "not_effective")
    .map((row) => ({
      title: titleByInstance.get(row.session_drill_instance_id) ?? "Session drill",
      feedbackStatus: row.feedback_status as "needs_adjustment" | "not_effective",
      effectivenessRating: row.effectiveness_rating ?? undefined,
      note: row.note ?? undefined
    }));
}

async function getDevelopmentInsight(db: SupabaseClient, userId: string, squadId: string | undefined, expectedParticipants: ExpectedParticipant[]): Promise<PlanningDevelopmentInsight> {
  if (!squadId || !expectedParticipants.length) return unavailableDevelopment(false);
  const expectedIds = expectedParticipants.map((player) => player.id);
  const { data: goalData, error: goalError } = await db
    .from("player_development_goals")
    .select("id,player_id,title,category,priority,status,review_date")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .in("player_id", expectedIds)
    .in("status", ["identified", "in_progress"]);
  if (goalError) throw new Error(goalError.message);
  const goals = (goalData ?? []) as Array<Pick<GoalRow, "id" | "player_id" | "title" | "category" | "priority" | "status" | "review_date">>;
  const progressByGoal = await latestProgressByGoal(db, userId, squadId, goals.map((goal) => goal.id));
  const playerById = new Map(expectedParticipants.map((player) => [player.id, player]));
  const today = dateOnly(new Date());

  return {
    unavailable: false,
    expectedPlayersWithActiveGoals: new Set(goals.map((goal) => goal.player_id)).size,
    activeGoals: goals.length,
    highPriorityGoals: goals.filter((goal) => goal.priority === "high").length,
    goalsDueForReview: goals.filter((goal) => goal.review_date && goal.review_date <= today).length,
    categories: categoryCounts(goals),
    examples: [...goals]
      .sort((a, b) => goalPriorityRank(b.priority) - goalPriorityRank(a.priority) || (a.review_date ?? "9999-99-99").localeCompare(b.review_date ?? "9999-99-99"))
      .slice(0, 4)
      .map((goal) => ({
        playerName: playerById.get(goal.player_id)?.name ?? "Player",
        title: goal.title,
        category: goal.category,
        priority: goal.priority,
        reviewDue: Boolean(goal.review_date && goal.review_date <= today),
        latestProgress: progressByGoal.get(goal.id)
      }))
  };
}

async function latestProgressByGoal(db: SupabaseClient, userId: string, squadId: string, goalIds: string[]) {
  const result = new Map<string, "needs_attention" | "developing" | "consistent" | "achieved">();
  if (!goalIds.length) return result;
  const { data, error } = await db
    .from("player_development_progress")
    .select("goal_id,progress_level,recorded_at,created_at")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .in("goal_id", goalIds)
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Pick<ProgressRow, "goal_id" | "progress_level">[]) {
    if (!result.has(row.goal_id)) result.set(row.goal_id, row.progress_level);
  }
  return result;
}

async function getTrainingBalanceInsight(db: SupabaseClient, userId: string, event: SquadTrainingEvent): Promise<PlanningTrainingBalanceInsight> {
  if (!event.squadId) return unavailableBalance(false);
  const { data, error } = await db
    .from("squad_training_events")
    .select("id,focus")
    .eq("user_id", userId)
    .eq("squad_id", event.squadId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .lte("date", event.date)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  const recent = ((data ?? []) as Pick<EventRow, "id" | "date" | "start_time" | "focus">[])
    .filter((row) => eventDateTimeKey(row.date, row.start_time ?? "00:00") < eventDateTimeKey(event.date, event.startTime))
    .slice(0, 6);
  const counts = new Map<string, number>();
  for (const item of recent) {
    const focus = item.focus?.trim();
    if (focus) counts.set(focus, (counts.get(focus) ?? 0) + 1);
  }
  return {
    unavailable: false,
    lookbackCount: recent.length,
    focusCoverage: Array.from(counts.values()).reduce((sum, value) => sum + value, 0),
    focusDistribution: Array.from(counts.entries())
      .map(([focus, count]) => ({ focus, count }))
      .sort((a, b) => b.count - a.count || a.focus.localeCompare(b.focus)),
    currentFocusCount: event.focus ? counts.get(event.focus) ?? 0 : undefined
  };
}

async function getSuggestedDrills(
  db: SupabaseClient,
  supabase: SupabaseServerClient,
  userId: string,
  event: SquadTrainingEvent,
  expectedParticipants: ExpectedParticipant[],
  planDrills: PlanningInsightPlanDrill[]
): Promise<PlanningSuggestedDrill[]> {
  const { data, error } = await db
    .from("drills")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "published")
    .is("archived_at", null)
    .is("deleted_at", null)
    .limit(200);
  if (error) throw new Error(error.message);

  const alreadyInPlan = new Set(planDrills.map((drill) => drill.sourceDrillId).filter((id): id is string => Boolean(id)));
  const drills = ((data ?? []) as DrillRow[]).map(mapDrillRow).filter((drill) => !alreadyInPlan.has(drill.id));
  const usageByDrill = await getDrillUsageStatsByDrillId(supabase, userId, drills.map((drill) => drill.id));
  const expectedCount = expectedParticipants.length || undefined;
  const ageContext = inferAgeContext(expectedParticipants);

  return drills
    .map((drill) => scoreSuggestedDrill(drill, usageByDrill.get(drill.id), event, expectedCount, ageContext))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.drill.title.localeCompare(b.drill.title))
    .slice(0, 4)
    .map((item) => ({
      drill: item.drill,
      phase: item.phase,
      reasons: item.reasons,
      context: item.context,
      latestFeedback: item.latestFeedback,
      usage: item.usage
    }));
}

function scoreSuggestedDrill(
  drill: Drill,
  usage: DrillUsageStats | undefined,
  event: SquadTrainingEvent,
  expectedCount?: number,
  ageContext?: number
): PlanningSuggestedDrill & { score: number } {
  const reasons: string[] = [];
  const context: string[] = [];
  let score = 0;

  if (ageContext !== undefined && drillMatchesAgeFilter(drill, `age:${ageContext}`)) {
    score += 30;
    reasons.push(`Matches U${ageContext}`);
  } else if (drill.ageMode === "all_ages" || drill.ageGroups.includes("all_ages")) {
    score += 24;
    reasons.push("All ages");
  } else if (ageContext === undefined) {
    context.push("Age context unavailable");
  }

  if (expectedCount !== undefined) {
    if (expectedCount >= drill.minPlayers && expectedCount <= drill.maxPlayers) {
      score += 24;
      reasons.push("Fits player count");
    } else {
      context.push(`Recommended ${drill.minPlayers}-${drill.maxPlayers} players`);
    }
  } else {
    context.push("Player count not available yet");
  }

  if (event.focus && drill.mainFocus === event.focus) {
    score += 32;
    reasons.push("Matches focus");
  } else if (!event.focus) {
    context.push("Focus matching unavailable");
  }

  const phase = suggestedPhase(drill);
  if (drill.trainingBlocks.includes(phase as Drill["trainingBlocks"][number])) {
    score += 8;
    reasons.push(`Fits ${phase}`);
  }
  if (drill.isFavorite) {
    score += 8;
    reasons.push("Favorite");
  }
  if (usage?.averageEffectiveness) score += Math.max(0, usage.averageEffectiveness - 3) * 3;
  const latestFeedback = usage?.history.find((item) => item.feedbackStatus)?.feedbackStatus
    ? usage.history.find((item) => item.feedbackStatus)
    : undefined;
  if (latestFeedback?.feedbackStatus === "not_effective") score -= 4;
  if (latestFeedback?.feedbackStatus === "needs_adjustment") score -= 2;

  if (usage?.historicalUseCount) {
    context.push(`Used ${usage.historicalUseCount} time${usage.historicalUseCount === 1 ? "" : "s"}`);
    const teamUses = event.squadId ? usage.teamBreakdown.find((item) => item.teamId === event.squadId)?.count ?? 0 : 0;
    if (teamUses && teamUses !== usage.historicalUseCount) context.push(`${teamUses} with this team`);
    if (usage.reviewedUseCount && usage.averageEffectiveness) context.push(`${usage.averageEffectiveness.toFixed(1)}/5 from ${usage.reviewedUseCount} review${usage.reviewedUseCount === 1 ? "" : "s"}`);
    else context.push("No effectiveness ratings yet");
  } else {
    context.push("Never used");
  }

  return {
    score,
    drill,
    phase,
    reasons,
    context: [`${formatDrillAgeSuitability(drill)} · ${drill.minPlayers}-${drill.maxPlayers} players`, ...context],
    latestFeedback: latestFeedback?.feedbackStatus
      ? {
          feedbackStatus: latestFeedback.feedbackStatus,
          note: latestFeedback.reviewNote,
          effectivenessRating: latestFeedback.effectivenessRating
        }
      : undefined,
    usage: usage ?? {
      drillId: drill.id,
      historicalUseCount: 0,
      reviewedUseCount: 0,
      feedbackCounts: { worked_well: 0, needs_adjustment: 0, not_effective: 0 },
      history: [],
      teamBreakdown: []
    }
  };
}

function expectedParticipantsFromAttendance(attendance: SquadAttendanceEntry[]): ExpectedParticipant[] {
  const byPlayer = new Map<string, ExpectedParticipant>();
  for (const entry of attendance) {
    if (!entry.player || entry.plannedStatus === "unavailable") continue;
    byPlayer.set(entry.player.id, {
      id: entry.player.id,
      name: [entry.player.firstName, entry.player.lastName].filter(Boolean).join(" "),
      position: entry.player.position,
      dateOfBirth: entry.player.dateOfBirth
    });
  }
  return Array.from(byPlayer.values());
}

function participantComposition(players: ExpectedParticipant[]): PlanningParticipantComposition {
  const ageContext = inferAgeContext(players);
  return players.reduce<PlanningParticipantComposition>(
    (totals, player) => {
      const family = getPositionFamily(player.position);
      if (family === "goalkeeper") totals.goalkeepers += 1;
      else if (family === "unassigned") totals.positionMissing += 1;
      else totals.fieldPlayers += 1;
      return totals;
    },
    { expectedPlayers: players.length, goalkeepers: 0, fieldPlayers: 0, positionMissing: 0, ageContext }
  );
}

function inferAgeContext(players: ExpectedParticipant[]) {
  const ages = players.map((player) => ageOnDate(player.dateOfBirth)).filter((age): age is number => Number.isFinite(age));
  if (!ages.length) return undefined;
  const counts = new Map<number, number>();
  for (const age of ages) counts.set(age, (counts.get(age) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

function ageOnDate(dateOfBirth?: string, today = new Date()) {
  if (!dateOfBirth) return Number.NaN;
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return Number.NaN;
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (today < birthday) age -= 1;
  return age;
}

function categoryCounts(goals: Array<Pick<GoalRow, "category">>) {
  const counts = new Map<PlayerDevelopmentGoalCategory, number>();
  for (const goal of goals) counts.set(goal.category, (counts.get(goal.category) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function goalPriorityRank(priority: "low" | "medium" | "high") {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function suggestedPhase(drill: Drill) {
  if (drill.trainingBlocks.includes("Warm-up")) return "Warm-up";
  if (drill.trainingBlocks.some((block) => block.includes("Small-sided") || block.includes("Match"))) return "Game Form";
  if (drill.trainingBlocks.includes("Cool down")) return "Cool-down";
  if (drill.trainingBlocks.includes("Activation")) return "Arrival / Activation";
  return "Main Part";
}

function unavailableDevelopment(unavailable = true): PlanningDevelopmentInsight {
  return {
    unavailable,
    expectedPlayersWithActiveGoals: 0,
    activeGoals: 0,
    highPriorityGoals: 0,
    goalsDueForReview: 0,
    categories: [],
    examples: []
  };
}

function unavailableBalance(unavailable = true): PlanningTrainingBalanceInsight {
  return {
    unavailable,
    lookbackCount: 0,
    focusCoverage: 0,
    focusDistribution: []
  };
}

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventDateTimeKey(date: string, startTime?: string) {
  return `${date} ${startTime?.slice(0, 5) || "00:00"}`;
}
