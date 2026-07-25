import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsPeriod } from "@/lib/squad/analytics";
import { formatEventDate } from "@/lib/squad/attendance-format";
import type { WorkspacePlayerSummary } from "@/lib/squad/workspace";

export type AttentionPriority = "critical" | "high" | "medium" | "low" | "info";
export type AttentionCategory = "review" | "observation" | "performance" | "attendance" | "development" | "medical" | "trial" | "data-quality";
export type AttentionType =
  | "training-review-incomplete"
  | "training-plan-missing"
  | "review-overdue"
  | "review-due"
  | "no-recent-observation"
  | "no-recent-rating"
  | "declining-trend"
  | "limited-evidence"
  | "low-attendance"
  | "repeated-lateness"
  | "late-cancellation-pattern"
  | "high-priority-goal-follow-up"
  | "no-active-development-goal"
  | "medical-return-review"
  | "currently-unavailable"
  | "trial-decision-open"
  | "trial-duration-exceeded"
  | "trial-insufficient-evidence"
  | "missing-position"
  | "missing-date-of-birth";

export type AttentionEvidence = {
  label: string;
  value: string | number;
  supportingText?: string;
};

export type AttentionAction = {
  label: string;
  href: string;
  primary?: boolean;
};

export type AttentionItem = {
  key: string;
  targetKind: "player" | "training";
  targetId: string;
  playerId?: string;
  playerName: string;
  playerPosition?: string;
  playerType: "roster" | "trial";
  type: AttentionType;
  category: AttentionCategory;
  priority: AttentionPriority;
  title: string;
  explanation: string;
  evidence: AttentionEvidence[];
  suggestedActions: AttentionAction[];
  thresholdLabel: string;
  periodLabel?: string;
  dueDate?: string;
  detectedAt: string;
  dismissible: boolean;
  snoozeable: boolean;
  snoozedUntil?: string | null;
  dismissedAt?: string | null;
  dismissedReason?: "dismissed" | "not_relevant" | null;
  resolvedAt?: string | null;
};

export type AttentionPreferences = {
  version: 1;
  enabledRules: Partial<Record<AttentionType, boolean>>;
  observationAgeDays: number;
  lowAttendancePercent: number;
  noRecentRatingTrainings: number;
  decliningTrendThreshold: number;
  repeatedLatenessCount: number;
  trialDurationDays: number;
  goalFollowUpDays: number;
};

export type AttentionState = {
  attentionKey: string;
  playerId?: string | null;
  targetKind: "player" | "training";
  targetId: string;
  attentionType: AttentionType;
  snoozedUntil?: string | null;
  dismissedAt?: string | null;
  dismissedReason?: "dismissed" | "not_relevant" | null;
  resolvedAt?: string | null;
};

export type AttentionCenterState = {
  priority: "all" | "high-priority" | AttentionPriority;
  category: "all" | AttentionCategory;
  playerType: "all" | "roster" | "trial";
  status: "open" | "snoozed" | "dismissed";
  position?: string;
  period: Exclude<AnalyticsPeriod, "custom" | "all"> | "all";
  sort: "priority" | "dueDate" | "player" | "category" | "detected";
  direction: "asc" | "desc";
  search: string;
  player?: string;
  item?: string;
};

export type AttentionCenterData = {
  state: AttentionCenterState;
  preferences: AttentionPreferences;
  items: AttentionItem[];
  allItems: AttentionItem[];
  selected?: AttentionItem;
  positions: string[];
  summary: {
    open: number;
    snoozed: number;
    dismissed: number;
    high: number;
    medium: number;
    low: number;
    critical: number;
    review: number;
    medical: number;
    trial: number;
    observation: number;
  };
};

type AttentionPreferencesRow = {
  preferences: unknown;
};

type AttentionStateRow = {
  attention_key: string;
  player_id: string | null;
  target_kind?: string | null;
  target_id?: string | null;
  attention_type: string;
  snoozed_until: string | null;
  dismissed_at: string | null;
  dismissal_reason?: string | null;
  resolved_at?: string | null;
};

export const attentionCategories: Array<{ id: AttentionCategory; label: string }> = [
  { id: "review", label: "Review" },
  { id: "observation", label: "Observation" },
  { id: "performance", label: "Performance" },
  { id: "attendance", label: "Attendance" },
  { id: "development", label: "Development" },
  { id: "medical", label: "Medical" },
  { id: "trial", label: "Trial Players" },
  { id: "data-quality", label: "Data quality" }
];

export const attentionPriorityLabels: Record<AttentionPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Information"
};

export const attentionPriorityFilterLabels: Record<AttentionCenterState["priority"], string> = {
  all: "All priorities",
  "high-priority": "High Priority",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Information"
};

export const defaultAttentionPreferences: AttentionPreferences = {
  version: 1,
  enabledRules: {
    "training-review-incomplete": true,
    "training-plan-missing": true,
    "review-overdue": true,
    "review-due": true,
    "no-recent-observation": false,
    "no-recent-rating": false,
    "declining-trend": true,
    "limited-evidence": false,
    "low-attendance": true,
    "repeated-lateness": true,
    "late-cancellation-pattern": true,
    "high-priority-goal-follow-up": true,
    "no-active-development-goal": false,
    "medical-return-review": true,
    "currently-unavailable": false,
    "trial-decision-open": true,
    "trial-duration-exceeded": true,
    "trial-insufficient-evidence": true,
    "missing-position": false,
    "missing-date-of-birth": false
  },
  observationAgeDays: 30,
  lowAttendancePercent: 75,
  noRecentRatingTrainings: 3,
  decliningTrendThreshold: -0.3,
  repeatedLatenessCount: 2,
  trialDurationDays: 30,
  goalFollowUpDays: 21
};

const mandatoryRules = new Set<AttentionType>(["medical-return-review", "training-review-incomplete", "training-plan-missing"]);
export function parseAttentionCenterState(searchParams: Record<string, string | string[] | undefined>): AttentionCenterState {
  return {
    priority: priorityValue(one(searchParams.priority)),
    category: categoryValue(one(searchParams.category)),
    playerType: playerTypeValue(one(searchParams.playerType)),
    status: statusValue(one(searchParams.status)),
    position: one(searchParams.position) || undefined,
    period: attentionPeriod(one(searchParams.period)),
    sort: sortValue(one(searchParams.sort)),
    direction: one(searchParams.direction) === "asc" ? "asc" : "desc",
    search: one(searchParams.search) ?? "",
    player: one(searchParams.player) || undefined,
    item: one(searchParams.item) || undefined
  };
}

export function attentionHref(state: AttentionCenterState, patch: Partial<AttentionCenterState>) {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.priority !== "all") params.set("priority", next.priority);
  if (next.category !== "all") params.set("category", next.category);
  if (next.playerType !== "all") params.set("playerType", next.playerType);
  if (next.status !== "open") params.set("status", next.status);
  if (next.position) params.set("position", next.position);
  if (next.period !== "30d") params.set("period", next.period);
  if (next.sort !== "priority") params.set("sort", next.sort);
  if (next.direction !== "desc") params.set("direction", next.direction);
  if (next.search) params.set("search", next.search);
  if (next.player) params.set("player", next.player);
  if (next.item) params.set("item", next.item);
  const query = params.toString();
  return `/actions${query ? `?${query}` : ""}`;
}

export async function getAttentionPreferences(db: SupabaseClient, userId: string): Promise<AttentionPreferences> {
  try {
    const { data, error } = await db.from("coach_attention_preferences").select("preferences").eq("user_id", userId).maybeSingle();
    if (error || !data) return defaultAttentionPreferences;
    return normalizeAttentionPreferences((data as AttentionPreferencesRow).preferences);
  } catch {
    return defaultAttentionPreferences;
  }
}

export function normalizeAttentionPreferences(input: unknown): AttentionPreferences {
  const raw = isRecord(input) ? input : {};
  const enabledRaw = isRecord(raw.enabledRules) ? raw.enabledRules : {};
  const enabledRules: Partial<Record<AttentionType, boolean>> = { ...defaultAttentionPreferences.enabledRules };
  for (const key of Object.keys(enabledRules) as AttentionType[]) {
    enabledRules[key] = mandatoryRules.has(key) ? true : typeof enabledRaw[key] === "boolean" ? enabledRaw[key] : enabledRules[key];
  }
  return {
    version: 1,
    enabledRules,
    observationAgeDays: clampNumber(raw.observationAgeDays, 7, 180, defaultAttentionPreferences.observationAgeDays),
    lowAttendancePercent: clampNumber(raw.lowAttendancePercent, 40, 100, defaultAttentionPreferences.lowAttendancePercent),
    noRecentRatingTrainings: clampNumber(raw.noRecentRatingTrainings, 1, 10, defaultAttentionPreferences.noRecentRatingTrainings),
    decliningTrendThreshold: clampNumber(raw.decliningTrendThreshold, -1.5, -0.1, defaultAttentionPreferences.decliningTrendThreshold),
    repeatedLatenessCount: clampNumber(raw.repeatedLatenessCount, 1, 10, defaultAttentionPreferences.repeatedLatenessCount),
    trialDurationDays: clampNumber(raw.trialDurationDays, 7, 180, defaultAttentionPreferences.trialDurationDays),
    goalFollowUpDays: clampNumber(raw.goalFollowUpDays, 7, 180, defaultAttentionPreferences.goalFollowUpDays)
  };
}

export function getPlayerAttentionItems(player: WorkspacePlayerSummary, preferences: AttentionPreferences, context: { today: string; periodLabel: string }): AttentionItem[] {
  const summary = player.analytics;
  const name = [summary.player.firstName, summary.player.lastName].filter(Boolean).join(" ");
  const base = {
    playerId: summary.player.id,
    targetKind: "player" as const,
    targetId: summary.player.id,
    playerName: name,
    playerPosition: summary.player.position ?? undefined,
    playerType: summary.player.playerType,
    detectedAt: context.today
  };
  const items: AttentionItem[] = [];
  const push = (item: Omit<AttentionItem, keyof typeof base | "key">) => {
    if (!ruleEnabled(item.type, preferences)) return;
    items.push({ ...base, ...item, key: `${summary.player.id}:${item.type}:${item.dueDate ?? "current"}` });
  };

  if (player.review.dueDate) {
    const days = dayDiff(context.today, player.review.dueDate);
    if (days > 0) {
      push({
        type: "review-overdue",
        category: "review",
        priority: days >= 14 ? "high" : "medium",
        title: "Development review overdue",
        explanation: `The development review was due ${days} day${days === 1 ? "" : "s"} ago.`,
        evidence: evidence([["Due date", formatEventDate(player.review.dueDate)], ["Overdue", `${days}d`], ["Threshold", "Past due date"]]),
        thresholdLabel: "Review date is before today.",
        dueDate: player.review.dueDate,
        suggestedActions: actions(summary.player.id, "development"),
        dismissible: false,
        snoozeable: true
      });
    } else if (days >= -7) {
      push({
        type: "review-due",
        category: "review",
        priority: days === 0 ? "medium" : "low",
        title: days === 0 ? "Development review due today" : "Development review due soon",
        explanation: days === 0 ? "The development review is due today." : `The development review is due in ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}.`,
        evidence: evidence([["Due date", formatEventDate(player.review.dueDate)], ["Window", "Next 7 days"]]),
        thresholdLabel: "Review due within 7 days.",
        dueDate: player.review.dueDate,
        suggestedActions: actions(summary.player.id, "development"),
        dismissible: false,
        snoozeable: true
      });
    }
  }

  const observationAge = player.latestObservation ? dayDiff(context.today, player.latestObservation.observationDate) : null;
  if (observationAge === null || observationAge > preferences.observationAgeDays) {
    push({
      type: "no-recent-observation",
      category: "observation",
      priority: "medium",
      title: "No recent observation",
      explanation: observationAge === null ? "No player observation has been recorded yet." : `The latest observation was recorded ${observationAge} days ago.`,
      evidence: evidence([
        ["Latest observation", player.latestObservation ? formatEventDate(player.latestObservation.observationDate) : "None"],
        ["Threshold", `${preferences.observationAgeDays} days`]
      ]),
      thresholdLabel: `No observation after ${preferences.observationAgeDays} days.`,
      suggestedActions: actions(summary.player.id, "development", "Add observation"),
      dismissible: false,
      snoozeable: true
    });
  }

  if (summary.player.playerType === "roster" && summary.attendanceRate !== null && summary.attendanceRate * 100 < preferences.lowAttendancePercent && summary.trainings >= 3) {
    push({
      type: "low-attendance",
      category: "attendance",
      priority: summary.attendanceRate * 100 < 60 ? "high" : "medium",
      title: "Low attendance",
      explanation: `Attendance is ${Math.round(summary.attendanceRate * 100)}% in the selected period based on completed trainings with recorded attendance.`,
      evidence: evidence([
        ["Attendance", `${Math.round(summary.attendanceRate * 100)}%`],
        ["Attended", summary.attended],
        ["Eligible completed trainings", summary.trainings],
        ["Threshold", `${preferences.lowAttendancePercent}%`]
      ]),
      thresholdLabel: `Below ${preferences.lowAttendancePercent}% in ${context.periodLabel}.`,
      periodLabel: context.periodLabel,
      suggestedActions: actions(summary.player.id, "attendance", "Open attendance"),
      dismissible: false,
      snoozeable: true
    });
  }

  const penalisedLate = summary.records.filter((record) => record.finalStatus === "Z" && record.latePenaltyApplied).length;
  if (penalisedLate >= preferences.repeatedLatenessCount) {
    push({
      type: "repeated-lateness",
      category: "attendance",
      priority: "medium",
      title: "Repeated penalised lateness",
      explanation: `${penalisedLate} penalised late arrivals are recorded in the selected period.`,
      evidence: evidence([["Penalised late arrivals", penalisedLate], ["Threshold", preferences.repeatedLatenessCount], ["Period", context.periodLabel]]),
      thresholdLabel: `${preferences.repeatedLatenessCount} or more penalised late arrivals.`,
      periodLabel: context.periodLabel,
      suggestedActions: actions(summary.player.id, "attendance"),
      dismissible: false,
      snoozeable: true
    });
  }

  if (summary.attendanceDistribution.lateCancellation >= 2) {
    push({
      type: "late-cancellation-pattern",
      category: "attendance",
      priority: "medium",
      title: "Repeated late cancellations",
      explanation: `${summary.attendanceDistribution.lateCancellation} late cancellations are recorded in the selected period.`,
      evidence: evidence([["Late cancellations", summary.attendanceDistribution.lateCancellation], ["Period", context.periodLabel]]),
      thresholdLabel: "2 or more late cancellations.",
      periodLabel: context.periodLabel,
      suggestedActions: actions(summary.player.id, "attendance"),
      dismissible: false,
      snoozeable: true
    });
  }

  if (summary.rated < preferences.noRecentRatingTrainings && summary.attended >= preferences.noRecentRatingTrainings) {
    push({
      type: "no-recent-rating",
      category: "performance",
      priority: "medium",
      title: "No recent rating",
      explanation: `${summary.rated} rated training${summary.rated === 1 ? "" : "s"} are available in the selected period.`,
      evidence: evidence([["Rated trainings", summary.rated], ["Attended trainings", summary.attended], ["Threshold", preferences.noRecentRatingTrainings]]),
      thresholdLabel: `At least ${preferences.noRecentRatingTrainings} rated attended trainings expected.`,
      periodLabel: context.periodLabel,
      suggestedActions: [{ label: "Open analytics", href: `/squad/players/${summary.player.id}?tab=analytics`, primary: true }],
      dismissible: false,
      snoozeable: true
    });
  }

  if (summary.rated >= 5 && summary.trend.value !== null && summary.trend.value <= preferences.decliningTrendThreshold) {
    push({
      type: "declining-trend",
      category: "performance",
      priority: summary.rated >= 10 ? "high" : "medium",
      title: "Declining rating trend",
      explanation: `The current trend is ${summary.trend.value.toFixed(1)} in the selected period.`,
      evidence: evidence([
        ["Latest 5 average", summary.trend.latestAverage?.toFixed(1) ?? "-"],
        ["Previous average", summary.trend.previousAverage?.toFixed(1) ?? "-"],
        ["Difference", summary.trend.value.toFixed(1)],
        ["Threshold", preferences.decliningTrendThreshold]
      ]),
      thresholdLabel: `Trend at or below ${preferences.decliningTrendThreshold}.`,
      periodLabel: context.periodLabel,
      suggestedActions: [{ label: "Open analytics", href: `/squad/players/${summary.player.id}?tab=analytics`, primary: true }],
      dismissible: false,
      snoozeable: true
    });
  }

  if (summary.evidenceBase.label === "First impressions" || summary.evidenceBase.label === "Early tendency") {
    push({
      type: "limited-evidence",
      category: "performance",
      priority: "info",
      title: "Limited rating evidence",
      explanation: `${summary.evidenceBase.label}: ${summary.evidenceBase.detail}`,
      evidence: evidence([["Evidence base", summary.evidenceBase.label], ["Rated trainings", summary.rated]]),
      thresholdLabel: "Shown while evidence base is still early.",
      periodLabel: context.periodLabel,
      suggestedActions: [{ label: "Open analytics", href: `/squad/players/${summary.player.id}?tab=analytics`, primary: true }],
      dismissible: true,
      snoozeable: true
    });
  }

  const highGoal = player.activeGoals.find((goal) => goal.priority === "high");
  if (highGoal && (observationAge === null || observationAge > preferences.goalFollowUpDays)) {
    push({
      type: "high-priority-goal-follow-up",
      category: "development",
      priority: "high",
      title: "High-priority goal needs follow-up",
      explanation: `The high-priority goal "${highGoal.title}" has no recent observation follow-up.`,
      evidence: evidence([["Goal", highGoal.title], ["Latest observation", player.latestObservation ? formatEventDate(player.latestObservation.observationDate) : "None"], ["Threshold", `${preferences.goalFollowUpDays} days`]]),
      thresholdLabel: `No progress observation after ${preferences.goalFollowUpDays} days.`,
      suggestedActions: actions(summary.player.id, "development", "Add observation"),
      dismissible: false,
      snoozeable: true
    });
  }

  if (!player.activeGoals.length) {
    push({
      type: "no-active-development-goal",
      category: "development",
      priority: "low",
      title: "No active development goal",
      explanation: "This player currently has no active development goal.",
      evidence: evidence([["Active goals", 0]]),
      thresholdLabel: "Optional rule enabled by coach.",
      suggestedActions: actions(summary.player.id, "development"),
      dismissible: true,
      snoozeable: true
    });
  }

  if (player.currentMedical) {
    if (player.currentMedical.expectedReturnDate && !player.currentMedical.actualReturnDate && player.currentMedical.expectedReturnDate < context.today) {
      const days = dayDiff(context.today, player.currentMedical.expectedReturnDate);
      push({
        type: "medical-return-review",
        category: "medical",
        priority: "high",
        title: "Medical return status needs review",
        explanation: `Expected return passed ${days} day${days === 1 ? "" : "s"} ago. Actual return has not been confirmed.`,
        evidence: evidence([["Status", player.currentMedical.type === "injured" ? "Injured" : "Sick"], ["Expected return", formatEventDate(player.currentMedical.expectedReturnDate)], ["Actual return", "Not confirmed"]]),
        thresholdLabel: "Expected return date is before today and no actual return is set.",
        dueDate: player.currentMedical.expectedReturnDate,
        suggestedActions: actions(summary.player.id, "medical", "Open medical"),
        dismissible: false,
        snoozeable: false
      });
    } else {
      push({
        type: "currently-unavailable",
        category: "medical",
        priority: "low",
        title: player.currentMedical.type === "injured" ? "Currently injured" : "Currently sick",
        explanation: "Current operational availability shows the player is unavailable.",
        evidence: evidence([["Status", player.currentMedical.type === "injured" ? "Injured" : "Sick"], ["Expected return", player.currentMedical.expectedReturnDate ? formatEventDate(player.currentMedical.expectedReturnDate) : "Not set"]]),
        thresholdLabel: "Active medical period.",
        suggestedActions: actions(summary.player.id, "medical", "Open medical"),
        dismissible: false,
        snoozeable: true
      });
    }
  }

  if (summary.player.playerType === "trial") {
    const started = (summary.player.joinedDate ?? summary.player.createdAt).slice(0, 10);
    const duration = dayDiff(context.today, started);
    const decisionOpen = !summary.assessment || summary.assessment.assessment === "decision_open" || summary.assessment.assessment === "continue_observing";
    if (decisionOpen) {
      push({
        type: "trial-decision-open",
        category: "trial",
        priority: duration >= preferences.trialDurationDays ? "high" : "medium",
        title: "Trial decision open",
        explanation: `Trial Player has been active for ${duration} days.`,
        evidence: evidence([["Trial duration", `${duration}d`], ["Decision threshold", `${preferences.trialDurationDays}d`], ["Assessment", summary.assessment?.assessment ?? "Decision open"]]),
        thresholdLabel: `Decision reminder after ${preferences.trialDurationDays} days.`,
        suggestedActions: actions(summary.player.id, "analytics", "Update assessment"),
        dismissible: false,
        snoozeable: true
      });
    }
    if (duration >= preferences.trialDurationDays) {
      push({
        type: "trial-duration-exceeded",
        category: "trial",
        priority: "high",
        title: "Trial duration exceeded",
        explanation: `Trial duration is ${duration} days.`,
        evidence: evidence([["Trial duration", `${duration}d`], ["Threshold", `${preferences.trialDurationDays}d`]]),
        thresholdLabel: `Trial duration above ${preferences.trialDurationDays} days.`,
        suggestedActions: actions(summary.player.id, "analytics", "Update assessment"),
        dismissible: false,
        snoozeable: true
      });
    }
    if (summary.rated < 2) {
      push({
        type: "trial-insufficient-evidence",
        category: "trial",
        priority: "medium",
        title: "Trial evidence incomplete",
        explanation: `Only ${summary.rated} rated training${summary.rated === 1 ? "" : "s"} available for this Trial Player.`,
        evidence: evidence([["Rated trainings", summary.rated], ["Evidence base", summary.evidenceBase.label]]),
        thresholdLabel: "Fewer than 2 rated trainings for Trial context.",
        suggestedActions: [{ label: "Open ratings", href: `/squad/players/${summary.player.id}?tab=analytics`, primary: true }],
        dismissible: false,
        snoozeable: true
      });
    }
  }

  if (!summary.player.position) {
    push({
      type: "missing-position",
      category: "data-quality",
      priority: "low",
      title: "Missing primary position",
      explanation: "No primary position is set for this player.",
      evidence: evidence([["Primary position", "Missing"]]),
      thresholdLabel: "Profile data quality reminder.",
      suggestedActions: [{ label: "Edit player", href: `/squad/players/${summary.player.id}/edit`, primary: true }],
      dismissible: true,
      snoozeable: true
    });
  }

  if (!summary.player.dateOfBirth) {
    push({
      type: "missing-date-of-birth",
      category: "data-quality",
      priority: "low",
      title: "Missing date of birth",
      explanation: "No birthdate is set for this player.",
      evidence: evidence([["Birthdate", "Missing"]]),
      thresholdLabel: "Optional profile data reminder.",
      suggestedActions: [{ label: "Edit player", href: `/squad/players/${summary.player.id}/edit`, primary: true }],
      dismissible: true,
      snoozeable: true
    });
  }

  return sortAttentionItems(items, parseAttentionCenterState({}));
}

export function getTrainingAttentionItems(
  events: Array<{
    id: string;
    date: string;
    startTime: string;
    label?: string;
    squadName?: string;
    linkedTrainingSessionId?: string;
    linkedTrainingSessionTitle?: string;
    status: string;
    attendance: Array<{ finalStatus?: string; overallRating?: number }>;
  }>,
  context: { today: string }
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const event of events) {
    if (event.date > context.today || event.status === "draft") continue;
    const attended = event.attendance.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z");
    const missingAttendance = event.attendance.filter((entry) => !entry.finalStatus).length;
    const missingRatings = attended.filter((entry) => !entry.overallRating).length;
    if (missingAttendance || missingRatings) {
      const details = [
        missingAttendance ? `Attendance missing for ${missingAttendance} player${missingAttendance === 1 ? "" : "s"}` : "",
        missingRatings ? `Ratings missing for ${missingRatings} player${missingRatings === 1 ? "" : "s"}` : ""
      ].filter(Boolean);
      items.push({
        key: `training-review-incomplete:${event.id}`,
        targetKind: "training",
        targetId: event.id,
        playerName: event.squadName ?? "Training",
        playerPosition: event.date,
        playerType: "roster",
        type: "training-review-incomplete",
        category: "attendance",
        priority: event.date === context.today ? "critical" : "high",
        title: "Complete Training review",
        explanation: `${trainingLabel(event)} needs one training-level review. ${details.join(" · ")}.`,
        evidence: evidence([
          ["Training date", formatEventDate(event.date)],
          ["Attendance missing", missingAttendance],
          ["Ratings missing", missingRatings],
          ["Affected players", missingAttendance + missingRatings]
        ]),
        thresholdLabel: "Past or current training has incomplete attendance or ratings.",
        dueDate: event.date,
        detectedAt: context.today,
        suggestedActions: [{ label: "Open Training review", href: `/trainings/${event.id}/ratings`, primary: true }],
        dismissible: true,
        snoozeable: true
      });
    }
    if (!event.linkedTrainingSessionId && event.date >= context.today) {
      items.push({
        key: `training-plan-missing:${event.id}`,
        targetKind: "training",
        targetId: event.id,
        playerName: event.squadName ?? "Training",
        playerPosition: event.date,
        playerType: "roster",
        type: "training-plan-missing",
        category: "development",
        priority: event.date === context.today ? "critical" : "high",
        title: "Training Plan missing",
        explanation: `${trainingLabel(event)} has no linked Training Plan yet.`,
        evidence: evidence([["Training date", formatEventDate(event.date)], ["Plan", "Missing"]]),
        thresholdLabel: "Upcoming training has no linked plan.",
        dueDate: event.date,
        detectedAt: context.today,
        suggestedActions: [{ label: "Plan Training", href: `/trainings/${event.id}/plan`, primary: true }],
        dismissible: true,
        snoozeable: true
      });
    }
  }
  return sortAttentionItems(items, parseAttentionCenterState({}));
}

export function attentionTone(priority: AttentionPriority): "green" | "amber" | "red" | "neutral" {
  if (priority === "critical") return "red";
  if (priority === "high") return "red";
  if (priority === "medium") return "amber";
  if (priority === "low") return "neutral";
  return "green";
}

export function filterAttentionItems(items: AttentionItem[], state: AttentionCenterState) {
  return items.filter((item) => {
    const snoozed = isSnoozed(item);
    const dismissed = Boolean(item.dismissedAt);
    const resolved = Boolean(item.resolvedAt);
    if (state.status === "open" && (snoozed || dismissed || resolved)) return false;
    if (state.status === "snoozed" && !snoozed) return false;
    if (state.status === "dismissed" && !dismissed) return false;
    if (state.priority === "high-priority" && item.priority !== "critical" && item.priority !== "high") return false;
    if (state.priority !== "all" && state.priority !== "high-priority" && item.priority !== state.priority) return false;
    if (state.category !== "all" && item.category !== state.category) return false;
    if (state.playerType !== "all" && item.playerType !== state.playerType) return false;
    if (state.position && item.playerPosition !== state.position) return false;
    if (state.player && item.playerId !== state.player) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const haystack = `${item.playerName} ${item.playerPosition ?? ""} ${item.title} ${item.category}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function sortAttentionItems(items: AttentionItem[], state: Pick<AttentionCenterState, "sort" | "direction">) {
  const dir = state.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const priority = priorityRank(a.priority) - priorityRank(b.priority);
    const fallback = priority || nullableDate(a.dueDate).localeCompare(nullableDate(b.dueDate)) || a.detectedAt.localeCompare(b.detectedAt) || a.playerName.localeCompare(b.playerName);
    if (state.sort === "priority") return fallback;
    if (state.sort === "dueDate") return dir * nullableDate(a.dueDate).localeCompare(nullableDate(b.dueDate)) || fallback;
    if (state.sort === "player") return dir * a.playerName.localeCompare(b.playerName) || fallback;
    if (state.sort === "category") return dir * a.category.localeCompare(b.category) || fallback;
    if (state.sort === "detected") return dir * a.detectedAt.localeCompare(b.detectedAt) || fallback;
    return fallback;
  });
}

export function applyAttentionStates(items: AttentionItem[], states: Map<string, AttentionState>) {
  return items.map((item) => {
    const state = states.get(item.key);
    if (!state) return item;
    return {
      ...item,
      snoozedUntil: state.snoozedUntil,
      dismissedAt: state.dismissedAt,
      dismissedReason: state.dismissedReason,
      resolvedAt: state.resolvedAt
    };
  });
}

export function attentionSummary(items: AttentionItem[]) {
  const openItems = items.filter((item) => !item.dismissedAt && !item.resolvedAt && !isSnoozed(item));
  return {
    open: openItems.length,
    snoozed: items.filter(isSnoozed).length,
    dismissed: items.filter((item) => item.dismissedAt).length,
    critical: openItems.filter((item) => item.priority === "critical").length,
    high: openItems.filter((item) => item.priority === "high").length,
    medium: openItems.filter((item) => item.priority === "medium").length,
    low: openItems.filter((item) => item.priority === "low").length,
    review: openItems.filter((item) => item.category === "review").length,
    medical: openItems.filter((item) => item.category === "medical").length,
    trial: openItems.filter((item) => item.category === "trial").length,
    observation: openItems.filter((item) => item.category === "observation").length
  };
}

export function isSnoozed(item: AttentionItem) {
  return Boolean(item.snoozedUntil && item.snoozedUntil > todayIso());
}

export async function listAttentionStates(db: SupabaseClient, userId: string) {
  const result = new Map<string, AttentionState>();
  try {
    const { data, error } = await db.from("coach_attention_states").select("*").eq("user_id", userId);
    if (error) return result;
    for (const row of (data ?? []) as AttentionStateRow[]) {
      result.set(row.attention_key, {
        attentionKey: row.attention_key,
        playerId: row.player_id,
        targetKind: row.target_kind === "training" ? "training" : "player",
        targetId: row.target_id ?? row.player_id ?? "",
        attentionType: row.attention_type as AttentionType,
        snoozedUntil: row.snoozed_until,
        dismissedAt: row.dismissed_at,
        dismissedReason: row.dismissal_reason === "not_relevant" ? "not_relevant" : row.dismissal_reason === "dismissed" ? "dismissed" : null,
        resolvedAt: row.resolved_at ?? null
      });
    }
  } catch {
    return result;
  }
  return result;
}

function ruleEnabled(type: AttentionType, preferences: AttentionPreferences) {
  return mandatoryRules.has(type) || preferences.enabledRules[type] !== false;
}

function actions(playerId: string, tab: "development" | "attendance" | "medical" | "analytics", primary = "Open Player Hub"): AttentionAction[] {
  return [
    { label: primary, href: `/squad/players/${playerId}?tab=${tab}`, primary: true },
    { label: "Open Player Hub", href: `/squad/players/${playerId}` }
  ];
}

function evidence(values: Array<[string, string | number | undefined | null]>): AttentionEvidence[] {
  return values.map(([label, value]) => ({ label, value: value ?? "-" }));
}

function trainingLabel(event: { label?: string; date: string; startTime: string }) {
  return event.label ? `${event.label} · ${formatEventDate(event.date)}` : `${formatEventDate(event.date)} · ${event.startTime}`;
}

function priorityRank(priority: AttentionPriority) {
  const ranks: Record<AttentionPriority, number> = { critical: 1, high: 2, medium: 3, low: 4, info: 5 };
  return ranks[priority];
}

function nullableDate(value?: string) {
  return value ?? "9999-12-31";
}

function priorityValue(value?: string): AttentionCenterState["priority"] {
  if (value === "high-priority") return "high-priority";
  return value === "critical" || value === "high" || value === "medium" || value === "low" || value === "info" ? value : "all";
}

function categoryValue(value?: string): AttentionCenterState["category"] {
  return attentionCategories.some((category) => category.id === value) ? value as AttentionCategory : "all";
}

function playerTypeValue(value?: string): AttentionCenterState["playerType"] {
  return value === "roster" || value === "trial" ? value : "all";
}

function statusValue(value?: string): AttentionCenterState["status"] {
  return value === "snoozed" || value === "dismissed" ? value : "open";
}

function sortValue(value?: string): AttentionCenterState["sort"] {
  return value === "dueDate" || value === "player" || value === "category" || value === "detected" ? value : "priority";
}

function attentionPeriod(value?: string): AttentionCenterState["period"] {
  return value === "last5" || value === "last10" || value === "90d" || value === "season" || value === "all" ? value : "30d";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}
