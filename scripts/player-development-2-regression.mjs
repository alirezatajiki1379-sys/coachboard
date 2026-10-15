import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  activeDevelopmentGoals,
  isDevelopmentReviewDue,
  latestObservationForGoal,
  latestProgressForGoal,
  nextIncompleteGoalAction,
  primaryActiveDevelopmentGoal
} from "../lib/squad/development.ts";

function goal(overrides = {}) {
  return {
    id: "goal",
    userId: "user",
    squadId: "squad",
    playerId: "player",
    title: "Scanning before receiving",
    successCriteria: "Checks both shoulders before first touch",
    category: "other",
    priority: "medium",
    status: "in_progress",
    progress: "developing",
    startDate: "2026-10-01",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    actions: [],
    observations: [],
    progressUpdates: [],
    ...overrides
  };
}

test("primary active goal uses priority, review date, then latest update", () => {
  const goals = [
    goal({ id: "paused", status: "paused", priority: "high" }),
    goal({ id: "medium", priority: "medium", reviewDate: "2026-10-18" }),
    goal({ id: "high-later", priority: "high", reviewDate: "2026-10-25" }),
    goal({ id: "high-earlier", priority: "high", reviewDate: "2026-10-20" })
  ];
  assert.deepEqual(activeDevelopmentGoals(goals).map((item) => item.id), ["high-earlier", "high-later", "medium"]);
  assert.equal(primaryActiveDevelopmentGoal(goals)?.id, "high-earlier");
});

test("compact goal evidence uses the canonical latest and next helpers", () => {
  const current = goal({
    actions: [
      { id: "done", completed: true, description: "Done", dueDate: "2026-10-10", createdAt: "2026-10-01" },
      { id: "later", completed: false, description: "Later", dueDate: "2026-10-25", createdAt: "2026-10-01" },
      { id: "next", completed: false, description: "Next", dueDate: "2026-10-20", createdAt: "2026-10-02" }
    ],
    observations: [
      { id: "old", observationDate: "2026-10-10", createdAt: "2026-10-10T10:00:00Z", note: "Old" },
      { id: "new", observationDate: "2026-10-15", createdAt: "2026-10-15T10:00:00Z", note: "New" }
    ],
    progressUpdates: [
      { id: "old-progress", recordedAt: "2026-10-09", createdAt: "2026-10-09T10:00:00Z", progressLevel: "developing", note: "Old" },
      { id: "new-progress", recordedAt: "2026-10-14", createdAt: "2026-10-14T10:00:00Z", progressLevel: "consistent", note: "New" }
    ]
  });
  assert.equal(nextIncompleteGoalAction(current)?.id, "next");
  assert.equal(latestObservationForGoal(current)?.id, "new");
  assert.equal(latestProgressForGoal(current)?.id, "new-progress");
  assert.equal(isDevelopmentReviewDue(goal({ reviewDate: "2026-10-15" }), "2026-10-16"), true);
});

test("Development UI is progressive and Training observation reuses event-linked observations", () => {
  const component = readFileSync("components/squad/player-development.tsx", "utf8");
  const review = readFileSync("components/squad/session-review-form.tsx", "utf8");
  const reviewPage = readFileSync("app/(app)/trainings/[id]/review/page.tsx", "utf8");
  const actions = readFileSync("lib/squad/development-actions.ts", "utf8");

  assert.match(component, /activeGoals\.slice\(0, 3\)/);
  assert.match(component, /defaultValue="other"/);
  assert.match(component, /<details[^>]*>[\s\S]*More options/);
  assert.match(component, /DevelopmentTimeline/);
  assert.match(review, /Add player observation/);
  assert.match(review, /name="eventId" value=\{eventId\}/);
  assert.match(review, /selectedPlayer\?\.goals/);
  assert.match(reviewPage, /event\.attendance/);
  assert.match(reviewPage, /getActiveDevelopmentGoalsForPlayers/);
  assert.match(actions, /event_id: eventId/);
  assert.match(actions, /revalidatePath\(`\/trainings\/\$\{eventId\}\/review`\)/);
});

