import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isDefaultRatingCandidate,
  isRateableAttendance,
  overallRatingInitialValue,
  toggleRatingValue
} from "../lib/squad/attendance-utils.ts";
import { trainingRatingStats } from "../lib/trainings/utils.ts";

function entry(overrides = {}) {
  return {
    id: overrides.id ?? "attendance-id",
    userId: "user-id",
    eventId: "event-id",
    playerId: "player-id",
    plannedStatus: overrides.plannedStatus,
    finalStatus: overrides.finalStatus,
    overallRating: overrides.overallRating,
    latePenaltyApplied: true,
    createdAt: "",
    updatedAt: ""
  };
}

test("expected present player gets unsaved UI default rating 3", () => {
  const value = entry({ plannedStatus: "expected", finalStatus: "present" });
  assert.equal(isRateableAttendance(value), true);
  assert.equal(isDefaultRatingCandidate(value), true);
  assert.equal(overallRatingInitialValue(value), 3);
});

test("expected late player gets unsaved UI default rating 3", () => {
  const value = entry({ plannedStatus: "expected", finalStatus: "Z" });
  assert.equal(isDefaultRatingCandidate(value), true);
  assert.equal(overallRatingInitialValue(value), 3);
});

test("saved rating wins over default rating", () => {
  const value = entry({ plannedStatus: "expected", finalStatus: "present", overallRating: 4 });
  assert.equal(overallRatingInitialValue(value), 4);
});

test("expected absent player has no rating default and is not rateable", () => {
  const value = entry({ plannedStatus: "expected", finalStatus: "U" });
  assert.equal(isRateableAttendance(value), false);
  assert.equal(isDefaultRatingCandidate(value), false);
  assert.equal(overallRatingInitialValue(value), undefined);
});

test("not expected participant can be rated but receives no automatic default", () => {
  const value = entry({ plannedStatus: "unavailable", finalStatus: "present" });
  assert.equal(isRateableAttendance(value), true);
  assert.equal(isDefaultRatingCandidate(value), false);
  assert.equal(overallRatingInitialValue(value), undefined);
});

test("not recorded attendance has no rating default", () => {
  const value = entry({ plannedStatus: "expected" });
  assert.equal(isRateableAttendance(value), false);
  assert.equal(isDefaultRatingCandidate(value), false);
  assert.equal(overallRatingInitialValue(value), undefined);
});

test("analytics rating stats count only saved ratings, not UI default 3", () => {
  const stats = trainingRatingStats({
    attendance: [
      entry({ plannedStatus: "expected", finalStatus: "present" }),
      entry({ plannedStatus: "expected", finalStatus: "Z", overallRating: 3 }),
      entry({ plannedStatus: "expected", finalStatus: "U" })
    ]
  });
  assert.equal(stats.rateable, 2);
  assert.equal(stats.rated, 1);
});

test("rating button toggle selects a value from unrated", () => {
  assert.equal(toggleRatingValue(null, 3), 3);
  assert.equal(toggleRatingValue(undefined, 4), 4);
});

test("rating button toggle clears the selected value to null", () => {
  assert.equal(toggleRatingValue(3, 3), null);
  assert.equal(toggleRatingValue(4, 4), null);
});

test("rating button toggle switches directly to another value", () => {
  assert.equal(toggleRatingValue(3, 4), 4);
  assert.equal(toggleRatingValue(5, 2), 2);
});

test("analytics ignores null ratings after a rating is toggled off", () => {
  const clearedRating = toggleRatingValue(4, 4);
  const stats = trainingRatingStats({
    attendance: [
      entry({ plannedStatus: "expected", finalStatus: "present", overallRating: clearedRating }),
      entry({ plannedStatus: "expected", finalStatus: "present", overallRating: 5 })
    ]
  });
  assert.equal(clearedRating, null);
  assert.equal(stats.rateable, 2);
  assert.equal(stats.rated, 1);
});
