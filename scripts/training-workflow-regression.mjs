import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getTrainingWorkflowState } from "../lib/trainings/workflow.ts";

const now = { date: "2026-10-16", time: "15:00:00" };

function attendance(count, { unresolved = 0, rated = 0 } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `attendance-${index}`,
    plannedStatus: "expected",
    finalStatus: index < unresolved ? undefined : "present",
    overallRating: index >= unresolved && index < unresolved + rated ? 3 : undefined
  }));
}

function event(overrides = {}) {
  return {
    id: "training",
    date: "2026-10-15",
    startTime: "18:00",
    endTime: "19:30",
    status: "prepared",
    attendance: attendance(18),
    ...overrides
  };
}

function workflow(overrides = {}, context = {}) {
  return getTrainingWorkflowState({
    event: event(overrides),
    hasPlan: context.hasPlan ?? false,
    hasReview: context.hasReview ?? false,
    now
  });
}

test("future preparation distinguishes missing and concrete plans", () => {
  assert.equal(workflow({ date: "2026-10-17" }).primaryAction?.label, "Plan Training");
  assert.equal(workflow({ date: "2026-10-17" }, { hasPlan: true }).primaryAction?.label, "Prepare Training");
  assert.equal(workflow({ date: now.date, startTime: "20:00", endTime: "21:30" }).phase, "preparation");
  assert.equal(workflow({ date: now.date, startTime: "20:00", endTime: "21:30" }).primaryAction?.href, "/trainings/training/plan");
});

test("scheduled or explicit live Training opens Check-in", () => {
  assert.equal(workflow({ date: now.date, startTime: "14:00", endTime: "16:00" }).primaryAction?.label, "Open Check-in");
  assert.equal(workflow({ date: "2026-10-17", status: "in_progress" }).phase, "live");
});

test("post-Training attendance incompleteness has priority, including inconsistent completed events", () => {
  const incomplete = attendance(18, { unresolved: 3 });
  assert.equal(workflow({ attendance: incomplete }).primaryAction?.label, "Complete Attendance");
  assert.equal(workflow({ attendance: incomplete, status: "completed" }).primaryAction?.label, "Complete Attendance");
  assert.deepEqual(workflow({ attendance: incomplete }).reasonValues, { count: 3 });
});

test("untouched Ratings stay optional while started Ratings can continue", () => {
  const untouched = workflow({ attendance: attendance(18) });
  assert.equal(untouched.primaryAction?.label, "Review Training");
  assert.equal(untouched.facts.some((fact) => fact.label === "Ratings"), false);

  const partial = workflow({ attendance: attendance(18, { rated: 8 }) });
  assert.equal(partial.primaryAction?.label, "Continue Ratings");
  assert.equal(partial.primaryAction?.href, "/trainings/training/ratings");

  assert.equal(workflow({ attendance: attendance(18, { rated: 18 }) }).primaryAction?.label, "Review Training");
  assert.equal(workflow({ attendance: attendance(18), status: "rating_open" }).primaryAction?.label, "Continue Ratings");
});

test("Review or explicit completion closes the workflow without making optional depth mandatory", () => {
  const reviewed = workflow({ attendance: attendance(18) }, { hasReview: true });
  assert.equal(reviewed.phase, "complete");
  assert.equal(reviewed.primaryAction, null);

  const reviewedPartial = workflow({ attendance: attendance(18, { rated: 8 }) }, { hasReview: true });
  assert.equal(reviewedPartial.phase, "complete");
  assert.equal(reviewedPartial.secondaryActions.some((action) => action.label === "Continue Ratings"), true);

  const completed = workflow({ attendance: attendance(18), status: "completed" });
  assert.equal(completed.phase, "complete");
  assert.equal(completed.primaryAction, null);
});

test("deleted Trainings have no coaching workflow action", () => {
  const deleted = workflow({ deletedAt: "2026-10-16T12:00:00Z" });
  assert.equal(deleted.phase, undefined);
  assert.equal(deleted.primaryAction, null);
  assert.deepEqual(deleted.secondaryActions, []);
});

test("Detail and Dashboard consume the same helper and concrete Session Plan route", () => {
  const detail = readFileSync("app/(app)/trainings/[id]/page.tsx", "utf8");
  const dashboard = readFileSync("app/(app)/dashboard/page.tsx", "utf8");
  const combined = `${detail}\n${dashboard}`;
  assert.match(detail, /getTrainingWorkflowState/);
  assert.match(dashboard, /getTrainingWorkflowState/);
  assert.doesNotMatch(detail, /getPrimaryTrainingAction/);
  assert.doesNotMatch(dashboard, /dashboardTrainingState/);
  assert.doesNotMatch(dashboard, /`\/sessions\/\$\{nextTraining\.linkedTrainingSessionId\}`/);
  assert.match(combined, /TrainingWorkflowPanel/);
  assert.match(detail, /\.neq\("status", "removed"\)/);
});
