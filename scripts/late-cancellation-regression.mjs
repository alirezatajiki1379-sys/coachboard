import assert from "node:assert/strict";
import test from "node:test";
import { actualAbsenceReasonLabel, effectiveActualAbsenceReason, finalStatusLabel } from "../lib/squad/attendance-format.ts";
import {
  applyAsExpectedDecision,
  calculateReliabilityPenalty,
  finalStatusForActualAbsenceReason,
  isParticipatingAttendanceStatus
} from "../lib/squad/attendance-utils.ts";
import { calculateAttendanceDistribution, createPlayerAnalyticsSummary } from "../lib/squad/analytics.ts";
import { defaultAttentionPreferences, getPlayerAttentionItems, localizeAttentionItems } from "../lib/squad/attention.ts";
import { absenceReason, absenceReasonLabel } from "../lib/squad/player-report.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const playerId = "22222222-2222-4222-8222-222222222222";
const player = {
  id: playerId,
  userId,
  squadId: "33333333-3333-4333-8333-333333333333",
  playerType: "roster",
  firstName: "Fictional",
  lastName: "Player",
  position: "CM",
  secondaryPositions: [],
  preferredPositions: [],
  positionFamilies: [],
  onboardingWarnings: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};

function record(id, date, finalStatus, actualAbsenceReason, actualAttendanceNote) {
  return {
    id,
    userId,
    eventId: `event-${id}`,
    playerId,
    plannedStatus: "expected",
    finalStatus,
    actualAbsenceReason,
    actualAttendanceNote,
    latePenaltyApplied: true,
    sensitiveNote: false,
    event: {
      id: `event-${id}`,
      userId,
      date,
      startTime: "18:00",
      label: `Training ${id}`,
      participantSourceMode: "current_squad_sync",
      status: "completed",
      isSeriesException: false,
      createdAt: `${date}T18:00:00Z`,
      updatedAt: `${date}T18:00:00Z`
    },
    createdAt: `${date}T18:00:00Z`,
    updatedAt: `${date}T18:00:00Z`
  };
}

test("canonical late cancellation persists as absent plus reason", () => {
  assert.equal(finalStatusForActualAbsenceReason("late_cancellation"), "absent");
  const decision = applyAsExpectedDecision({ plannedStatus: "unavailable", plannedReason: "S" });
  assert.deepEqual(decision, {
    action: "absent",
    finalStatus: "absent",
    actualAbsenceReason: "late_cancellation",
    needsReview: false
  });
});

test("legacy S and canonical reason share one semantic result", () => {
  const legacy = record("legacy", "2026-10-01", "S");
  const canonical = record("canonical", "2026-10-08", "absent", "late_cancellation", "Cancelled shortly before Training.");
  assert.equal(effectiveActualAbsenceReason(legacy), "late_cancellation");
  assert.equal(effectiveActualAbsenceReason(canonical), "late_cancellation");
  assert.equal(calculateReliabilityPenalty(legacy), -1);
  assert.equal(calculateReliabilityPenalty(canonical), -1);
  assert.equal(canonical.actualAttendanceNote, "Cancelled shortly before Training.");
  assert.equal(absenceReason(legacy), "late_cancellation");
  assert.equal(absenceReason(canonical), "late_cancellation");
});

test("late arrival remains separate from late cancellation and unexcused", () => {
  const late = record("late", "2026-10-15", "Z");
  const unexcused = record("unexcused", "2026-10-16", "absent", "unexcused");
  assert.equal(isParticipatingAttendanceStatus(late.finalStatus), true);
  assert.equal(effectiveActualAbsenceReason(late), undefined);
  assert.equal(finalStatusLabel(late.finalStatus, "de"), "Verspätet");
  assert.equal(calculateReliabilityPenalty(late), -1);
  assert.equal(calculateReliabilityPenalty(unexcused), -2);
});

test("analytics and Action Center count canonical and legacy late cancellations once", () => {
  const records = [
    record("legacy", "2026-10-01", "S"),
    record("canonical", "2026-10-08", "absent", "late_cancellation"),
    record("late", "2026-10-15", "Z")
  ];
  const distribution = calculateAttendanceDistribution(records);
  assert.equal(distribution.lateCancellation, 2);
  assert.equal(distribution.late, 1);
  const summary = createPlayerAnalyticsSummary(player, records, "all");
  assert.equal(summary.attended, 1);
  assert.equal(summary.absent, 2);
  assert.equal(summary.reliabilityPenalty, -3);
  assert.deepEqual(summary.reliabilityBreakdown, { late: 1, lateCancellation: 2, unexcused: 0, legacyNeedsReview: 0 });

  const attention = getPlayerAttentionItems({
    analytics: summary,
    activeGoals: [],
    review: {},
    attention: [],
    positionGroup: "midfield"
  }, defaultAttentionPreferences, { today: "2026-10-15", periodLabel: "Last 30 days" });
  const repeated = attention.find((item) => item.type === "late-cancellation-pattern");
  assert.ok(repeated);
  assert.equal(repeated.evidence.find((item) => item.label === "Late cancellations")?.value, 2);
  assert.match(repeated.explanation, /^2 late cancellations/);
  const german = localizeAttentionItems([repeated], "de")[0];
  assert.doesNotMatch(german.title, /late cancellation/i);
});

test("canonical labels are deterministic in English and German", () => {
  assert.equal(actualAbsenceReasonLabel("late_cancellation", "en"), "Late cancellation");
  assert.equal(actualAbsenceReasonLabel("late_cancellation", "de"), "Verspätet abgesagt");
  assert.equal(absenceReasonLabel("late_cancellation", "en"), "Late cancellation");
  assert.equal(absenceReasonLabel("late_cancellation", "de"), "Verspätet abgesagt");
});
