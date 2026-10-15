import type { SquadTrainingEventDetail } from "@/types/domain";
import { trainingDateTimeKey, trainingNowParts, trainingRatingStats } from "@/lib/trainings/utils";
import { getFinalAttendanceSummary, getPlannedAttendanceSummary } from "@/lib/squad/attendance-utils";

export type TrainingWorkflowPhase = "preparation" | "live" | "follow_up" | "complete";
export type TrainingWorkflowActionKind = "plan" | "check_in" | "ratings" | "review" | "staff_brief";

export type TrainingWorkflowAction = {
  kind: TrainingWorkflowActionKind;
  href: string;
  label: string;
};

export type TrainingWorkflowFact = {
  label: string;
  value: string;
  values?: Record<string, string | number>;
};

export type TrainingWorkflowState = {
  phase?: TrainingWorkflowPhase;
  phaseLabel?: string;
  headline?: string;
  reason?: string;
  reasonValues?: Record<string, string | number>;
  primaryAction: TrainingWorkflowAction | null;
  secondaryActions: TrainingWorkflowAction[];
  facts: TrainingWorkflowFact[];
  ratingsStarted: boolean;
};

export type TrainingWorkflowInput = {
  event: SquadTrainingEventDetail;
  hasPlan: boolean;
  hasReview: boolean;
  now?: ReturnType<typeof trainingNowParts>;
};

const phaseLabels: Record<TrainingWorkflowPhase, string> = {
  preparation: "Preparation",
  live: "Training live",
  follow_up: "Follow-up",
  complete: "Completed"
};

export function getTrainingWorkflowState({ event, hasPlan, hasReview, now = trainingNowParts() }: TrainingWorkflowInput): TrainingWorkflowState {
  const ratings = trainingRatingStats(event);
  const plannedAttendance = getPlannedAttendanceSummary(event.attendance);
  const finalAttendance = getFinalAttendanceSummary(event.attendance);
  const totalAttendance = event.attendance.length;
  const unresolvedAttendance = finalAttendance.unresolved;
  const recordedAttendance = totalAttendance - unresolvedAttendance;
  const expectedPlayers = plannedAttendance.plannedExpected;
  const ratingsStarted = ratings.rated > 0 || event.status === "rating_open";
  const ratingsIncomplete = ratingsStarted && ratings.rateable > ratings.rated;
  const nowKey = `${now.date} ${normalizeWorkflowTime(now.time)}`;
  const startsAt = trainingDateTimeKey(event);
  const endsAt = event.endTime ? `${event.date} ${normalizeWorkflowTime(event.endTime)}` : undefined;
  const explicitlyCompleted = event.status === "completed";
  const explicitlyLive = event.status === "in_progress";
  const withinScheduledTime = startsAt <= nowKey && Boolean(endsAt && endsAt >= nowKey);

  if (event.deletedAt) {
    return { primaryAction: null, secondaryActions: [], facts: [], ratingsStarted };
  }

  if (explicitlyCompleted) {
    if (unresolvedAttendance > 0) {
      return buildWorkflow(event.id, "follow_up", attendanceAction(event.id), {
        hasPlan,
        hasReview,
        ratings,
        ratingsStarted,
        expectedPlayers,
        recordedAttendance,
        totalAttendance,
        ...attendanceReason(unresolvedAttendance)
      });
    }
    return buildCompleteWorkflow(event.id, { hasPlan, hasReview, ratings, ratingsStarted, expectedPlayers, recordedAttendance, totalAttendance });
  }

  if (explicitlyLive || withinScheduledTime) {
    return buildWorkflow(event.id, "live", {
      kind: "check_in",
      href: `/trainings/${event.id}/check-in`,
      label: "Open Check-in"
    }, {
      hasPlan,
      hasReview,
      ratings,
      ratingsStarted,
      expectedPlayers,
      recordedAttendance,
      totalAttendance,
      reason: "Training is live. Record attendance directly."
    });
  }

  if (startsAt > nowKey && event.status !== "rating_open") {
    return buildWorkflow(event.id, "preparation", {
      kind: "plan",
      href: `/trainings/${event.id}/plan`,
      label: hasPlan ? "Prepare Training" : "Plan Training"
    }, {
      hasPlan,
      hasReview,
      ratings,
      ratingsStarted,
      expectedPlayers,
      recordedAttendance,
      totalAttendance,
      reason: hasPlan
        ? "A Session Plan is ready. Check content and groups before Training."
        : "No Session Plan is prepared for this Training yet."
    });
  }

  if (unresolvedAttendance > 0) {
    return buildWorkflow(event.id, "follow_up", attendanceAction(event.id), {
      hasPlan,
      hasReview,
      ratings,
      ratingsStarted,
      expectedPlayers,
      recordedAttendance,
      totalAttendance,
      ...attendanceReason(unresolvedAttendance)
    });
  }

  if (hasReview) {
    return buildCompleteWorkflow(event.id, { hasPlan, hasReview, ratings, ratingsStarted, expectedPlayers, recordedAttendance, totalAttendance });
  }

  if (ratingsIncomplete) {
    return buildWorkflow(event.id, "follow_up", {
      kind: "ratings",
      href: `/trainings/${event.id}/ratings`,
      label: "Continue Ratings"
    }, {
      hasPlan,
      hasReview,
      ratings,
      ratingsStarted,
      expectedPlayers,
      recordedAttendance,
      totalAttendance,
      reason: "Continue the ratings you already started."
    });
  }

  return buildWorkflow(event.id, "follow_up", {
    kind: "review",
    href: `/trainings/${event.id}/review`,
    label: "Review Training"
  }, {
    hasPlan,
    hasReview,
    ratings,
    ratingsStarted,
    expectedPlayers,
    recordedAttendance,
    totalAttendance,
    reason: "Capture briefly what worked and what you want to carry forward."
  });
}

type WorkflowFactsInput = {
  hasPlan: boolean;
  hasReview: boolean;
  ratings: ReturnType<typeof trainingRatingStats>;
  ratingsStarted: boolean;
  expectedPlayers: number;
  recordedAttendance: number;
  totalAttendance: number;
  reason?: string;
  reasonValues?: Record<string, string | number>;
};

function buildWorkflow(eventId: string, phase: TrainingWorkflowPhase, primaryAction: TrainingWorkflowAction, input: WorkflowFactsInput): TrainingWorkflowState {
  return {
    phase,
    phaseLabel: phaseLabels[phase],
    headline: primaryAction.label,
    reason: input.reason,
    reasonValues: input.reasonValues,
    primaryAction,
    secondaryActions: secondaryActions(eventId, input.hasPlan, input.hasReview, input.ratingsStarted, primaryAction.kind),
    facts: workflowFacts(phase, input),
    ratingsStarted: input.ratingsStarted
  };
}

function buildCompleteWorkflow(eventId: string, input: WorkflowFactsInput): TrainingWorkflowState {
  return {
    phase: "complete",
    phaseLabel: phaseLabels.complete,
    headline: "Training completed",
    reason: "Attendance is complete and the Training workflow is closed.",
    primaryAction: null,
    secondaryActions: secondaryActions(eventId, input.hasPlan, input.hasReview, input.ratingsStarted),
    facts: workflowFacts("complete", input),
    ratingsStarted: input.ratingsStarted
  };
}

function attendanceAction(eventId: string): TrainingWorkflowAction {
  return {
    kind: "check_in",
    href: `/trainings/${eventId}/check-in`,
    label: "Complete Attendance"
  };
}

function attendanceReason(unresolved: number): Pick<WorkflowFactsInput, "reason" | "reasonValues"> {
  return {
    reason: unresolved === 1 ? "{count} player still needs an attendance status." : "{count} players still need an attendance status.",
    reasonValues: { count: unresolved }
  };
}

function secondaryActions(eventId: string, hasPlan: boolean, hasReview: boolean, ratingsStarted: boolean, primaryKind?: TrainingWorkflowActionKind) {
  const actions: TrainingWorkflowAction[] = [
    { kind: "plan", href: `/trainings/${eventId}/plan`, label: hasPlan ? "Open Plan" : "Plan Training" },
    { kind: "check_in", href: `/trainings/${eventId}/check-in`, label: "Check-in" },
    { kind: "ratings", href: `/trainings/${eventId}/ratings`, label: ratingsStarted ? "Continue Ratings" : "Ratings" },
    { kind: "review", href: `/trainings/${eventId}/review`, label: hasReview ? "View/Edit Review" : "Review Training" }
  ];
  if (hasPlan) actions.push({ kind: "staff_brief", href: `/trainings/${eventId}/brief`, label: "Staff Brief" });
  return actions.filter((action) => action.kind !== primaryKind);
}

function workflowFacts(phase: TrainingWorkflowPhase, input: WorkflowFactsInput): TrainingWorkflowFact[] {
  if (phase === "preparation") {
    return [
      { label: "Plan", value: input.hasPlan ? "Ready" : "Not prepared" },
      { label: "Attendance", value: "{count} expected", values: { count: input.expectedPlayers } }
    ];
  }
  const facts: TrainingWorkflowFact[] = [
    {
      label: "Attendance",
      value: input.recordedAttendance === input.totalAttendance ? "All attendance recorded" : "{recorded}/{total} recorded",
      values: { recorded: input.recordedAttendance, total: input.totalAttendance }
    }
  ];
  if (input.ratingsStarted) facts.push({ label: "Ratings", value: "{rated}/{rateable} rated", values: input.ratings });
  if (input.hasReview) facts.push({ label: "Review", value: "Saved" });
  return facts;
}

function normalizeWorkflowTime(value: string) {
  const [hours = "00", minutes = "00", seconds = "00"] = value.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}
