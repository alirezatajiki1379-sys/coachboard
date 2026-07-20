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
import { getAttentionPreferences, getPlayerAttentionItems, attentionTone } from "@/lib/squad/attention";
import { mapAttendanceRow, mapTrainingEventRow, type SquadAttendanceRow, type SquadTrainingEventRow } from "@/lib/squad/attendance-mappers";
import { mapGoalRow, mapObservationRow } from "@/lib/squad/development";
import { calculateAge } from "@/lib/squad/format";
import { latestApplicableMedicalPeriod, medicalLabel, medicalNeedsReview } from "@/lib/squad/player-hub";
import { mapPlayerMedicalPeriodRow, mapSquadPlayerRow, type PlayerMedicalPeriodRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import { ensureActiveSquad } from "@/lib/squad/squads";
import type { Database } from "@/types/database";
import type { PlayerCoachAssessment, PlayerDevelopmentGoal, PlayerMedicalPeriod, PlayerObservation } from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type GoalRow = Database["public"]["Tables"]["player_development_goals"]["Row"];
type ObservationRow = Database["public"]["Tables"]["player_observations"]["Row"];
type AssessmentRow = Database["public"]["Tables"]["player_coach_assessments"]["Row"];
type WorkspaceViewRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  kind: "system" | "saved";
  system_view_id: string | null;
  configuration: unknown;
  display_order: number | null;
  is_default: boolean | null;
  updated_at: string;
};

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
  savedView?: string;
  customize: boolean;
  hasExplicitState: boolean;
  players: WorkspacePlayersFilter;
  position?: string;
  availability: WorkspaceAvailabilityFilter;
  period: AnalyticsPeriod;
  sort: WorkspaceSortKey;
  direction: AnalyticsSortDirection;
  search: string;
  selectedPlayer?: string;
  importBatch?: string;
  coachAssessment?: string;
  developmentStatus?: string;
  reviewStatus?: string;
  evidenceBase?: string;
  ratingStatus?: string;
  customFrom?: string;
  customTo?: string;
};

export type WorkspaceColumnCategory = "Player" | "Squad" | "Availability" | "Performance" | "Attendance" | "Development" | "Review" | "Observation" | "Trial";
export type WorkspaceColumnId =
  | "player"
  | "position"
  | "secondaryPositions"
  | "age"
  | "dateOfBirth"
  | "strongFoot"
  | "jerseyNumber"
  | "club"
  | "playerType"
  | "captainStatus"
  | "joinedDate"
  | "archivedStatus"
  | "availability"
  | "expectedReturn"
  | "medicalReview"
  | "attendance"
  | "attendedTrainings"
  | "relevantTrainings"
  | "lastTraining"
  | "reliability"
  | "penalisedLateness"
  | "lateCancellations"
  | "average"
  | "latestRating"
  | "trend"
  | "ratedTrainings"
  | "evidence"
  | "recentRatings"
  | "activeGoals"
  | "goalPriority"
  | "review"
  | "coachAssessment"
  | "lastObservation"
  | "observationAge"
  | "trialDuration"
  | "trialTrainings"
  | "trialRatedTrainings"
  | "trialDecision";

export type WorkspaceMetricId =
  | "average"
  | "trend"
  | "attendance"
  | "reliability"
  | "latestRating"
  | "ratedTrainings"
  | "evidence"
  | "activeGoals"
  | "goalPriority"
  | "review"
  | "coachAssessment"
  | "lastObservation"
  | "expectedReturn"
  | "trialDuration";

export type WorkspaceGroupMode = "none" | "positionGroup" | "playerType";
export type WorkspaceDensity = "compact" | "comfortable";
export type WorkspaceInspectorMode = "open" | "collapsed";

export type WorkspaceConfiguration = {
  version: 1;
  visibleColumns: WorkspaceColumnId[];
  columnOrder: WorkspaceColumnId[];
  mobileMetrics: WorkspaceMetricId[];
  filters: Partial<Pick<WorkspaceState, "players" | "position" | "availability" | "period" | "sort" | "direction" | "coachAssessment" | "developmentStatus" | "reviewStatus" | "evidenceBase" | "ratingStatus" | "customFrom" | "customTo">> & { search?: string };
  quickViewId?: WorkspaceView | null;
  groupMode: WorkspaceGroupMode;
  density: WorkspaceDensity;
  inspectorMode: WorkspaceInspectorMode;
  showAttentionIndicators: boolean;
};

export type WorkspaceColumnDefinition = {
  id: WorkspaceColumnId;
  label: string;
  description: string;
  category: WorkspaceColumnCategory;
  required?: boolean;
  sortable?: WorkspaceSortKey;
  desktopOnly?: boolean;
};

export type WorkspaceMetricDefinition = {
  id: WorkspaceMetricId;
  label: string;
  description: string;
};

export type WorkspaceSavedView = {
  id: string;
  name: string;
  description?: string;
  kind: "system" | "saved";
  systemViewId?: WorkspaceView;
  configuration: WorkspaceConfiguration;
  displayOrder: number;
  isDefault: boolean;
  updatedAt: string;
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
  configuration: WorkspaceConfiguration;
  savedViews: WorkspaceSavedView[];
  systemOverride?: WorkspaceSavedView;
  activeSavedView?: WorkspaceSavedView;
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

export const workspaceColumns: WorkspaceColumnDefinition[] = [
  { id: "player", label: "Player", description: "Player identity and roster type.", category: "Player", required: true, sortable: "name" },
  { id: "position", label: "Position", description: "Primary position.", category: "Player", sortable: "position" },
  { id: "secondaryPositions", label: "Secondary positions", description: "Optional secondary roles.", category: "Player" },
  { id: "age", label: "Age", description: "Calculated from date of birth.", category: "Player", sortable: "age" },
  { id: "dateOfBirth", label: "Birthdate", description: "Player birthdate.", category: "Player" },
  { id: "strongFoot", label: "Dominant foot", description: "Strong foot.", category: "Player" },
  { id: "jerseyNumber", label: "Jersey", description: "Jersey number.", category: "Squad" },
  { id: "club", label: "Club", description: "Current or previous club.", category: "Squad" },
  { id: "playerType", label: "Player type", description: "Roster or Trial Player.", category: "Squad" },
  { id: "captainStatus", label: "Captain", description: "Captain status where available.", category: "Squad" },
  { id: "joinedDate", label: "Joined", description: "Joined date.", category: "Squad" },
  { id: "archivedStatus", label: "Archived", description: "Archived player status.", category: "Squad" },
  { id: "availability", label: "Availability", description: "Current operational medical availability.", category: "Availability", sortable: "availability" },
  { id: "expectedReturn", label: "Expected return", description: "Expected medical return date only.", category: "Availability" },
  { id: "medicalReview", label: "Medical review", description: "Medical return review status.", category: "Availability" },
  { id: "attendance", label: "Attendance", description: "Attendance percentage in the selected period.", category: "Attendance", sortable: "attendance" },
  { id: "attendedTrainings", label: "Attended", description: "Attended trainings in period.", category: "Attendance" },
  { id: "relevantTrainings", label: "Relevant trainings", description: "Trainings considered for attendance.", category: "Attendance" },
  { id: "lastTraining", label: "Last training", description: "Most recent training in period.", category: "Attendance", sortable: "lastTraining" },
  { id: "reliability", label: "Reliability", description: "Reliability penalty.", category: "Attendance", sortable: "reliability" },
  { id: "penalisedLateness", label: "Penalised late", description: "Penalised late arrivals.", category: "Attendance" },
  { id: "lateCancellations", label: "Late cancellations", description: "Late cancellations.", category: "Attendance" },
  { id: "average", label: "Average", description: "Average rating in period.", category: "Performance", sortable: "average" },
  { id: "latestRating", label: "Latest rating", description: "Latest rating in period.", category: "Performance", sortable: "latestRating" },
  { id: "trend", label: "Trend", description: "Latest trend in period.", category: "Performance", sortable: "trend" },
  { id: "ratedTrainings", label: "Rated trainings", description: "Number of rated trainings.", category: "Performance" },
  { id: "evidence", label: "Evidence", description: "Evidence base.", category: "Performance" },
  { id: "recentRatings", label: "Recent ratings", description: "Latest rating values.", category: "Performance" },
  { id: "activeGoals", label: "Active goals", description: "Active development goal count.", category: "Development", sortable: "activeGoals" },
  { id: "goalPriority", label: "Goal priority", description: "Highest active goal priority.", category: "Development", sortable: "goalPriority" },
  { id: "review", label: "Review", description: "Next or overdue review.", category: "Review", sortable: "reviewDate" },
  { id: "coachAssessment", label: "Coach assessment", description: "Manual coach assessment.", category: "Review", sortable: "coachAssessment" },
  { id: "lastObservation", label: "Last observation", description: "Most recent observation date.", category: "Observation", sortable: "lastObservation" },
  { id: "observationAge", label: "Observation age", description: "Days since latest observation.", category: "Observation" },
  { id: "trialDuration", label: "Trial duration", description: "Days since trial started.", category: "Trial" },
  { id: "trialTrainings", label: "Trial attended", description: "Trial attended trainings.", category: "Trial" },
  { id: "trialRatedTrainings", label: "Trial rated", description: "Trial rated trainings.", category: "Trial" },
  { id: "trialDecision", label: "Trial decision", description: "Current trial assessment.", category: "Trial" }
];

export const workspaceMobileMetrics: WorkspaceMetricDefinition[] = [
  { id: "average", label: "Average", description: "Average rating." },
  { id: "trend", label: "Trend", description: "Rating trend." },
  { id: "attendance", label: "Attendance", description: "Attendance percentage." },
  { id: "reliability", label: "Reliability", description: "Reliability penalty." },
  { id: "latestRating", label: "Latest rating", description: "Latest rating." },
  { id: "ratedTrainings", label: "Rated trainings", description: "Rated training count." },
  { id: "evidence", label: "Evidence", description: "Evidence base." },
  { id: "activeGoals", label: "Active goals", description: "Active development goals." },
  { id: "goalPriority", label: "Goal priority", description: "Highest goal priority." },
  { id: "review", label: "Review", description: "Review status." },
  { id: "coachAssessment", label: "Coach assessment", description: "Manual assessment." },
  { id: "lastObservation", label: "Last observation", description: "Latest observation." },
  { id: "expectedReturn", label: "Expected return", description: "Medical expected return." },
  { id: "trialDuration", label: "Trial duration", description: "Trial duration." }
];

const defaultColumnsByView: Record<WorkspaceView, WorkspaceColumnId[]> = {
  all: ["player", "position", "age", "availability", "attendance", "average", "trend", "activeGoals", "review"],
  "by-position": ["player", "position", "age", "availability", "attendance", "average", "activeGoals"],
  "needs-attention": ["player", "position", "availability", "attendance", "trend", "lastObservation", "review"],
  development: ["player", "position", "activeGoals", "goalPriority", "review", "coachAssessment", "lastObservation", "average"],
  performance: ["player", "position", "average", "trend", "latestRating", "ratedTrainings", "evidence", "attendance"],
  attendance: ["player", "position", "availability", "attendance", "attendedTrainings", "reliability", "penalisedLateness", "lastTraining"],
  unavailable: ["player", "position", "availability", "expectedReturn", "medicalReview", "lastTraining"],
  "trial-players": ["player", "position", "trialDuration", "trialTrainings", "average", "evidence", "coachAssessment", "review"],
  "reviews-due": ["player", "position", "review", "activeGoals", "goalPriority", "coachAssessment", "lastObservation"]
};

const defaultMobileMetricsByView: Record<WorkspaceView, WorkspaceMetricId[]> = {
  all: ["attendance", "average", "trend", "review"],
  "by-position": ["attendance", "average", "activeGoals", "review"],
  "needs-attention": ["attendance", "trend", "lastObservation", "review"],
  development: ["activeGoals", "goalPriority", "review", "coachAssessment"],
  performance: ["average", "trend", "latestRating", "evidence"],
  attendance: ["attendance", "reliability", "lastObservation", "expectedReturn"],
  unavailable: ["expectedReturn", "lastObservation", "attendance", "review"],
  "trial-players": ["trialDuration", "attendance", "average", "coachAssessment"],
  "reviews-due": ["review", "activeGoals", "goalPriority", "lastObservation"]
};

export function parseWorkspaceState(searchParams: Record<string, string | string[] | undefined>): WorkspaceState {
  const view = workspaceView(one(searchParams.view));
  const viewConfig = quickViews.find((item) => item.id === view) ?? quickViews[0];
  const sort = workspaceSort(one(searchParams.sort)) ?? viewConfig.defaultSort;
  const direction = directionValue(one(searchParams.direction)) ?? viewConfig.defaultDirection;
  const period = analyticsPeriod(one(searchParams.period));
  return {
    view,
    savedView: one(searchParams.savedView) || undefined,
    customize: one(searchParams.customize) === "true",
    hasExplicitState: Object.keys(searchParams).some((key) => searchParams[key] !== undefined),
    players: playersFilter(one(searchParams.players), view),
    position: one(searchParams.position) || undefined,
    availability: availabilityFilter(one(searchParams.availability), view),
    period,
    sort,
    direction,
    search: one(searchParams.search) ?? "",
    selectedPlayer: one(searchParams.selectedPlayer) || undefined,
    importBatch: one(searchParams.importBatch) || undefined,
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
  state: WorkspaceState,
  options: { includeAttention?: boolean } = {}
): Promise<WorkspaceData> {
  const includeAttention = options.includeAttention ?? true;
  const db = supabase as unknown as SupabaseClient;
  const activeTeam = await ensureActiveSquad(supabase, userId);
  const savedViews = await listWorkspaceViews(db, userId);
  const defaultView = savedViews.find((view) => view.isDefault);
  const requestedSavedView = state.savedView ? savedViews.find((view) => view.id === state.savedView && view.kind === "saved") : undefined;
  const defaultSavedView = !state.hasExplicitState && defaultView?.kind === "saved" ? defaultView : undefined;
  const defaultSystemView = !state.hasExplicitState && defaultView?.kind === "system" ? defaultView : undefined;
  const activeSavedView = requestedSavedView ?? defaultSavedView;
  const baseView = activeSavedView?.configuration.quickViewId ?? defaultSystemView?.systemViewId ?? state.view;
  const systemOverride = savedViews.find((view) => view.kind === "system" && view.systemViewId === baseView);
  const configuration = normalizeWorkspaceConfiguration(
    activeSavedView?.configuration ?? systemOverride?.configuration ?? defaultWorkspaceConfiguration(baseView),
    baseView
  );
  const effectiveState = applyConfigurationToState({ ...state, view: baseView, savedView: activeSavedView?.id }, configuration);
  const analyticsFilters = {
    period: effectiveState.period,
    playerType: "all" as const,
    ratedOnly: false,
    sort: "name" as const,
    direction: "asc" as const,
    customFrom: effectiveState.customFrom,
    customTo: effectiveState.customTo
  };
  const [{ summaries, positions, seasonSettings }, archivedPlayers, records, assessments, goalsByPlayer, observationsByPlayer, medicalByPlayer, attentionPreferences] = await Promise.all([
    getSquadAnalyticsOverview(supabase, userId, analyticsFilters),
    listArchivedPlayers(db, userId),
    listWorkspaceRecords(db, userId),
    listLatestAssessments(db, userId),
    listActiveGoals(db, userId),
    listLatestObservations(db, userId),
    listActiveMedical(db, userId),
    getAttentionPreferences(db, userId)
  ]);

  const assessmentByPlayer = new Map(assessments.map((assessment) => [assessment.playerId, assessment]));
  const teamSummaries = summaries.filter((summary) => summary.player.squadId === activeTeam.id);
  const activeSummaries = teamSummaries.map((summary) => {
    const assessment = assessmentByPlayer.get(summary.player.id);
    return assessment && assessment.id !== summary.assessment?.id
      ? createPlayerAnalyticsSummary(summary.player, records, effectiveState.period, assessment, seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay, effectiveState.customFrom, effectiveState.customTo)
      : summary;
  });

  const archivedSummaries = archivedPlayers.filter((player) => player.squadId === activeTeam.id).map((player) =>
    createPlayerAnalyticsSummary(player, records, effectiveState.period, assessmentByPlayer.get(player.id), seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay, effectiveState.customFrom, effectiveState.customTo)
  );
  const allSummaries = [...activeSummaries, ...archivedSummaries];
  const resolvedPeriodLabel = periodRangeLabel(activeSummaries, effectiveState);
  const allPlayers = allSummaries.map((summary) => {
    const playerGoals = goalsByPlayer.get(summary.player.id) ?? [];
    const latestObservation = observationsByPlayer.get(summary.player.id);
    const currentMedical = latestApplicableMedicalPeriod(medicalByPlayer.get(summary.player.id) ?? [], todayDate());
    const review = getReviewState(playerGoals, summary.assessment);
    const workspaceSummary: WorkspacePlayerSummary = {
      analytics: summary,
      activeGoals: playerGoals,
      latestObservation,
      currentMedical,
      attention: [],
      positionGroup: positionGroup(summary.player.position),
      review
    };
    const attention = includeAttention
      ? getPlayerAttentionItems(workspaceSummary, attentionPreferences, {
          today: todayDate(),
          periodLabel: resolvedPeriodLabel
        }).map((item) => ({
          id: item.key,
          label: item.title,
          tone: attentionTone(item.priority),
          priority: item.priority === "critical" ? 0 : item.priority === "high" ? 1 : item.priority === "medium" ? 2 : item.priority === "low" ? 3 : 9
        }))
      : [];
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

  const filtered = sortWorkspacePlayers(filterWorkspacePlayers(allPlayers, effectiveState), effectiveState.sort, effectiveState.direction);
  const selected = filtered.find((item) => item.analytics.player.id === effectiveState.selectedPlayer) ?? filtered[0];
  const active = allPlayers.filter((item) => !item.analytics.player.archivedAt);
  return {
    state: effectiveState,
    configuration,
    savedViews,
    systemOverride,
    activeSavedView,
    players: filtered,
    allPlayers,
    positions,
    selected,
    periodLabel: analyticsPeriodLabels[effectiveState.period],
    periodRangeLabel: resolvedPeriodLabel,
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

export function defaultWorkspaceConfiguration(view: WorkspaceView): WorkspaceConfiguration {
  const viewConfig = quickViews.find((item) => item.id === view) ?? quickViews[0];
  return {
    version: 1,
    visibleColumns: defaultColumnsByView[view],
    columnOrder: workspaceColumns.map((column) => column.id),
    mobileMetrics: defaultMobileMetricsByView[view],
    filters: {
      players: playersFilter(undefined, view),
      availability: availabilityFilter(undefined, view),
      period: "season",
      sort: viewConfig.defaultSort,
      direction: viewConfig.defaultDirection
    },
    quickViewId: view,
    groupMode: view === "by-position" ? "positionGroup" : "none",
    density: "compact",
    inspectorMode: "open",
    showAttentionIndicators: true
  };
}

export function normalizeWorkspaceConfiguration(input: unknown, view: WorkspaceView): WorkspaceConfiguration {
  const fallback = defaultWorkspaceConfiguration(view);
  const raw = isRecord(input) ? input : {};
  const visibleColumns = normalizeColumnList(raw.visibleColumns, fallback.visibleColumns);
  const columnOrder = normalizeColumnList(raw.columnOrder, fallback.columnOrder);
  const mobileMetrics = normalizeMetricList(raw.mobileMetrics, fallback.mobileMetrics);
  return {
    version: 1,
    visibleColumns,
    columnOrder,
    mobileMetrics,
    filters: isRecord(raw.filters) ? normalizeConfigFilters(raw.filters, fallback.filters) : fallback.filters,
    quickViewId: workspaceView(typeof raw.quickViewId === "string" ? raw.quickViewId : view),
    groupMode: raw.groupMode === "playerType" || raw.groupMode === "positionGroup" || raw.groupMode === "none" ? raw.groupMode : fallback.groupMode,
    density: raw.density === "comfortable" ? "comfortable" : "compact",
    inspectorMode: raw.inspectorMode === "collapsed" ? "collapsed" : "open",
    showAttentionIndicators: typeof raw.showAttentionIndicators === "boolean" ? raw.showAttentionIndicators : true
  };
}

export function configurationFromState(state: WorkspaceState, current: WorkspaceConfiguration): WorkspaceConfiguration {
  return normalizeWorkspaceConfiguration({
    ...current,
    filters: {
      players: state.players,
      position: state.position,
      availability: state.availability,
      period: state.period,
      sort: state.sort,
      direction: state.direction,
      coachAssessment: state.coachAssessment,
      developmentStatus: state.developmentStatus,
      reviewStatus: state.reviewStatus,
      evidenceBase: state.evidenceBase,
      ratingStatus: state.ratingStatus,
      customFrom: state.customFrom,
      customTo: state.customTo
    },
    quickViewId: state.view
  }, state.view);
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
  if (next.savedView) params.set("savedView", next.savedView);
  if (next.customize) params.set("customize", "true");
  if (next.players && next.players !== playersFilter(undefined, next.view)) params.set("players", next.players);
  if (next.position) params.set("position", next.position);
  if (next.availability && next.availability !== availabilityFilter(undefined, next.view)) params.set("availability", next.availability);
  if (next.period && next.period !== "season") params.set("period", next.period);
  if (next.sort) params.set("sort", next.sort);
  if (next.direction) params.set("direction", next.direction);
  if (next.search) params.set("search", next.search);
  if (next.selectedPlayer) params.set("selectedPlayer", next.selectedPlayer);
  if (next.importBatch) params.set("importBatch", next.importBatch);
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
    if (state.importBatch && player.importBatchId !== state.importBatch) return false;
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

function normalizeColumnList(value: unknown, fallback: WorkspaceColumnId[]) {
  const allowed = new Set(workspaceColumns.map((column) => column.id));
  const values = Array.isArray(value) ? value : fallback;
  const clean = Array.from(new Set(values.filter((item): item is WorkspaceColumnId => typeof item === "string" && allowed.has(item as WorkspaceColumnId)) as WorkspaceColumnId[]));
  if (!clean.includes("player")) clean.unshift("player");
  return clean.length ? clean : fallback;
}

function normalizeMetricList(value: unknown, fallback: WorkspaceMetricId[]) {
  const allowed = new Set(workspaceMobileMetrics.map((metric) => metric.id));
  const values = Array.isArray(value) ? value : fallback;
  const clean = Array.from(new Set(values.filter((item): item is WorkspaceMetricId => typeof item === "string" && allowed.has(item as WorkspaceMetricId)) as WorkspaceMetricId[]));
  return (clean.length ? clean : fallback).slice(0, 4);
}

function normalizeConfigFilters(raw: Record<string, unknown>, fallback: WorkspaceConfiguration["filters"]): WorkspaceConfiguration["filters"] {
  return {
    players: playersFilter(typeof raw.players === "string" ? raw.players : undefined, "all"),
    position: typeof raw.position === "string" && raw.position ? raw.position : undefined,
    availability: availabilityFilter(typeof raw.availability === "string" ? raw.availability : undefined, "all"),
    period: analyticsPeriod(typeof raw.period === "string" ? raw.period : undefined),
    sort: workspaceSort(typeof raw.sort === "string" ? raw.sort : undefined) ?? fallback.sort,
    direction: directionValue(typeof raw.direction === "string" ? raw.direction : undefined) ?? fallback.direction,
    coachAssessment: typeof raw.coachAssessment === "string" && raw.coachAssessment ? raw.coachAssessment : undefined,
    developmentStatus: typeof raw.developmentStatus === "string" && raw.developmentStatus ? raw.developmentStatus : undefined,
    reviewStatus: typeof raw.reviewStatus === "string" && raw.reviewStatus ? raw.reviewStatus : undefined,
    evidenceBase: typeof raw.evidenceBase === "string" && raw.evidenceBase ? raw.evidenceBase : undefined,
    ratingStatus: typeof raw.ratingStatus === "string" && raw.ratingStatus ? raw.ratingStatus : undefined,
    customFrom: normalizeDateParam(typeof raw.customFrom === "string" ? raw.customFrom : undefined),
    customTo: normalizeDateParam(typeof raw.customTo === "string" ? raw.customTo : undefined),
    search: typeof raw.search === "string" ? raw.search : undefined
  };
}

function applyConfigurationToState(state: WorkspaceState, configuration: WorkspaceConfiguration): WorkspaceState {
  const filters = configuration.filters;
  return {
    ...state,
    players: state.hasExplicitState ? state.players : filters.players ?? state.players,
    position: state.position ?? filters.position,
    availability: state.hasExplicitState ? state.availability : filters.availability ?? state.availability,
    period: state.hasExplicitState ? state.period : filters.period ?? state.period,
    sort: state.hasExplicitState ? state.sort : filters.sort ?? state.sort,
    direction: state.hasExplicitState ? state.direction : filters.direction ?? state.direction,
    coachAssessment: state.coachAssessment ?? filters.coachAssessment,
    developmentStatus: state.developmentStatus ?? filters.developmentStatus,
    reviewStatus: state.reviewStatus ?? filters.reviewStatus,
    evidenceBase: state.evidenceBase ?? filters.evidenceBase,
    ratingStatus: state.ratingStatus ?? filters.ratingStatus,
    customFrom: state.customFrom ?? filters.customFrom,
    customTo: state.customTo ?? filters.customTo,
    search: state.search || filters.search || ""
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

async function listWorkspaceViews(db: SupabaseClient, userId: string): Promise<WorkspaceSavedView[]> {
  try {
    const { data, error } = await db
      .from("coach_workspace_views")
      .select("*")
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return [];
    return ((data ?? []) as WorkspaceViewRow[]).map((row) => {
      const systemViewId = workspaceView(row.system_view_id ?? undefined);
      const kind = row.kind === "system" ? "system" : "saved";
      return {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        kind,
        systemViewId: kind === "system" ? systemViewId : undefined,
        configuration: normalizeWorkspaceConfiguration(row.configuration, systemViewId),
        displayOrder: row.display_order ?? 0,
        isDefault: Boolean(row.is_default),
        updatedAt: row.updated_at
      };
    });
  } catch {
    return [];
  }
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
