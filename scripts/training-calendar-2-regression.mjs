import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  calendarEventsForLegacyView,
  calendarFollowUpTrainings,
  calendarOperationalTrainings,
  groupCalendarUpcoming,
  parseTrainingCalendarView
} from "../lib/trainings/calendar.ts";
import { getTrainingWorkflowState } from "../lib/trainings/workflow.ts";

const now = { date: "2026-10-16", time: "10:00:00" };

function attendance(count = 18, { unresolved = 0, rated = 0 } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `attendance-${index}`,
    plannedStatus: "expected",
    finalStatus: index < unresolved ? undefined : "present",
    overallRating: index >= unresolved && index < unresolved + rated ? 3 : undefined
  }));
}

function event(id, date, startTime, options = {}) {
  return {
    id,
    date,
    startTime,
    endTime: "20:00",
    status: "prepared",
    attendance: attendance(),
    deletedAt: undefined,
    ...options
  };
}

function workflows(events, context = {}) {
  return Object.fromEntries(events.map((item) => [item.id, getTrainingWorkflowState({
    event: item,
    hasPlan: context.planIds?.has(item.id) ?? false,
    hasReview: context.reviewIds?.has(item.id) ?? false,
    now
  })]));
}

test("Current is the default and legacy rating_open maps to canonical follow-up", () => {
  assert.equal(parseTrainingCalendarView(), "current");
  assert.equal(parseTrainingCalendarView("rating_open"), "follow_up");
  for (const view of ["completed", "draft", "all", "upcoming", "past", "trash"]) assert.equal(parseTrainingCalendarView(view), view);
});

test("Calendar sections consume canonical workflow phases and primary actions", () => {
  const events = [
    event("later-today", now.date, "18:30"),
    event("live", now.date, "09:00", { endTime: "11:00" }),
    event("unresolved", "2026-10-15", "18:00", { attendance: attendance(18, { unresolved: 3 }) }),
    event("review", "2026-10-14", "18:00"),
    event("ratings", "2026-10-13", "18:00", { attendance: attendance(18, { rated: 8 }) }),
    event("reviewed", "2026-10-12", "18:00"),
    event("completed", "2026-10-11", "18:00", { status: "completed" })
  ];
  const states = workflows(events, { reviewIds: new Set(["reviewed"]) });
  assert.equal(states["later-today"].phase, "preparation");
  assert.equal(states["later-today"].primaryAction?.label, "Plan Training");
  assert.equal(states.live.phase, "live");
  assert.equal(states.live.primaryAction?.label, "Open Check-in");
  assert.equal(states.unresolved.primaryAction?.label, "Complete Attendance");
  assert.equal(states.review.primaryAction?.label, "Review Training");
  assert.equal(states.review.facts.some((fact) => fact.label === "Ratings"), false);
  assert.equal(states.ratings.primaryAction?.label, "Continue Ratings");
  assert.equal(states.ratings.facts.some((fact) => fact.label === "Ratings"), true);
  assert.equal(states.reviewed.phase, "complete");
  assert.equal(states.completed.primaryAction, null);
  assert.deepEqual(calendarOperationalTrainings(events, states).map((item) => item.id), ["live", "later-today"]);
  assert.deepEqual(calendarFollowUpTrainings(events, states, now).map((item) => item.id), ["unresolved", "review", "ratings"]);
});

test("Upcoming grouping uses Berlin calendar dates and keeps concrete recurring events", () => {
  const events = [
    event("today-a", now.date, "18:00"),
    event("today-b", now.date, "20:00", { recurrenceSeriesId: "series" }),
    event("next", "2026-10-17", "18:00", { recurrenceSeriesId: "series" }),
    event("edge", "2026-10-23", "18:00"),
    event("later", "2026-10-24", "18:00")
  ];
  const groups = groupCalendarUpcoming(events, now);
  assert.deepEqual(groups.today.map((item) => item.id), ["today-a", "today-b"]);
  assert.deepEqual(groups.nextSevenDays.map((item) => item.id), ["next", "edge"]);
  assert.deepEqual(groups.later.map((item) => item.id), ["later"]);
});

test("Past and Upcoming remain chronological and Trash stays excluded", () => {
  const events = [
    event("past-new", "2026-10-15", "18:00"),
    event("past-old", "2026-10-14", "18:00"),
    event("future", "2026-10-17", "18:00"),
    event("trash", "2026-10-13", "18:00", { deletedAt: "2026-10-16T09:00:00Z" })
  ];
  assert.deepEqual(calendarEventsForLegacyView(events, "past", now).map((item) => item.id), ["past-new", "past-old"]);
  assert.deepEqual(calendarEventsForLegacyView(events, "upcoming", now).map((item) => item.id), ["future"]);
});

test("Trainings page batches canonical workflow inputs and removes legacy calendar clutter", () => {
  const page = readFileSync("app/(app)/trainings/page.tsx", "utf8");
  const manager = readFileSync("components/squad/training-bulk-manager.tsx", "utf8");
  const row = readFileSync("components/squad/training-calendar-row.tsx", "utf8");
  assert.match(page, /getTrainingWorkflowState/);
  assert.match(page, /listConcreteTrainingPlanEventIds/);
  assert.match(page, /Promise\.all/);
  assert.match(page, /parseTrainingCalendarView/);
  assert.doesNotMatch(page, /function Metric/);
  assert.doesNotMatch(page, /needsRatingsCount|Needs ratings/);
  assert.doesNotMatch(manager, /TrainingEventCard/);
  assert.doesNotMatch(manager, /Select all visible|Select all filtered|Alle sichtbaren auswählen|Alle gefilterten auswählen/);
  assert.doesNotMatch(row, /Review missing|0\/|linkedTrainingSessionTitle|squadName|goalkeepers/);
  assert.match(row, /workflow\.primaryAction/);
  assert.match(row, /workflow\.facts\.slice\(0, 2\)/);
});

test("No database migration is introduced by Training Calendar 2.0", () => {
  const statusExpectation = readFileSync("app/(app)/trainings/page.tsx", "utf8");
  assert.doesNotMatch(statusExpectation, /\.from\(|insert\(|update\(/);
});
