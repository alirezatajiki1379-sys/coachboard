import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as training from "../lib/trainings/utils.ts";
import { getTrainingWorkflowState } from "../lib/trainings/workflow.ts";

function event(id, date, startTime, status = "prepared", options = {}) {
  return {
    id,
    date,
    startTime,
    status,
    attendance: [],
    ...options
  };
}

test("Dashboard keeps every non-trashed training from the local calendar day in chronological order", () => {
  const now = { date: "2026-09-19", time: "23:59:00" };
  const events = [
    event("tomorrow", "2026-09-20", "10:00"),
    event("late", now.date, "20:00", "rating_open"),
    event("morning", now.date, "09:00", "completed"),
    event("trash", now.date, "18:00", "completed", { deletedAt: "2026-09-19" }),
    event("yesterday", "2026-09-18", "18:00")
  ];

  assert.deepEqual(training.dashboardTrainingsForToday(events, now).map((item) => item.id), ["morning", "late"]);
  assert.equal(training.dashboardTrainingsForToday(events, { date: "2026-09-20", time: "00:00:00" }).some((item) => item.id === "late"), false);
  assert.deepEqual(training.dashboardTrainingsForToday([], now), []);
});

test("Dashboard keeps today visible before, during and after a session", () => {
  const todayEvent = event("today", "2026-09-19", "18:00", "prepared", { endTime: "19:30" });
  for (const time of ["00:00:00", "17:59:59", "18:30:00", "19:31:00", "23:59:59"]) {
    assert.deepEqual(training.dashboardTrainingsForToday([todayEvent], { date: todayEvent.date, time }).map((item) => item.id), ["today"]);
  }
});

test("Dashboard week uses the next seven Berlin calendar days and excludes today", () => {
  const now = { date: "2026-10-16", time: "15:00:00" };
  const events = [
    event("today", "2026-10-16", "18:00"),
    event("tomorrow", "2026-10-17", "18:00"),
    event("edge", "2026-10-23", "18:00"),
    event("outside", "2026-10-24", "18:00"),
    event("trash", "2026-10-18", "18:00", "prepared", { deletedAt: "2026-10-16" })
  ];
  assert.deepEqual(training.dashboardTrainingsForNextDays(events, 7, now).map((item) => item.id), ["tomorrow", "edge"]);
});

test("Dashboard today uses the canonical workflow without changing Past and Upcoming semantics", () => {
  const now = { date: "2026-09-19", time: "15:00:00" };
  const workflow = (value) => getTrainingWorkflowState({ event: value, hasPlan: false, hasReview: false, now });
  assert.equal(workflow(event("upcoming", now.date, "18:00")).phase, "preparation");
  assert.equal(workflow(event("live", now.date, "14:00", "prepared", { endTime: "16:00" })).phase, "live");
  assert.equal(workflow(event("finished", now.date, "12:00", "prepared", { endTime: "14:00" })).phase, "follow_up");
  assert.equal(workflow(event("completed", now.date, "18:00", "completed")).phase, "complete");
  assert.equal(workflow(event("ratings", now.date, "12:00", "rating_open")).phase, "follow_up");

  const morning = event("morning", now.date, "10:00");
  assert.equal(training.dashboardTrainingsForToday([morning], now).length, 1);
  assert.equal(training.filterTrainings([morning], "past", now).length, 1);
  assert.equal(training.filterTrainings([morning], "upcoming", now).length, 0);
});

test("Dashboard uses Berlin calendar boundaries", () => {
  assert.deepEqual(training.trainingNowParts("Europe/Berlin", new Date("2026-09-19T21:59:59Z")), { date: "2026-09-19", time: "23:59:59" });
  assert.deepEqual(training.trainingNowParts("Europe/Berlin", new Date("2026-09-19T22:00:00Z")), { date: "2026-09-20", time: "00:00:00" });
});

test("Dashboard 2.0 removes clutter and consumes canonical workflow data", () => {
  const dashboard = readFileSync("app/(app)/dashboard/page.tsx", "utf8");
  assert.match(dashboard, /dashboardTrainingsForNextDays/);
  assert.match(dashboard, /getTrainingWorkflowState/);
  assert.match(dashboard, /messages\.dashboard\.needsAttention/);
  assert.match(dashboard, /messages\.dashboard\.quickLinks/);
  assert.doesNotMatch(dashboard, /StatCard/);
  assert.doesNotMatch(dashboard, /recentDrills/);
  assert.doesNotMatch(dashboard, /recentSessions/);
  assert.doesNotMatch(dashboard, /openRatings/);
  assert.doesNotMatch(dashboard, /observationsThisWeek/);
});
