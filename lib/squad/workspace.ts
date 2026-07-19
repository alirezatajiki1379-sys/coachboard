import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import {
  analyticsPeriodLabels,
  coachAssessmentLabels,
  createPlayerAnalyticsSummary,
  filterRecordsByPeriod,
  formatPercent,
  formatRating,
  playerName,
  type AnalyticsPeriod,
  type AnalyticsSortDirection,
  type PlayerAnalyticsRecord,
  type PlayerAnalyticsSummary
} from "@/lib/squad/analytics";
import { getSquadAnalyticsOverview } from "@/lib/squad/analytics-queries";
import { mapAttendanceRow, mapTrainingEventRow, type SquadAttendanceRow, type SquadTrainingEventRow } from "@/lib/squad/attendance-mappers";
import { mapGoalRow, mapObservationRow } from "@/lib/squad/development";
import { calculateAge } from "@/lib/squad/format";
import { latestApplicableMedicalPeriod, medicalLabel, medicalNeedsReview } from "@/lib/squad/player-hub";
import { mapPlayerMedicalPeriodRow, mapSquadPlayerRow, type PlayerMedicalPeriodRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import type { Database } from "@/types/database";
import type { PlayerCoachAssessment, PlayerDevelopmentGoal, PlayerMedicalPeriod, PlayerObservation } from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type GoalRow = Database["public"]["Tables"]["player_development_goals"]["Row"];
type ObservationRow = Database["public"]["Tables"]["player_observations"]["Row"];
type AssessmentRow = Database["public"]["Tables"]["player_coach_assessments"]["Row"];

export type WorkspaceView =
  | "all"
  | "by-position"
  | "needs-attention"
  | "development"
  | "performance"
  | "attendance"
  | "unavailable"
  | "trial-players"
  | "reviews-due";

export type WorkspacePlayersFilter = "active" | "roster" | "trial" | "archived";
export type WorkspaceAvailabilityFilter = "all" | "available" | "injured" | "sick" | "medical-review";
export type WorkspaceSortKey =
  | "name"
  | "position"
  | "age"
  | "availability"
  | "lastTraining"
  | "attendance"
  | "average"
  | "latestRating"
  | "trend"
  | "reliability"
  | "activeGoals"
  | "goalPriority"
  | "reviewDate"
  | "lastObservation"
  | "coachAssessment";

export type WorkspaceState = {
  view: WorkspaceView;
  players: WorkspacePlayersFilter;
  position?: string;
  availability: WorkspaceAvailabilityFilter;
  period: AnalyticsPeriod;
  sort: WorkspaceSortKey;
  direction: AnalyticsSortDirection;
  search: string;
  selectedPlayer?: string;
  coachAssessment?: string;
  developmentStatus?: string;
  reviewStatus?: string;
  evidenceBase?: string;
  ratingStatus?: string;
  customFrom?: string;
  customTo?: string;
};

export type AttentionIndicator = {
  id: string;
  label: string;
  tone: "red" | "amber" | "green" | "neutral";
  priority: number;
};

export type WorkspacePlayerSummary = {
  analytics: PlayerAnalyticsSummary;
  activeGoals: PlayerDevelopmentGoal[];
  latestObservation?: PlayerObservation;
  currentMedical?: PlayerMedicalPeriod;
  attention: AttentionIndicator[];
  positionGroup: PositionGroup;
  review: ReviewState;
};

export type WorkspaceData = {
  state: WorkspaceState;
  players: WorkspacePlayerSummary[];
  allPlayers: WorkspacePlayerSummary[];
  positions: string[];
  selected?: WorkspacePlayerSummary;
  periodLabel: string;
  periodRangeLabel: string;
  counts: {
    active: number;
    roster: number;
    trial: number;
    archived: number;
    unavailable: number;
    needsAttention: number;
    reviewsDue: number;
  };
};

export type PositionGroup = "Goalkeepers" | "Defenders" | "Midfielders" | "Attackers" | "Other";
export type ReviewState = {
  label: string;
  tone: "red" | "amber" | "green" | "neutral";
  dueDate?: string;
  days?: number;
  rank: number;
};

export const attentionThresholds = {
  noObservationDays: 30,
  lowAttendanceRate: 0.75,
  decliningTrend: -0.3,
  repeatedPenalisedLateness: 2
};

export const quickViews: Array<{ id: WorkspaceView; label: string; description: string; defaultSort: WorkspaceSortKey; defaultDirection: AnalyticsSortDirection }> = [
  { id: "all", label: "All Players", description: "Roster and Trial Players with current status.", defaultSort: "position", defaultDirection: "asc" },
  { id: "by-position", label: "By Position", description: "Grouped by broad football roles.", defaultSort: "position", defaultDirection: "asc" },
  { id: "needs-attention", label: "Needs Attention", description: "Transparent reasons only, no hidden score.", defaultSort: "reviewDate", defaultDirection: "asc" },
  { id: "development", label: "Development", description: "Goals, reviews and observations.", defaultSort: "reviewDate", defaultDirection: "asc" },
  { id: "performance", label: "Performance", description: "Ratings, trend and evidence.", defaultSort: "average", defaultDirection: "desc" },
  { id: "attendance", label: "Attendance", description: "Attendance rate and reliability.", defaultSort: "attendance", defaultDirection: "desc" },
  { id: "unavailable", label: "Unavailable", description: "Injured, sick and review-required players.", defaultSort: "availability", defaultDirection: "asc" },
  { id: "trial-players", label: "Trial Players", description: "Trial status and decision context.", defaultSort: "reviewDate", defaultDirection: "asc" },
  { id: "reviews-due", label: "Reviews Due", description: "Overdue, today and this week.", defaultSort: "reviewDate", defaultDirection: "asc" }
];

export function parseWorkspaceState(searchParams: Record<string, string | string[] | undefined>): WorkspaceState {
  const view = workspaceView(one(searchParams.view));
  const viewConfig = quickViews.find((item) => item.id === view) ?? quickViews[0];
  const sort = workspaceSort(one(searchParams.sort)) ?? viewConfig.defaultSort;
  const direction = directionValue(one(searchParams.direction)) ?? viewConfig.defaultDirection;
  const period = analyticsPeriod(one(searchParams.period));
  return {
    view,
    players: playersFilter(one(searchParams.players), view),
    position: one(searchParams.position) || undefined,
    availability: availabilityFilter(one(searchParams.availability), view),
    period,
    sort,
    direction,
    search: one(searchParams.search) ?? "",
    selectedPlayer: one(searchParams.selectedPlayer) || undefined,
    coachAssessment: one(searchParams.coachAssessment) || undefined,
    developmentStatus: one(searchParams.developmentStatus) || undefined,
    reviewStatus: one(searchParams.reviewStatus) || undefined,
    evidenceBase: one(searchParams.evidenceBase) || undefined,
    ratingStatus: one(searchParams.ratingStatus) || undefined,
    customFrom: normalizeDateParam(one(searchParams.from)),
    customTo: normalizeDateParam(one(searchParams.to))
  };
}

export async function getCoachWorkspaceData(
  supabase: SupabaseServerClient,
  userId: string,
  state: WorkspaceState
): Promise<WorkspaceData> {
  const db = supabase as unknown as SupabaseClient;
  const analyticsFilters = {
    period: state.period,
    playerType: "all" as const,
    ratedOnly: false,
    sort: "name" as const,
    direction: "asc" as const,
    customFrom: state.customFrom,
    customTo: state.customTo
  };
  const [{ summaries, positions, seasonSettings }, archivedPlayers, records, assessments, goalsByPlayer, observationsByPlayer, medicalByPlayer] = await Promise.all([
    getSquadAnalyticsOverview(supabase, userId, analyticsFilters),
    listArchivedPlayers(db, userId),
    listWorkspaceRecords(db, userId),
    listLatestAssessments(db, userId),
    listActiveGoals(db, userId),
    listLatestObservations(db, userId),
    listActiveMedical(db, userId)
  ]);

  const assessmentByPlayer = new Map(assessments.map((assessment) => [assessment.playerId, assessment]));
  const activeSummaries = summaries.map((summary) => {
    const assessment = assessmentByPlayer.get(summary.player.id);
    return assessment && assessment.id !== summary.assessment?.id
      ? createPlayerAnalyticsSummary(summary.player, records, state.period, assessment, seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay, state.customFrom, state.customTo)
      : summary;
  });

  const archivedSummaries = archivedPlayers.map((player) =>
    createPlayerAnalyticsSummary(player, records, state.period, assessmentByPlayer.get(player.id), seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay, state.customFrom, state.customTo)
  );
  const allSummaries = [...activeSummaries, ...archivedSummaries];
  const allPlayers = allSummaries.map((summary) => {
    const playerGoals = goalsByPlayer.get(summary.player.id) ?? [];
    const latestObservation = observationsByPlayer.get(summary.player.id);
    const currentMedical = latestApplicableMedicalPeriod(medicalByPlayer.get(summary.player.id) ?? [], todayDate());
    const review = getReviewState(playerGoals, summary.assessment);
    const attention = getAttentionIndicators(summary, playerGoals, latestObservation, currentMedical, review);
    return {
      analytics: summary,
      activeGoals: playerGoals,
      latestObservation,
      currentMedical,
      attention,
      positionGroup: positionGroup(summary.player.position),
      review
    };
  });

  const filtered = sortWorkspacePlayers(filterWorkspacePlayers(allPlayers, state), state.sort, state.direction);
  const selected = filtered.find((item) => item.analytics.player.id === state.selectedPlayer) ?? filtered[0];
  const active = allPlayers.filter((item) => !item.analytics.player.archivedAt);
  return {
    state,
    players: filtered,
    allPlayers,
    positions,
    selected,
    periodLabel: analyticsPeriodLabels[state.period],
    periodRangeLabel: periodRangeLabel(activeSummaries, state),
    counts: {
      active: active.length,
      roster: active.filter((item) => item.analytics.player.playerType === "roster").length,
      trial: active.filter((item) => item.analytics.player.playerType === "trial").length,
      archived: allPlayers.filter((item) => item.analytics.player.archivedAt).length,
      unavailable: active.filter((item) => item.currentMedical).length,
      needsAttention: active.filter((item) => item.attention.length).length,
      reviewsDue: active.filter((item) => item.review.rank <= 2).length
    }
  };
}

export function visibleAttention(indicators: AttentionIndicator[]) {
  return indicators.slice(0, 2);
}

export function hiddenAttentionCount(indicators: AttentionIndicator[]) {
  return Math.max(0, indicators.length - 2);
}

export function workspaceHref(state: WorkspaceState, patch: Partial<WorkspaceState>) {
  const params = new URLSearchParams();
  const next = { ...state, ...patch };
  if (next.view && next.view !== "all") params.set("view", next.view);
  if (next.players && next.players !== playersFilter(undefined, next.view)) params.set("players", next.players);
  if (next.position) params.set("position", next.position);
  if (next.availability && next.availability !== availabilityFilter(undefined, next.view)) params.set("availability", next.availability);
  if (next.period && next.period !== "season") params.set("period", next.period);
  if (next.sort) params.set("sort", next.sort);
  if (next.direction) params.set("direction", next.direction);
  if (next.search) params.set("search", next.search);
  if (next.selectedPlayer) params.set("selectedPlayer", next.selectedPlayer);
  if (next.coachAssessment) params.set("coachAssessment", next.coachAssessment);
  if (next.developmentStatus) params.set("developmentStatus", next.developmentStatus);
  if (next.reviewStatus) params.set("reviewStatus", next.reviewStatus);
  if (next.evidenceBase) params.set("evidenceBase", next.evidenceBase);
  if (next.ratingStatus) params.set("ratingStatus", next.ratingStatus);
  if (next.period === "custom") {
    if (next.customFrom) params.set("from", next.customFrom);
    if (next.customTo) params.set("to", next.customTo);
  }
  const query = params.toString();
  return `/squad${query ? `?${query}` : ""}`;
}

export function formatWorkspaceRating(value: number | null) {
  return value === null ? "-" : formatRating(value);
}

export function formatWorkspacePercent(value: number | null) {
  return value === null ? "-" : formatPercent(value);
}

function filterWorkspacePlayers(players: WorkspacePlayerSummary[], state: WorkspaceState) {
  const today = todayDate();
  const weekEnd = addDays(today, 7);
  return players.filter((item) => {
    const player = item.analytics.player;
    if (state.players !== "archived" && player.archivedAt) return false;
    if (state.players === "archived" && !player.archivedAt) return false;
    if (state.players === "roster" && player.playerType !== "roster") return false;
    if (state.players === "trial" && player.playerType !== "trial") return false;
    if (state.view === "trial-players" && player.playerType !== "trial") return false;
    if (state.view === "unavailable" && !item.currentMedical && !item.attention.some((indicator) => indicator.id === "medical-review")) return false;
    if (state.view === "needs-attention" && !item.attention.length) return false;
    if (state.view === "reviews-due" && !(item.review.dueDate && item.review.dueDate <= weekEnd)) return false;
    if (state.position && player.position !== state.position) return false;
    if (state.availability === "available" && item.currentMedical) return false;
    if (state.availability === "injured" && item.currentMedical?.type !== "injured") return false;
    if (state.availability === "sick" && item.currentMedical?.type !== "sick") return false;
    if (state.availability === "medical-review" && !item.attention.some((indicator) => indicator.id === "medical-review")) return false;
    if (state.coachAssessment && (item.analytics.assessment?.assessment ?? "decision_open") !== state.coachAssessment) return false;
    if (state.developmentStatus === "active-goals" && !item.activeGoals.length) return false;
    if (state.developmentStatus === "high-priority" && !item.activeGoals.some((goal) => goal.priority === "high")) return false;
    if (state.developmentStatus === "no-active-goals" && item.activeGoals.length) return false;
    if (state.developmentStatus === "review-overdue" && item.review.rank !== 1) return false;
    if (state.developmentStatus === "review-due" && item.review.rank > 3) return false;
    if (state.reviewStatus === "overdue" && item.review.rank !== 1) return false;
    if (state.reviewStatus === "today" && item.review.rank !== 2) return false;
    if (state.reviewStatus === "week" && item.review.rank !== 3) return false;
    if (state.reviewStatus === "upcoming" && item.review.rank !== 4) return false;
    if (state.reviewStatus === "none" && item.review.dueDate) return false;
    if (state.evidenceBase && item.analytics.evidenceBase.label !== state.evidenceBase) return false;
    if (state.ratingStatus === "rated" && item.analytics.rated === 0) return false;
    if (state.ratingStatus === "unrated" && item.analytics.rated > 0) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const haystack = [
        player.firstName,
        player.lastName,
        playerName(player),
        player.club,
        player.position,
        player.jerseyNumber
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function sortWorkspacePlayers(players: WorkspacePlayerSummary[], sort: WorkspaceSortKey, direction: AnalyticsSortDirection) {
  const dir = direction === "asc" ? 1 : -1;
  return [...players].sort((a, b) => {
    const fallback = playerName(a.analytics.player).localeCompare(playerName(b.analytics.player));
    if (sort === "position") return dir * (positionOrder(a.analytics.player.position) - positionOrder(b.analytics.player.position)) || fallback;
    if (sort === "age") return nullableNumberCompare(ageValue(a), ageValue(b), direction, "last") || fallback;
    if (sort === "availability") return dir * (availabilityRank(a) - availabilityRank(b)) || fallback;
    if (sort === "lastTraining") return nullableStringCompare(a.analytics.latestTraining?.event?.date, b.analytics.latestTraining?.event?.date, direction) || fallback;
    if (sort === "attendance") return nullableNumberCompare(a.analytics.attendanceRate, b.analytics.attendanceRate, direction, "last") || fallback;
    if (sort === "average") return nullableNumberCompare(a.analytics.averageRating, b.analytics.averageRating, direction, "last") || nullableNumberCompare(a.analytics.rated, b.analytics.rated, "desc", "last") || fallback;
    if (sort === "latestRating") return nullableNumberCompare(a.analytics.latestRating ?? null, b.analytics.latestRating ?? null, direction, "last") || fallback;
    if (sort === "trend") return nullableNumberCompare(a.analytics.trend.value, b.analytics.trend.value, direction, "last") || fallback;
    if (sort === "reliability") return dir * (Math.abs(a.analytics.reliabilityPenalty) - Math.abs(b.analytics.reliabilityPenalty)) || fallback;
    if (sort === "activeGoals") return dir * (a.activeGoals.length - b.activeGoals.length) || fallback;
    if (sort === "goalPriority") return dir * (goalPriorityRank(a) - goalPriorityRank(b)) || fallback;
    if (sort === "reviewDate") return reviewCompare(a, b) || fallback;
    if (sort === "lastObservation") return nullableStringCompare(a.latestObservation?.observationDate, b.latestObservation?.observationDate, direction, "last") || fallback;
    if (sort === "coachAssessment") return dir * (assessmentRank(a.analytics.assessment) - assessmentRank(b.analytics.assessment)) || fallback;
    return dir * fallback;
  });
}

function getAttentionIndicators(
  summary: PlayerAnalyticsSummary,
  goals: PlayerDevelopmentGoal[],
  latestObservation: PlayerObservation | undefined,
  medical: PlayerMedicalPeriod | undefined,
  review: ReviewState
): AttentionIndicator[] {
  const indicators: AttentionIndicator[] = [];
  if (review.rank === 1) indicators.push({ id: "review-overdue", label: "Review overdue", tone: "red", priority: 1 });
  if (medical && medicalNeedsReview(medical)) indicators.push({ id: "medical-review", label: "Medical review needed", tone: "amber", priority: 2 });
  if (summary.player.playerType === "trial" && (!summary.assessment || summary.assessment.assessment === "decision_open" || summary.assessment.assessment === "continue_observing")) {
    indicators.push({ id: "trial-decision", label: "Trial decision open", tone: "amber", priority: 3 });
  }
  if (medical?.type === "injured") indicators.push({ id: "injured", label: "Currently injured", tone: "red", priority: 4 });
  if (medical?.type === "sick") indicators.push({ id: "sick", label: "Currently sick", tone: "amber", priority: 5 });
  if (summary.trend.value !== null && summary.trend.value <= attentionThresholds.decliningTrend) indicators.push({ id: "declining-trend", label: "Declining trend", tone: "red", priority: 6 });
  if (summary.attendanceRate !== null && summary.attendanceRate < attentionThresholds.lowAttendanceRate) indicators.push({ id: "low-attendance", label: "Low attendance", tone: "amber", priority: 7 });
  if (isObservationOld(latestObservation)) indicators.push({ id: "no-observation", label: "No recent observation", tone: "neutral", priority: 8 });
  if (!hasRatingInLastThreeAttended(summary.records)) indicators.push({ id: "no-recent-rating", label: "No recent rating", tone: "neutral", priority: 9 });
  if (goals.some((goal) => goal.priority === "high")) indicators.push({ id: "high-goal", label: "High-priority goal", tone: "amber", priority: 10 });
  if (summary.records.filter((record) => record.finalStatus === "Z" && record.latePenaltyApplied).length >= attentionThresholds.repeatedPenalisedLateness) {
    indicators.push({ id: "repeated-late", label: "Repeated lateness", tone: "amber", priority: 11 });
  }
  if (summary.trend.value !== null && summary.trend.value >= 0.3) indicators.push({ id: "improving", label: "Improving", tone: "green", priority: 20 });
  return indicators.sort((a, b) => a.priority - b.priority);
}

function getReviewState(goals: PlayerDevelopmentGoal[], assessment?: PlayerCoachAssessment): ReviewState {
  const dates = [
    ...goals.filter((goal) => goal.status === "active" && goal.reviewDate).map((goal) => goal.reviewDate as string),
    assessment?.reviewDate
  ].filter((date): date is string => Boolean(date)).sort();
  const dueDate = dates[0];
  if (!dueDate) return { label: "No review date", tone: "neutral", rank: 9 };
  const today = todayDate();
  const delta = dayDiff(dueDate, today);
  if (dueDate < today) return { label: `Overdue ${Math.abs(delta)}d`, tone: "red", dueDate, days: delta, rank: 1 };
  if (dueDate === today) return { label: "Due today", tone: "amber", dueDate, days: 0, rank: 2 };
  if (dueDate <= addDays(today, 7)) return { label: `Due in ${delta}d`, tone: "amber", dueDate, days: delta, rank: 3 };
  return { label: `Due ${formatShortDate(dueDate)}`, tone: "neutral", dueDate, days: delta, rank: 4 };
}

function positionGroup(position?: string): PositionGroup {
  const normalized = (position ?? "").toUpperCase().trim();
  if (["GK", "TW"].includes(normalized)) return "Goalkeepers";
  if (["CB", "IV", "RB", "RV", "LB", "LV"].includes(normalized)) return "Defenders";
  if (["DM", "ZDM", "CM", "ZM", "AM", "ZOM"].includes(normalized)) return "Midfielders";
  if (["RW", "RF", "LW", "LF", "ST"].includes(normalized)) return "Attackers";
  return "Other";
}

function positionOrder(position?: string) {
  const groupRanks: Record<PositionGroup, number> = { Goalkeepers: 1, Defenders: 2, Midfielders: 3, Attackers: 4, Other: 5 };
  return groupRanks[positionGroup(position)] * 100 + (position ?? "ZZ").localeCompare("");
}

function availabilityRank(player: WorkspacePlayerSummary) {
  if (player.currentMedical && medicalNeedsReview(player.currentMedical)) return 1;
  if (player.currentMedical?.type === "injured") return 2;
  if (player.currentMedical?.type === "sick") return 3;
  return 4;
}

function availabilityFilter(value: string | undefined, view: WorkspaceView): WorkspaceAvailabilityFilter {
  if (value === "available" || value === "injured" || value === "sick" || value === "medical-review") return value;
  return view === "unavailable" ? "all" : "all";
}

function playersFilter(value: string | undefined, view: WorkspaceView): WorkspacePlayersFilter {
  if (value === "roster" || value === "trial" || value === "archived") return value;
  if (view === "trial-players") return "trial";
  return "active";
}

function workspaceView(value?: string): WorkspaceView {
  return quickViews.some((item) => item.id === value) ? value as WorkspaceView : "all";
}

function workspaceSort(value?: string): WorkspaceSortKey | undefined {
  const allowed: WorkspaceSortKey[] = ["name", "position", "age", "availability", "lastTraining", "attendance", "average", "latestRating", "trend", "reliability", "activeGoals", "goalPriority", "reviewDate", "lastObservation", "coachAssessment"];
  return allowed.includes(value as WorkspaceSortKey) ? value as WorkspaceSortKey : undefined;
}

function analyticsPeriod(value?: string): AnalyticsPeriod {
  return value === "last5" || value === "last10" || value === "30d" || value === "90d" || value === "all" || value === "custom" ? value : "season";
}

function directionValue(value?: string): AnalyticsSortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
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

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function listWorkspaceRecords(db: SupabaseClient, userId: string): Promise<PlayerAnalyticsRecord[]> {
  const { data, error } = await db.from("squad_attendance_records").select("*, squad_training_events(*)").eq("user_id", userId);
  if (error) return [];
  return ((data ?? []) as Array<SquadAttendanceRow & { squad_training_events?: SquadTrainingEventRow | null }>)
    .filter((row) => row.squad_training_events && !row.squad_training_events.deleted_at)
    .map((row) => ({ ...mapAttendanceRow(row), event: row.squad_training_events ? mapTrainingEventRow(row.squad_training_events) : undefined }));
}

async function listArchivedPlayers(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("squad_players").select("*").eq("user_id", userId).not("archived_at", "is", null);
  if (error) return [];
  return ((data ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);
}

async function listLatestAssessments(db: SupabaseClient, userId: string): Promise<PlayerCoachAssessment[]> {
  const { data, error } = await db.from("player_coach_assessments").select("*").eq("user_id", userId).order("assessment_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) return [];
  const latest = new Map<string, PlayerCoachAssessment>();
  for (const row of (data ?? []) as AssessmentRow[]) {
    if (!latest.has(row.player_id)) latest.set(row.player_id, {
      id: row.id,
      userId: row.user_id,
      playerId: row.player_id,
      assessment: row.assessment,
      reason: row.reason ?? undefined,
      assessmentDate: row.assessment_date,
      reviewDate: row.review_date ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }
  return Array.from(latest.values());
}

async function listActiveGoals(db: SupabaseClient, userId: string) {
  const result = new Map<string, PlayerDevelopmentGoal[]>();
  const { data, error } = await db.from("player_development_goals").select("*").eq("user_id", userId).eq("status", "active");
  if (error) return result;
  for (const row of (data ?? []) as GoalRow[]) {
    const goal = { ...mapGoalRow(row), actions: [], observations: [] };
    result.set(goal.playerId, [...(result.get(goal.playerId) ?? []), goal]);
  }
  return result;
}

async function listLatestObservations(db: SupabaseClient, userId: string) {
  const result = new Map<string, PlayerObservation>();
  const { data, error } = await db.from("player_observations").select("*").eq("user_id", userId).order("observation_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) return result;
  for (const row of (data ?? []) as ObservationRow[]) {
    const observation = mapObservationRow(row);
    if (!result.has(observation.playerId)) result.set(observation.playerId, observation);
  }
  return result;
}

async function listActiveMedical(db: SupabaseClient, userId: string) {
  const result = new Map<string, PlayerMedicalPeriod[]>();
  const { data, error } = await db.from("player_medical_periods").select("*").eq("user_id", userId).eq("status", "active");
  if (error) return result;
  for (const row of (data ?? []) as PlayerMedicalPeriodRow[]) {
    const period = mapPlayerMedicalPeriodRow(row);
    result.set(period.playerId, [...(result.get(period.playerId) ?? []), period]);
  }
  return result;
}

function periodRangeLabel(summaries: PlayerAnalyticsSummary[], state: WorkspaceState) {
  if (state.period === "custom") {
    if (!state.customFrom || !state.customTo) return "Choose From and To dates";
    return `${formatShortDate(state.customFrom)} - ${formatShortDate(state.customTo)}`;
  }
  const records = summaries.flatMap((summary) => summary.records);
  const filtered = records.length ? filterRecordsByPeriod(records, state.period, new Date(), 7, 1, state.customFrom, state.customTo) : [];
  const dates = Array.from(new Set(filtered.map((record) => record.event?.date).filter((date): date is string => Boolean(date)))).sort();
  if (state.period === "last5" || state.period === "last10") {
    return dates.length ? `${dates.length} training${dates.length === 1 ? "" : "s"} available · ${formatShortDate(dates[0])} - ${formatShortDate(dates[dates.length - 1])}` : "No trainings in this period";
  }
  return dates.length ? `${formatShortDate(dates[0])} - ${formatShortDate(dates[dates.length - 1])}` : "No trainings in this period";
}

function hasRatingInLastThreeAttended(records: PlayerAnalyticsRecord[]) {
  const attended = records.filter((record) => record.finalStatus === "present" || record.finalStatus === "Z").slice(0, 3);
  if (!attended.length) return true;
  return attended.some((record) => typeof record.overallRating === "number");
}

function isObservationOld(observation?: PlayerObservation) {
  if (!observation) return true;
  return dayDiff(todayDate(), observation.observationDate) > attentionThresholds.noObservationDays;
}

function ageValue(player: WorkspacePlayerSummary) {
  return calculateAge(player.analytics.player.dateOfBirth) ?? null;
}

function goalPriorityRank(player: WorkspacePlayerSummary) {
  if (player.activeGoals.some((goal) => goal.priority === "high")) return 1;
  if (player.activeGoals.some((goal) => goal.priority === "medium")) return 2;
  if (player.activeGoals.some((goal) => goal.priority === "low")) return 3;
  return 9;
}

function assessmentRank(assessment?: PlayerCoachAssessment) {
  const order: Record<string, number> = {
    below_required_level: 1,
    decision_open: 2,
    continue_observing: 3,
    positive_development: 4,
    prospect_player: 5,
    squad_candidate: 6
  };
  return order[assessment?.assessment ?? "decision_open"] ?? 2;
}

function reviewCompare(a: WorkspacePlayerSummary, b: WorkspacePlayerSummary) {
  if (a.review.rank !== b.review.rank) return a.review.rank - b.review.rank;
  return (a.review.dueDate ?? "9999-12-31").localeCompare(b.review.dueDate ?? "9999-12-31");
}

function nullableNumberCompare(a: number | null | undefined, b: number | null | undefined, direction: AnalyticsSortDirection, nulls: "first" | "last" = "last") {
  if (a == null && b == null) return 0;
  if (a == null) return nulls === "first" ? -1 : 1;
  if (b == null) return nulls === "first" ? 1 : -1;
  return direction === "asc" ? a - b : b - a;
}

function nullableStringCompare(a: string | undefined, b: string | undefined, direction: AnalyticsSortDirection, nulls: "first" | "last" = "last") {
  if (!a && !b) return 0;
  if (!a) return nulls === "first" ? -1 : 1;
  if (!b) return nulls === "first" ? 1 : -1;
  return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function formatShortDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

export function availabilityLabel(player: WorkspacePlayerSummary) {
  const medical = player.currentMedical;
  if (!medical) return "Available";
  if (medicalNeedsReview(medical)) return "Needs review";
  return medicalLabel(medical);
}

export function availabilityDetail(player: WorkspacePlayerSummary) {
  const medical = player.currentMedical;
  if (!medical) return "Current";
  if (medical.expectedReturnDate) return `Expected ${formatShortDate(medical.expectedReturnDate)}`;
  return "Return unknown";
}

export { coachAssessmentLabels };
