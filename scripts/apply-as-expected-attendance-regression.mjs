import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyAsExpectedDecision,
  getApplyAsExpectedSummary,
  overallRatingInitialValue,
  plannedReasonToActualAbsenceReason
} from "../lib/squad/attendance-utils.ts";
import { workflowCopyDe } from "../lib/i18n/workflow-copy-de.ts";

function decision(input) {
  return applyAsExpectedDecision(input);
}

assert.deepEqual(decision({ plannedStatus: "expected" }), {
  action: "present",
  finalStatus: "present",
  actualAbsenceReason: null,
  needsReview: false
});
assert.equal(decision({ plannedStatus: null }).finalStatus, "present");

for (const [plannedReason, actualAbsenceReason, finalStatus] of [
  ["sick", "sick", "K"],
  ["K", "sick", "K"],
  ["injured", "injured", "V"],
  ["V", "injured", "V"],
  ["school", "school", "absent"],
  ["work", "work", "absent"],
  ["holiday", "holiday", "absent"],
  ["private", "private", "P"],
  ["P", "private", "P"],
  ["other", "other", "absent"],
  ["E", "excused", "E"],
  ["U", "unexcused", "U"]
]) {
  const result = decision({ plannedStatus: "unavailable", plannedReason });
  assert.equal(result.action, "absent", plannedReason);
  assert.equal(result.actualAbsenceReason, actualAbsenceReason, plannedReason);
  assert.equal(result.finalStatus, finalStatus, plannedReason);
  assert.equal(result.needsReview, false, plannedReason);
}

assert.equal(plannedReasonToActualAbsenceReason("Z"), null);
assert.deepEqual(decision({ plannedStatus: "unavailable" }), {
  action: "absent",
  finalStatus: "absent",
  actualAbsenceReason: null,
  needsReview: true
});
assert.deepEqual(decision({ plannedStatus: "unavailable", plannedReason: "S" }), {
  action: "absent",
  finalStatus: "S",
  actualAbsenceReason: null,
  needsReview: true
});
assert.equal(decision({ plannedStatus: "unclear" }).action, "review");

for (const existing of ["present", "absent", "Z", "V"]) {
  const result = decision({ plannedStatus: "expected", finalStatus: existing });
  assert.equal(result.action, "unchanged", existing);
  assert.equal(result.finalStatus, existing, existing);
}
assert.equal(decision({ plannedStatus: "unavailable", plannedReason: "sick", finalStatus: "present" }).action, "unchanged");

const historicalRecord = { plannedStatus: "unavailable", plannedReason: "sick", player: undefined };
assert.equal(decision(historicalRecord).actualAbsenceReason, "sick");
const formerPlayer = { plannedStatus: "expected", player: { archivedAt: "2026-01-01" } };
assert.equal(decision(formerPlayer).finalStatus, "present");
const trialPlayer = { plannedStatus: "expected", player: { playerType: "trial" } };
assert.equal(decision(trialPlayer).finalStatus, "present");

const summary = getApplyAsExpectedSummary([
  { plannedStatus: "expected" },
  { plannedStatus: "expected" },
  { plannedStatus: "unavailable", plannedReason: "sick" },
  { plannedStatus: "unavailable" },
  { plannedStatus: "unclear" },
  { plannedStatus: "expected", finalStatus: "present" }
]);
assert.deepEqual(summary, { applicable: 4, present: 2, absent: 2, needsReview: 2 });

assert.equal(overallRatingInitialValue({ plannedStatus: "expected", finalStatus: "present" }), 3);
assert.equal(overallRatingInitialValue({ plannedStatus: "unavailable", finalStatus: "K" }), undefined);

assert.equal(workflowCopyDe["Apply as expected"], "Wie erwartet übernehmen");
assert.equal(workflowCopyDe["Set missing attendance based on planned participation."], "Fehlende Anwesenheit anhand der Planung übernehmen.");

const actionSource = readFileSync(new URL("../lib/squad/attendance-actions.ts", import.meta.url), "utf8");
const actionStart = actionSource.indexOf("export async function applyAttendanceAsExpected");
const actionEnd = actionSource.indexOf("export async function markAllPresent", actionStart);
const action = actionSource.slice(actionStart, actionEnd);
assert.ok(action.includes('.is("final_status", null)'), "bulk writes must remain concurrency-safe");
assert.ok(action.includes('.select("id, planned_status, planned_reason")'), "historical participant snapshot must be authoritative");
assert.ok(!action.includes("squad_players"), "bulk action must not reconstruct participants from the current squad");
assert.ok(!action.includes("availability"), "bulk action must not use current availability");
assert.ok(action.includes("overall_rating: null"), "absent records must not retain ratings");

const controlsSource = readFileSync(new URL("../components/squad/attendance-controls.tsx", import.meta.url), "utf8");
assert.ok(controlsSource.includes("<ApplyAsExpectedAttendance eventId={event.id}"), "Quick Check-in must expose the shared action");
assert.ok(controlsSource.includes("w-full shrink-0 justify-center px-4 sm:w-auto"), "action must remain usable on mobile");
const trainingPageSource = readFileSync(new URL("../app/(app)/trainings/[id]/page.tsx", import.meta.url), "utf8");
assert.ok(trainingPageSource.includes("<ApplyAsExpectedAttendance eventId={event.id}"), "Training attendance screen must expose the shared action");

console.log("Apply-as-expected attendance regression: PASS");
