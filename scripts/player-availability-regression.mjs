import assert from "node:assert/strict";
import { absenceReasonToPlannedReason, playerAbsenceReasonLabels } from "../lib/squad/availability.ts";
import { attendanceReasonLabels } from "../lib/squad/attendance-utils.ts";

const expected = {
  injured: "injured",
  sick: "sick",
  school: "school",
  work: "work",
  holiday: "holiday",
  private: "private",
  other: "other"
};

for (const [reason, plannedReason] of Object.entries(expected)) {
  assert.equal(absenceReasonToPlannedReason(reason), plannedReason, `${reason} should map to ${plannedReason}`);
  assert.ok(playerAbsenceReasonLabels[reason], `${reason} should have a Player Profile label`);
  assert.ok(attendanceReasonLabels[plannedReason], `${plannedReason} should have a Training participant label`);
}

console.log("Player availability reason regression checks passed.");
