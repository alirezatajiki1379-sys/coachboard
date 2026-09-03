import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { mapAttendanceRow, mapTrainingEventRow, type SquadAttendanceRow, type SquadTrainingEventRow } from "@/lib/squad/attendance-mappers";
import {
  calculateAverageRating,
  createPlayerAnalyticsSummary,
  defaultSortDirection,
  filterEventsByPeriod,
  isPastAttendanceEvent,
  sortPlayerAnalytics,
  type AnalyticsPeriod,
  type AnalyticsPlayerTypeFilter,
  type AnalyticsSection,
  type AnalyticsSortDirection,
  type AnalyticsSortKey,
  type PlayerAnalyticsRecord,
  type PlayerAnalyticsSummary,
  type TeamAnalyticsEvent,
  type TeamAnalyticsOverview
} from "@/lib/squad/analytics";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import { ensureActiveSquad } from "@/lib/squad/squads";
import type { Database } from "@/types/database";
import type {
  PlayerCoachAssessment,
  PlayerDevelopmentGoalCategory,
  PlayerDevelopmentGoalStatus,
  PlayerDevelopmentProgress,
  Squad,
  SquadPlayer,
  SquadTrainingEvent
} from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AssessmentRow = Database["public"]["Tables"]["player_coach_assessments"]["Row"];
type GoalRow = Database["public"]["Tables"]["player_development_goals"]["Row"];
type ProgressRow = Database["public"]["Tables"]["player_development_progress"]["Row"];
type SessionReviewRow = Database["public"]["Tables"]["training_session_reviews"]["Row"];
type DrillInstanceRow = Database["public"]["Tables"]["training_session_drill_instances"]["Row"];
type DrillReviewRow = Database["public"]["Tables"]["training_session_drill_reviews"]["Row"];

export type AnalyticsFilters = {
  period: AnalyticsPeriod;
  section: AnalyticsSection;
  playerType: AnalyticsPlayerTypeFilter;
  position?: string;
  ratedOnly: boolean;
  sort: AnalyticsSortKey;
  direction: AnalyticsSortDirection;
  customFrom?: string;
  customTo?: string;
};

type SeasonSettings = { seasonStartMonth: number; seasonStartDay: number };

type DevelopmentGoalAnalytics = {
  id: string;
  playerId: string;
  category: PlayerDevelopmentGoalCategory;
  status: PlayerDevelopmentGoalStatus;
  reviewDate?: string;
  achievedAt?: string;
};

type DevelopmentProgressAnalytics = {
  id: string;
  playerId: string;
  goalId: string;
  progressLevel: PlayerDevelopmentProgress;
  recordedAt: string;
};

type DrillUsageItem = TeamAnalyticsOverview["drillUsage"][number];

export function parseAnalyticsFilters(searchParams: Record<string, string | string[] | undefined>): AnalyticsFilters {
  const period = one(searchParams.period);
  const section = one(searchParams.section);
  const playerType = one(searchParams.playerType);
  const sort = one(searchParams.sort);
  const parsedSort: AnalyticsSortKey =
    sort === "position" ||
    sort === "status" ||
    sort === "trainings" ||
    sort === "rated" ||
    sort === "average" ||
    sort === "latestFive" ||
    sort === "trend" ||
    sort === "attendance" ||
    sort === "reliability" ||
    sort === "lastTraining" ||
    sort === "evidence" ||
    sort === "coachAssessment"
      ? sort
      : "name";
  const direction = one(searchParams.direction);
  return {
    period: period === "last5" || period === "last10" || period === "30d" || period === "90d" || period === "season" || period === "all" || period === "custom" ? period : "last10",
    section: section === "training" || section === "attendance" || section === "development" || section === "drills" || section === "players" ? section : "overview",
    playerType: playerType === "roster" || playerType === "trial" ? playerType : "all",
    position: one(searchParams.position) || undefined,
    ratedOnly: one(searchParams.ratedOnly) === "true",
    customFrom: normalizeDateParam(one(searchParams.from)),
    customTo: normalizeDateParam(one(searchParams.to)),
    sort: parsedSort,
    direction: direction === "asc" || direction === "desc" ? direction : defaultSortDirection(parsedSort)
  };
}

export async function getSquadAnalyticsOverview(
  supabase: SupabaseServerClient,
  userId: string,
  filters: AnalyticsFilters
): Promise<{ summaries: PlayerAnalyticsSummary[]; positions: string[]; seasonSettings: SeasonSettings; teamAnalytics: TeamAnalyticsOverview }> {
  const db = supabase as unknown as SupabaseClient;
  const activeSquad = await ensureActiveSquad(supabase, userId);
  const [players, records, assessments, seasonSettings, events, sessionReviews, goals, progressUpdates] = await Promise.all([
    listAnalyticsPlayers(db, userId, activeSquad.id),
    listAnalyticsRecords(db, userId, activeSquad.id),
    listLatestAssessments(db, userId, activeSquad.id),
    getSeasonSettings(db, userId),
    listAnalyticsEvents(db, userId, activeSquad.id),
    listSessionReviews(db, userId, activeSquad.id),
    listDevelopmentGoals(db, userId, activeSquad.id),
    listDevelopmentProgress(db, userId, activeSquad.id)
  ]);

  const periodEvents = filterEventsByPeriod(
    events,
    filters.period,
    new Date(),
    seasonSettings.seasonStartMonth,
    seasonSettings.seasonStartDay,
    filters.customFrom,
    filters.customTo
  );
  const periodEventIds = new Set(periodEvents.map((event) => event.id));
  const periodSessionReviews = sessionReviews.filter((review) => periodEventIds.has(review.event_id));
  const periodRecords = records.filter((record) => periodEventIds.has(record.eventId));
  const drillInstances = await listDrillInstances(db, userId, Array.from(periodEventIds));
  const drillReviews = await listDrillReviews(
    db,
    userId,
    periodSessionReviews.map((review) => review.id)
  );

  const assessmentByPlayer = new Map(assessments.map((assessment) => [assessment.playerId, assessment]));
  const positions = Array.from(new Set(players.map((player) => player.position).filter((position): position is string => Boolean(position)))).sort((a, b) => a.localeCompare(b));
  const filteredPlayers = players.filter((player) => {
    if (filters.playerType !== "all" && player.playerType !== filters.playerType) return false;
    if (filters.position && player.position !== filters.position) return false;
    return true;
  });
  const summaries = filteredPlayers
    .map((player) =>
      createPlayerAnalyticsSummary(
        player,
        records,
        filters.period,
        assessmentByPlayer.get(player.id),
        seasonSettings.seasonStartMonth,
        seasonSettings.seasonStartDay,
        filters.customFrom,
        filters.customTo
      )
    )
    .filter((summary) => (filters.ratedOnly ? summary.rated > 0 : true));

  const teamAnalytics = createTeamAnalytics(activeSquad, periodEvents, periodRecords, periodSessionReviews, drillInstances, drillReviews, goals, progressUpdates, filters, seasonSettings);
  return { summaries: sortPlayerAnalytics(summaries, filters.sort, filters.direction), positions, seasonSettings, teamAnalytics };
}

export async function getPlayerAnalytics(
  supabase: SupabaseServerClient,
  userId: string,
  playerId: string,
  period: AnalyticsPeriod,
  customFrom?: string,
  customTo?: string
): Promise<{ player: SquadPlayer; summary: PlayerAnalyticsSummary; assessmentHistory: PlayerCoachAssessment[] } | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data: playerData, error: playerError } = await db.from("squad_players").select("*").eq("user_id", userId).eq("id", playerId).maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (!playerData) return null;

  const player = mapSquadPlayerRow(playerData as SquadPlayerRow);
  const [records, assessments, seasonSettings] = await Promise.all([
    listAnalyticsRecords(db, userId, player.squadId, playerId),
    listAssessmentsForPlayer(db, userId, playerId),
    getSeasonSettings(db, userId)
  ]);
  return {
    player,
    summary: createPlayerAnalyticsSummary(player, records, period, assessments[0], seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay, customFrom, customTo),
    assessmentHistory: assessments
  };
}

async function getSeasonSettings(db: SupabaseClient, userId: string): Promise<SeasonSettings> {
  const { data, error } = await db.from("profiles").select("season_start_month, season_start_day").eq("id", userId).maybeSingle();
  if (error) return { seasonStartMonth: 7, seasonStartDay: 1 };
  return {
    seasonStartMonth: typeof data?.season_start_month === "number" ? data.season_start_month : 7,
    seasonStartDay: typeof data?.season_start_day === "number" ? data.season_start_day : 1
  };
}

async function listAnalyticsPlayers(db: SupabaseClient, userId: string, squadId: string): Promise<SquadPlayer[]> {
  const { data, error } = await db
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);
}

async function listAnalyticsRecords(db: SupabaseClient, userId: string, squadId?: string, playerId?: string): Promise<PlayerAnalyticsRecord[]> {
  let query = db.from("squad_attendance_records").select("*, squad_training_events(*)").eq("user_id", userId);
  if (playerId) query = query.eq("player_id", playerId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<SquadAttendanceRow & { squad_training_events?: SquadTrainingEventRow | null }>)
    .filter((row) => row.squad_training_events && !row.squad_training_events.deleted_at && !row.squad_training_events.archived_at)
    .map((row) => ({
      ...mapAttendanceRow(row),
      event: row.squad_training_events ? mapTrainingEventRow(row.squad_training_events) : undefined
    }))
    .filter((record) => (!squadId || record.event?.squadId === squadId) && isPastAttendanceEvent(record.event));
}

async function listLatestAssessments(db: SupabaseClient, userId: string, squadId: string): Promise<PlayerCoachAssessment[]> {
  const { data, error } = await db
    .from("player_coach_assessments")
    .select("*, squad_players!inner(squad_id)")
    .eq("user_id", userId)
    .eq("squad_players.squad_id", squadId)
    .order("assessment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const latest = new Map<string, PlayerCoachAssessment>();
  for (const row of (data ?? []) as AssessmentRow[]) {
    if (!latest.has(row.player_id)) latest.set(row.player_id, mapAssessmentRow(row));
  }
  return Array.from(latest.values());
}

async function listAssessmentsForPlayer(db: SupabaseClient, userId: string, playerId: string): Promise<PlayerCoachAssessment[]> {
  const { data, error } = await db
    .from("player_coach_assessments")
    .select("*")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .order("assessment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AssessmentRow[]).map(mapAssessmentRow);
}

async function listAnalyticsEvents(db: SupabaseClient, userId: string, squadId: string): Promise<SquadTrainingEvent[]> {
  const { data, error } = await db
    .from("squad_training_events")
    .select("*")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SquadTrainingEventRow[]).map((row) => mapTrainingEventRow(row));
}

async function listSessionReviews(db: SupabaseClient, userId: string, squadId: string): Promise<SessionReviewRow[]> {
  const { data, error } = await db.from("training_session_reviews").select("*").eq("user_id", userId).eq("squad_id", squadId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SessionReviewRow[];
}

async function listDrillInstances(db: SupabaseClient, userId: string, eventIds: string[]): Promise<DrillInstanceRow[]> {
  if (!eventIds.length) return [];
  const { data, error } = await db
    .from("training_session_drill_instances")
    .select("*")
    .eq("user_id", userId)
    .in("event_id", eventIds)
    .neq("status", "removed")
    .order("event_id", { ascending: true })
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DrillInstanceRow[];
}

async function listDrillReviews(db: SupabaseClient, userId: string, sessionReviewIds: string[]): Promise<DrillReviewRow[]> {
  if (!sessionReviewIds.length) return [];
  const { data, error } = await db.from("training_session_drill_reviews").select("*").eq("user_id", userId).in("session_review_id", sessionReviewIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as DrillReviewRow[];
}

async function listDevelopmentGoals(db: SupabaseClient, userId: string, squadId: string): Promise<DevelopmentGoalAnalytics[]> {
  const { data, error } = await db
    .from("player_development_goals")
    .select("id, player_id, category, status, review_date, achieved_at")
    .eq("user_id", userId)
    .eq("squad_id", squadId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as GoalRow[]).map((row) => ({
    id: row.id,
    playerId: row.player_id,
    category: row.category,
    status: row.status,
    reviewDate: row.review_date ?? undefined,
    achievedAt: row.achieved_at ?? undefined
  }));
}

async function listDevelopmentProgress(db: SupabaseClient, userId: string, squadId: string): Promise<DevelopmentProgressAnalytics[]> {
  const { data, error } = await db
    .from("player_development_progress")
    .select("id, player_id, goal_id, progress_level, recorded_at")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProgressRow[]).map((row) => ({
    id: row.id,
    playerId: row.player_id,
    goalId: row.goal_id,
    progressLevel: row.progress_level,
    recordedAt: row.recorded_at
  }));
}

function createTeamAnalytics(
  activeSquad: Squad,
  periodEvents: SquadTrainingEvent[],
  periodRecords: PlayerAnalyticsRecord[],
  periodSessionReviews: SessionReviewRow[],
  drillInstances: DrillInstanceRow[],
  drillReviews: DrillReviewRow[],
  goals: DevelopmentGoalAnalytics[],
  progressUpdates: DevelopmentProgressAnalytics[],
  filters: AnalyticsFilters,
  seasonSettings: SeasonSettings
): TeamAnalyticsOverview {
  const eventRecords = groupBy(periodRecords, (record) => record.eventId);
  const reviewsByEvent = new Map(periodSessionReviews.map((review) => [review.event_id, review]));
  const drillsByEvent = groupBy(drillInstances, (instance) => instance.event_id);
  const events: TeamAnalyticsEvent[] = periodEvents.map((event) => {
    const records = eventRecords.get(event.id) ?? [];
    const review = reviewsByEvent.get(event.id);
    return {
      event,
      records,
      attendance: summarizeAttendance(records),
      review: review
        ? {
            overallQuality: review.overall_quality,
            intensity: review.intensity,
            objectiveOutcome: review.objective_outcome
          }
        : undefined,
      planDrillCount: (drillsByEvent.get(event.id) ?? []).length
    };
  });

  const attendance = summarizeAttendance(periodRecords);
  const reviewedSessions = new Set(periodSessionReviews.map((review) => review.event_id)).size;
  const activeGoals = goals.filter((goal) => goal.status === "identified" || goal.status === "in_progress");
  const dateRange = dateRangeForPeriod(filters, periodEvents, seasonSettings);
  const periodProgressUpdates = progressUpdates.filter((progress) => dateInRange(progress.recordedAt, dateRange));
  const periodDrillReviewRows = drillReviews.filter((review) => drillInstances.some((instance) => instance.id === review.session_drill_instance_id));
  const drillUsage = createDrillUsage(drillInstances, periodDrillReviewRows, periodEvents);
  const trainingMinutes = totalTrainingMinutes(periodEvents);
  const plannedEvents = events.filter((event) => event.planDrillCount > 0).length;

  return {
    activeSquad: { id: activeSquad.id, name: activeSquad.name },
    periodEventIds: periodEvents.map((event) => event.id),
    periodRangeLabel: describePeriodRange(filters, periodEvents, seasonSettings),
    trainingSessions: periodEvents.length,
    sessionsWithAttendance: events.filter((event) => event.attendance.recorded > 0).length,
    attendanceRecordCount: periodRecords.length,
    teamAttendanceRate: attendance.rate,
    present: attendance.present,
    late: attendance.late,
    absent: attendance.absent,
    notExpected: attendance.notExpected,
    notRecorded: attendance.notRecorded,
    reviewedSessions,
    reviewCoverage: periodEvents.length ? reviewedSessions / periodEvents.length : null,
    averageSessionQuality: calculateAverageRating(periodSessionReviews.map((review) => review.overall_quality)),
    averageSessionIntensity: calculateAverageRating(periodSessionReviews.map((review) => review.intensity)),
    objectiveOutcomes: {
      achieved: periodSessionReviews.filter((review) => review.objective_outcome === "achieved").length,
      partly_achieved: periodSessionReviews.filter((review) => review.objective_outcome === "partly_achieved").length,
      not_achieved: periodSessionReviews.filter((review) => review.objective_outcome === "not_achieved").length
    },
    focusDistribution: createFocusDistribution(periodEvents),
    totalTrainingMinutes: totalTrainingMinutes(periodEvents),
    averageTrainingMinutes: periodEvents.length && trainingMinutes !== null ? trainingMinutes / periodEvents.length : null,
    planCoverage: {
      planned: plannedEvents,
      total: periodEvents.length,
      rate: periodEvents.length ? plannedEvents / periodEvents.length : null
    },
    activeDevelopmentGoals: activeGoals.length,
    playersWithActiveGoals: new Set(activeGoals.map((goal) => goal.playerId)).size,
    goalsDueForReview: activeGoals.filter((goal) => goal.reviewDate && goal.reviewDate <= dateOnly(new Date())).length,
    goalsAchievedInPeriod: goals.filter((goal) => goal.status === "achieved" && goal.achievedAt && dateInRange(goal.achievedAt.slice(0, 10), dateRange)).length,
    progressUpdatesInPeriod: periodProgressUpdates.length,
    progressPlayersInPeriod: new Set(periodProgressUpdates.map((progress) => progress.playerId)).size,
    activeGoalCategoryDistribution: createGoalCategoryDistribution(activeGoals),
    latestProgressDistribution: createLatestProgressDistribution(activeGoals, progressUpdates),
    uniqueDrillsUsed: new Set(drillInstances.map((instance) => instance.source_drill_id).filter(Boolean)).size,
    drillInstancesUsed: drillInstances.length,
    reviewedDrillInstances: periodDrillReviewRows.length,
    averageDrillEffectiveness: calculateAverageRating(periodDrillReviewRows.map((review) => review.effectiveness_rating)),
    drillFeedbackCounts: {
      worked_well: periodDrillReviewRows.filter((review) => review.feedback_status === "worked_well").length,
      needs_adjustment: periodDrillReviewRows.filter((review) => review.feedback_status === "needs_adjustment").length,
      not_effective: periodDrillReviewRows.filter((review) => review.feedback_status === "not_effective").length
    },
    drillUsage,
    events
  };
}

function summarizeAttendance(records: PlayerAnalyticsRecord[]): TeamAnalyticsEvent["attendance"] {
  let present = 0;
  let late = 0;
  let absent = 0;
  let notExpected = 0;
  let notRecorded = 0;

  for (const record of records) {
    if (record.plannedStatus === "unavailable") notExpected += 1;
    if (!record.finalStatus) {
      notRecorded += 1;
      continue;
    }
    if (record.finalStatus === "present") present += 1;
    else if (record.finalStatus === "Z") late += 1;
    else absent += 1;
  }

  const attended = present + late;
  const recorded = attended + absent;
  return { present, late, absent, notExpected, notRecorded, attended, recorded, rate: recorded ? attended / recorded : null };
}

function createFocusDistribution(events: SquadTrainingEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const focus = event.focus?.trim();
    if (focus) counts.set(focus, (counts.get(focus) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, percentage: events.length ? count / events.length : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function createGoalCategoryDistribution(goals: DevelopmentGoalAnalytics[]) {
  const counts = new Map<PlayerDevelopmentGoalCategory, number>();
  for (const goal of goals) counts.set(goal.category, (counts.get(goal.category) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function createLatestProgressDistribution(goals: DevelopmentGoalAnalytics[], progressUpdates: DevelopmentProgressAnalytics[]) {
  const latestByGoal = new Map<string, DevelopmentProgressAnalytics>();
  for (const progress of progressUpdates) {
    const previous = latestByGoal.get(progress.goalId);
    if (!previous || `${progress.recordedAt}:${progress.id}` > `${previous.recordedAt}:${previous.id}`) latestByGoal.set(progress.goalId, progress);
  }
  const counts = new Map<PlayerDevelopmentProgress | "none", number>();
  for (const goal of goals) {
    const progress = latestByGoal.get(goal.id)?.progressLevel ?? "none";
    counts.set(progress, (counts.get(progress) ?? 0) + 1);
  }
  return (["needs_attention", "developing", "consistent", "achieved", "none"] as Array<PlayerDevelopmentProgress | "none">)
    .map((progress) => ({ progress, count: counts.get(progress) ?? 0 }))
    .filter((item) => item.count > 0);
}

function createDrillUsage(drillInstances: DrillInstanceRow[], drillReviews: DrillReviewRow[], events: SquadTrainingEvent[]): DrillUsageItem[] {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const reviewsByInstance = groupBy(drillReviews, (review) => review.session_drill_instance_id);
  const byDrill = new Map<string, DrillUsageItem>();
  for (const instance of drillInstances) {
    const key = instance.source_drill_id ?? instance.id;
    const existing = byDrill.get(key) ?? {
      drillId: instance.source_drill_id ?? undefined,
      title: instance.title,
      uses: 0,
      lastUsedAt: undefined,
      reviewed: 0,
      averageEffectiveness: null
    };
    const instanceReviews = reviewsByInstance.get(instance.id) ?? [];
    existing.uses += 1;
    existing.reviewed += instanceReviews.length;
    const eventDate = eventById.get(instance.event_id)?.date;
    if (eventDate && (!existing.lastUsedAt || eventDate > existing.lastUsedAt)) existing.lastUsedAt = eventDate;
    byDrill.set(key, existing);
  }

  return Array.from(byDrill.entries())
    .map(([key, item]) => {
      const reviews = drillInstances
        .filter((instance) => (instance.source_drill_id ?? instance.id) === key)
        .flatMap((instance) => reviewsByInstance.get(instance.id) ?? []);
      return { ...item, averageEffectiveness: calculateAverageRating(reviews.map((review) => review.effectiveness_rating)) };
    })
    .sort((a, b) => b.uses - a.uses || (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.title.localeCompare(b.title));
}

function totalTrainingMinutes(events: SquadTrainingEvent[]) {
  const values = events.map(eventDurationMinutes).filter((value): value is number => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function eventDurationMinutes(event: SquadTrainingEvent) {
  if (!event.endTime) return null;
  const start = timeToMinutes(event.startTime);
  const end = timeToMinutes(event.endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

function timeToMinutes(value?: string) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function dateRangeForPeriod(filters: AnalyticsFilters, events: SquadTrainingEvent[], seasonSettings: SeasonSettings) {
  if (filters.period === "all") return null;
  if (filters.period === "custom") {
    if (!filters.customFrom || !filters.customTo || filters.customFrom > filters.customTo) return { from: "", to: "" };
    return { from: filters.customFrom, to: filters.customTo };
  }
  if (filters.period === "last5" || filters.period === "last10") {
    const dates = events.map((event) => event.date).sort();
    if (!dates.length) return { from: "", to: "" };
    return { from: dates[0], to: dates[dates.length - 1] };
  }
  if (filters.period === "season") return seasonDateRange(new Date(), seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay);
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - (filters.period === "30d" ? 29 : 89));
  return { from: dateOnly(from), to: dateOnly(today) };
}

function dateInRange(date: string, range: { from: string; to: string } | null) {
  if (!range) return true;
  if (!range.from || !range.to) return false;
  return date >= range.from && date <= range.to;
}

function describePeriodRange(filters: AnalyticsFilters, events: SquadTrainingEvent[], seasonSettings: SeasonSettings) {
  const range = dateRangeForPeriod(filters, events, seasonSettings);
  if (!range) return "All historical trainings";
  if (!range.from || !range.to) return "No historical trainings in this period";
  return `${formatGermanDate(range.from)} - ${formatGermanDate(range.to)}`;
}

function seasonDateRange(today: Date, startMonth: number, startDay: number) {
  const currentYear = today.getFullYear();
  const startThisYear = new Date(currentYear, startMonth - 1, startDay);
  const from = today >= startThisYear ? startThisYear : new Date(currentYear - 1, startMonth - 1, startDay);
  const to = new Date(from.getFullYear() + 1, startMonth - 1, startDay - 1);
  return { from: dateOnly(from), to: dateOnly(to) };
}

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatGermanDate(date?: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    result.set(key, [...(result.get(key) ?? []), item]);
  }
  return result;
}

function mapAssessmentRow(row: AssessmentRow): PlayerCoachAssessment {
  return {
    id: row.id,
    userId: row.user_id,
    playerId: row.player_id,
    assessment: row.assessment,
    reason: row.reason ?? undefined,
    assessmentDate: row.assessment_date,
    reviewDate: row.review_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateParam(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
