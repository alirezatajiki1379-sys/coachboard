import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const form = read("components/sessions/session-form.tsx");
const page = read("app/(app)/trainings/[id]/plan/page.tsx");
const actions = read("lib/squad/training-plan-actions.ts");
const brief = read("app/(app)/trainings/[id]/brief/page.tsx");
const migration = read("supabase/migrations/20260920_training_staff_brief.sql");

assert.match(page, /<SessionForm[\s\S]*builderMode="session"/, "concrete Training must render the shared SessionForm");
assert.match(form, /builderMode = "template"/, "template behavior must remain the shared builder default");
assert.match(page, /Use Training Plan/);
assert.match(page, /Create from scratch/);
assert.doesNotMatch(page, /phaseOptions/, "the old simplified fixed-phase planner must be retired");

for (const capability of ["addSection", "moveSection", "deleteSection", "moveDraggedDrill", "SessionOnlyDrillEditor", "ResponsibilityInput"]) {
  assert.ok(form.includes(capability), `${capability} must remain available in the shared builder`);
}
assert.match(form, /selectedCoachingPoints/);
assert.match(form, /descriptionOverride/);
assert.match(form, /planningInstruction/);
assert.match(form, /findSectionInsertIndex\(withoutDragged, target, builderMode/);

assert.match(actions, /export async function updateConcreteSessionPlan/);
assert.match(actions, /training_section_briefs/);
assert.match(actions, /override_json: drillOverride/);
assert.match(actions, /snapshot_json: snapshot/);
assert.match(actions, /plan_json:/);
assert.match(actions, /copyTrainingSessionTemplate/);
assert.doesNotMatch(actions, /update\([\s\S]{0,120}from\("drills"\)/, "Session overrides must not update Drill Library rows");
assert.doesNotMatch(actions, /update\([\s\S]{0,120}from\("training_sessions"\)/, "Session edits must not mutate reusable Training Plans");

assert.match(brief, /training_section_briefs/);
assert.match(brief, /training_session_drill_instances/);
assert.match(brief, /override_json/);
assert.match(brief, /coachingPoints/);
assert.match(brief, /responsibilityText/);

for (const column of ["plan_json", "override_json", "section_id", "responsibility_mode", "planning_instruction"]) {
  assert.ok(migration.includes(column), `Production migration must contain ${column}`);
}

console.log("Shared Session Plan Builder regression: PASS");
