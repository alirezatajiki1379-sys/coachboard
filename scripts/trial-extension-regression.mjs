import assert from "node:assert/strict";
import {
  calculateTrialPeriodSummary,
  estimatedSessionExtensionEnd,
  extendedTrainingLimit,
  isValidTrialDateExtension
} from "../lib/squad/trials.ts";

const now = { date: "2026-10-10", time: "12:00:00" };
const events = [
  event("one", "2026-09-22"),
  event("two", "2026-09-29"),
  event("three", "2026-10-06"),
  event("four", "2026-10-08"),
  event("five", "2026-10-12"),
  event("six", "2026-10-19"),
  event("seven", "2026-10-26"),
  event("eight", "2026-11-02")
];

const activeCount = summary({ trialDurationMode: "training_count", trialTrainingLimit: 5 }, events);
assert.equal(activeCount.status, "active");
assert.equal(activeCount.remainingTrainingCount, 1);
assert.equal(extendedTrainingLimit(activeCount, 2), 7, "active count trials add to the existing limit");
assert.equal(estimatedSessionExtensionEnd(activeCount, events, 2, "2026-09-20"), "2026-10-26");

const activeDate = summary({ trialDurationMode: "end_date", trialEndDate: "2026-10-20" }, events);
assert.equal(activeDate.status, "active");
assert.equal(isValidTrialDateExtension(activeDate, "2026-10-21", now.date), true);
assert.equal(isValidTrialDateExtension(activeDate, "2026-10-20", now.date), false);

const expiredCount = summary({ trialDurationMode: "training_count", trialTrainingLimit: 2 }, events);
assert.equal(expiredCount.status, "expired");
assert.equal(expiredCount.completedTrainingCount, 4);
assert.equal(extendedTrainingLimit(expiredCount, 2), 6, "elapsed gap trainings must not consume the new extension");
assert.equal(estimatedSessionExtensionEnd(expiredCount, events, 2, "2026-09-20"), "2026-10-19");

const expiredDate = summary({ trialDurationMode: "end_date", trialEndDate: "2026-10-01" }, events);
assert.equal(expiredDate.status, "expired");
assert.equal(isValidTrialDateExtension(expiredDate, "2026-10-11", now.date), true);
assert.equal(isValidTrialDateExtension(expiredDate, "2026-10-10", now.date), false);

const afterFirstExtension = summary({ trialDurationMode: "training_count", trialTrainingLimit: extendedTrainingLimit(expiredCount, 2) }, events);
assert.equal(afterFirstExtension.status, "active", "an expired trial becomes active after upcoming sessions are added");
assert.equal(extendedTrainingLimit(afterFirstExtension, 3), 9, "a second extension adds to the already extended limit");

const noFutureSchedule = summary(
  { trialDurationMode: "training_count", trialTrainingLimit: 2 },
  events.filter((item) => item.date < now.date)
);
assert.equal(extendedTrainingLimit(noFutureSchedule, 2), 6, "extension remains representable without future scheduled trainings");
assert.equal(estimatedSessionExtensionEnd(noFutureSchedule, events.filter((item) => item.date < now.date), 2, "2026-09-20"), undefined);

assert.deepEqual(events.map((item) => item.id), ["one", "two", "three", "four", "five", "six", "seven", "eight"], "trial calculations must not mutate historical training data");
console.log("Trial extension regression checks passed.");

function summary(overrides, sourceEvents) {
  const result = calculateTrialPeriodSummary({
    playerType: "trial",
    trialStartDate: "2026-09-20",
    updatedAt: "2026-10-10T09:00:00.000Z",
    ...overrides
  }, sourceEvents, now);
  assert.ok(result);
  return result;
}

function event(id, date) {
  return { id, date, startTime: "18:00" };
}
