import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clockTime,
  resolveBriefResponsibility,
  sectionDuration,
  sectionStartOffsets
} from "../lib/squad/staff-brief.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const labels = { me: "Me", together: "Together", unassigned: "Unassigned", staffMember: "Staff member" };
const inactiveStaff = { id: "tobi", name: "Tobi", role: "Assistant Coach", isActive: false };
const sections = [
  {
    id: "activation",
    key: "activation",
    title: "Activation",
    orderIndex: 0,
    durationMinutes: 10,
    notes: "",
    briefingText: "",
    responsibilityMode: "me",
    planningStatus: "ready",
    instruction: "",
    drills: []
  },
  {
    id: "main",
    key: "main",
    title: "Main Part 2",
    orderIndex: 1,
    durationMinutes: 20,
    notes: "",
    briefingText: "",
    responsibilityMode: "staff",
    staffId: "tobi",
    planningStatus: "needs_planning",
    instruction: "Prepare a transition exercise.",
    drills: []
  }
];

assert.deepEqual(sectionStartOffsets(sections), [0, 10], "empty delegated sections must still occupy timeline duration");
assert.equal(sectionDuration(sections[1]), 20);
assert.equal(clockTime("18:30", 30), "19:00");
assert.equal(resolveBriefResponsibility(sections[1], undefined, [inactiveStaff], labels).label, "Tobi", "historical inactive Staff name must resolve");

const inherited = resolveBriefResponsibility(sections[1], {
  id: "drill-1",
  title: "3v2",
  durationMinutes: 15,
  fallbackText: "",
  briefingText: "",
  organization: "",
  sessionNote: "",
  coachingPoints: [],
  equipment: [],
  visual: { graphic: { pitch: "full", objects: [], lines: [] }, source: "editor" },
  planningInstruction: ""
}, [inactiveStaff], labels);
assert.equal(inherited.label, "Tobi");
assert.equal(inherited.inherited, true);

const override = resolveBriefResponsibility(sections[1], {
  id: "drill-2",
  title: "Finish",
  durationMinutes: 10,
  fallbackText: "",
  briefingText: "",
  organization: "",
  sessionNote: "",
  coachingPoints: [],
  equipment: [],
  visual: { graphic: { pitch: "full", objects: [], lines: [] }, source: "editor" },
  responsibilityMode: "me",
  planningInstruction: ""
}, [inactiveStaff], labels);
assert.equal(override.label, "Me");
assert.equal(override.inherited, false);

const composer = read("components/squad/staff-brief-composer.tsx");
const route = read("app/(app)/trainings/[id]/brief/page.tsx");
const actions = read("lib/squad/staff-brief-actions.ts");
const css = read("app/globals.css");
const staffActions = read("lib/squad/staff-actions.ts");

for (const capability of ["includeNames", "includeVisuals", "includePoints", "includeEquipment", "includeInstructions", "navigator.share", "copyText", "condense", "ResizeObserver"]) {
  assert.ok(composer.includes(capability), `${capability} must remain available in the Staff Brief composer`);
}
assert.match(route, /isExpectedFromPlannedStatus/);
assert.match(route, /participantComposition/);
assert.match(route, /selectedCoachingPoints|coachingPoints/);
assert.match(route, /StaffBriefComposer/);
assert.doesNotMatch(route, /entry\.overallRating|player\.medicalNotes|player\.developmentGoal|entry\.coachNote/, "private Player data must not enter Staff Brief data mapping");
assert.match(actions, /briefing_text/);
assert.match(actions, /briefingText/);
assert.match(actions, /Your edits are still here/);
assert.match(staffActions, /is_active: true/);
assert.doesNotMatch(staffActions, /\.delete\(/, "Staff management must not hard-delete Staff");
assert.match(css, /@page staff-brief/);
assert.match(css, /size: A4 portrait/);
assert.doesNotMatch(css, /staff-brief[^}]*overflow:\s*hidden/s, "Staff Brief content must not be silently clipped");

console.log("Staff & Briefing workflow regression: PASS");
