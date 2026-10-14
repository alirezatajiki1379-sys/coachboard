import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { availabilityOnDate } from "../lib/squad/availability.ts";
import { applyMedicalPrefill } from "../lib/squad/attendance-queries.ts";
import {
  attendanceReasonLabels,
  normalizePlannedAttendanceReason,
  plannedAttendanceReasonOptions,
  plannedReasonToActualAbsenceReason
} from "../lib/squad/attendance-utils.ts";

const optionLabels = plannedAttendanceReasonOptions.map((reason) => attendanceReasonLabels[reason]);
for (const label of ["Injured", "Sick", "Private"]) {
  assert.equal(optionLabels.filter((candidate) => candidate === label).length, 1, `${label} must appear exactly once`);
}
assert.equal(plannedAttendanceReasonOptions.includes("V"), false, "legacy V must not be a separate option");
assert.equal(plannedAttendanceReasonOptions.includes("K"), false, "legacy K must not be a separate option");
assert.equal(plannedAttendanceReasonOptions.includes("P"), false, "legacy P must not be a separate option");

assert.equal(normalizePlannedAttendanceReason("V"), "injured");
assert.equal(normalizePlannedAttendanceReason("K"), "sick");
assert.equal(normalizePlannedAttendanceReason("P"), "private");
assert.equal(normalizePlannedAttendanceReason("E"), "E");
assert.equal(normalizePlannedAttendanceReason("S"), "S");
assert.equal(normalizePlannedAttendanceReason("U"), "U");

const overlap = availabilityOnDate({
  medical: [{
    player_id: "player-1",
    type: "injured",
    start_date: "2026-10-01",
    end_date: "2026-10-31",
    actual_return_date: null,
    description: "Ankle",
    status: "active",
    updated_at: "2026-10-01T10:00:00Z"
  }],
  general: [{
    player_id: "player-1",
    reason: "school",
    starts_on: "2026-10-14",
    ends_on: "2026-10-14",
    note: "School trip",
    status: "active",
    updated_at: "2026-10-12T10:00:00Z"
  }]
}, "2026-10-14").get("player-1");
assert.equal(overlap?.plannedReason, "school", "general availability must win over medical prefill");
assert.equal(overlap?.note, "School trip");
assert.equal(overlap?.source, "availability");

const latestGeneral = availabilityOnDate({
  medical: [],
  general: [
    {
      player_id: "player-1",
      reason: "school",
      starts_on: "2026-10-01",
      ends_on: "2026-10-31",
      note: "Older",
      status: "active",
      updated_at: "2026-10-10T10:00:00Z"
    },
    {
      player_id: "player-1",
      reason: "holiday",
      starts_on: "2026-10-12",
      ends_on: "2026-10-20",
      note: "Family holiday",
      status: "active",
      updated_at: "2026-10-11T10:00:00Z"
    }
  ]
}, "2026-10-14").get("player-1");
assert.equal(latestGeneral?.plannedReason, "holiday", "latest applicable general period must win");
assert.equal(latestGeneral?.note, "Family holiday");

const medicalPeriod = {
  id: "medical-1",
  userId: "user-1",
  playerId: "player-1",
  type: "injured",
  startDate: "2026-10-01",
  expectedReturnDate: "2026-10-18",
  description: "Ankle",
  status: "active",
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z"
};
const baseEntry = {
  id: "attendance-1",
  userId: "user-1",
  eventId: "event-1",
  playerId: "player-1",
  latePenaltyApplied: true,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z"
};
const medicalOnly = applyMedicalPrefill({ ...baseEntry, plannedStatus: "expected", plannedStatusSource: "default" }, medicalPeriod, true);
assert.equal(medicalOnly.plannedReason, "injured", "medical-only absence should prefill injured");
assert.equal(medicalOnly.plannedReasonNote, "Ankle");
assert.equal(medicalOnly.medicalAvailability?.label, "Injured");

const explicitAvailability = applyMedicalPrefill({
  ...baseEntry,
  plannedStatus: "unavailable",
  plannedReason: "school",
  plannedReasonNote: "School trip",
  plannedStatusSource: "availability"
}, medicalPeriod, true);
assert.equal(explicitAvailability.plannedReason, "school", "medical context must not overwrite general availability");
assert.equal(explicitAvailability.plannedReasonNote, "School trip");
assert.equal(explicitAvailability.medicalAvailability?.label, "Injured");

const manualOverride = applyMedicalPrefill({
  ...baseEntry,
  plannedStatus: "unavailable",
  plannedReason: "holiday",
  plannedReasonNote: "Family holiday",
  plannedStatusSource: "manual"
}, medicalPeriod, true);
assert.equal(manualOverride.plannedReason, "holiday", "manual override must win");
assert.equal(manualOverride.plannedReasonNote, "Family holiday");
assert.equal(manualOverride.medicalAvailability?.label, "Injured");

for (const [planned, actual] of [
  ["school", "school"],
  ["sick", "sick"],
  ["V", "injured"],
  ["holiday", "holiday"],
  ["P", "private"]
]) {
  assert.equal(plannedReasonToActualAbsenceReason(planned), actual, `${planned} should prefill ${actual}`);
}

const controls = readFileSync(new URL("../components/squad/attendance-controls.tsx", import.meta.url), "utf8");
const participants = readFileSync(new URL("../components/squad/training-participants-table.tsx", import.meta.url), "utf8");
const queries = readFileSync(new URL("../lib/squad/attendance-queries.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../lib/squad/attendance-actions.ts", import.meta.url), "utf8");
const report = readFileSync(new URL("../components/squad/player-conversation-report.tsx", import.meta.url), "utf8");

assert.match(controls, /plannedAttendanceReasonOptions\.map/, "dropdown must use canonical options");
assert.match(controls, /entryWithState\.plannedReasonNote/, "Check-in must render the planned note");
assert.match(participants, /entry\.plannedReasonNote/, "participant Reason column must render the planned note");
assert.match(controls, /if \(entry\.actualAbsenceReason\) return entry\.actualAbsenceReason/, "an existing actual reason must win");
assert.match(controls, /plannedReasonToActualAbsenceReason\(entry\.plannedReason\)/, "Absent must prefill from the canonical planned reason");
assert.match(queries, /entry\.plannedStatusSource === "default" \|\| entry\.plannedStatusSource === "medical"/, "medical prefill must be limited to lower-priority sources");
assert.match(actions, /normalizePlannedAttendanceReason\(plannedReason/, "explicit edits must save canonical legacy replacements");
assert.doesNotMatch(report, /plannedReasonNote/, "Player Report must keep private planned notes hidden");

console.log("Attendance reason consistency regression: PASS");
