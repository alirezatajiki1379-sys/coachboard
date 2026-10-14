import assert from "node:assert/strict";
import fs from "node:fs";
import {
  applyAsExpectedDecision,
  calculateReliabilityPenaltyFromStatus,
  getFinalAttendanceSummary,
  isAbsentAttendanceStatus,
  isDefaultRatingCandidate,
  isParticipatingAttendanceStatus,
  isRateableAttendance,
  overallRatingInitialValue
} from "../lib/squad/attendance-utils.ts";
import { calculateAttendanceDistribution, hasParticipated } from "../lib/squad/analytics.ts";
import { finalStatusLabel } from "../lib/squad/attendance-format.ts";
import { isMissedTraining } from "../lib/squad/player-report.ts";

const entry = (values = {}) => ({
  id: "attendance",
  userId: "coach",
  eventId: "training",
  playerId: "player",
  latePenaltyApplied: true,
  sensitiveNote: false,
  createdAt: "2026-10-15T10:00:00Z",
  updatedAt: "2026-10-15T10:00:00Z",
  ...values
});

assert.equal(isParticipatingAttendanceStatus("present"), true);
assert.equal(isParticipatingAttendanceStatus("Z"), true);
assert.equal(isParticipatingAttendanceStatus("left_early"), true);
assert.equal(isAbsentAttendanceStatus("left_early"), false);
assert.equal(isAbsentAttendanceStatus("absent"), true);
assert.equal(hasParticipated(entry({ finalStatus: "left_early" })), true);
assert.equal(isMissedTraining(entry({ finalStatus: "left_early" })), false);
assert.equal(calculateReliabilityPenaltyFromStatus("left_early"), 0);

const partial = entry({
  plannedStatus: "expected",
  finalStatus: "left_early",
  actualAbsenceReason: "injured",
  actualAttendanceNote: "Injured during warm-up.",
  leftEarlyMinute: 2
});
assert.equal(isRateableAttendance(partial), true);
assert.equal(isDefaultRatingCandidate(partial), false);
assert.equal(overallRatingInitialValue(partial), undefined);
assert.equal(finalStatusLabel("left_early", "de"), "Training abgebrochen");

const summary = getFinalAttendanceSummary([
  entry({ finalStatus: "present" }),
  entry({ finalStatus: "Z" }),
  partial,
  entry({ finalStatus: "absent" })
]);
assert.deepEqual(
  { present: summary.present, late: summary.late, leftEarly: summary.leftEarly, absent: summary.absent },
  { present: 1, late: 1, leftEarly: 1, absent: 1 }
);
const distribution = calculateAttendanceDistribution([partial]);
assert.equal(distribution.leftEarly, 1);
assert.equal(distribution.injured, 0);

const preserved = applyAsExpectedDecision({ plannedStatus: "expected", finalStatus: "left_early" });
assert.equal(preserved.action, "unchanged");
assert.equal(preserved.finalStatus, "left_early");

const actions = fs.readFileSync(new URL("../lib/squad/attendance-actions.ts", import.meta.url), "utf8");
const controls = fs.readFileSync(new URL("../components/squad/attendance-controls.tsx", import.meta.url), "utf8");
assert.equal(actions.includes('?? "unexcused"'), false, "Unknown absence must not default to unexcused.");
assert.match(actions, /actual_attendance_note: update\.actualAttendanceNote/);
assert.match(actions, /left_early_minute: update\.leftEarlyMinute/);
assert.match(controls, /value="">\{ui\("Select reason"\)\}/);
assert.match(controls, /status="left_early"/);
assert.match(controls, /actualAttendanceNote/);

console.log("Actual attendance context regression passed.");
