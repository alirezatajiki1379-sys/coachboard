import assert from "node:assert/strict";
import test from "node:test";
import { calculateRatingCoverage } from "../lib/squad/analytics.ts";
import { createTeamAnalytics } from "../lib/squad/analytics-queries.ts";
import { getTrainingAttentionItems } from "../lib/squad/attention.ts";

const USER_ID = "user";
const SQUAD_ID = "squad";
const EVENT_ID = "event";
const event = {
  id: EVENT_ID,
  userId: USER_ID,
  squadId: SQUAD_ID,
  date: "2026-10-12",
  startTime: "18:00",
  label: "Stützpunkttraining",
  status: "rating_open",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z"
};

test("canonical attendance denominators keep planning, outcome and coverage separate", () => {
  const records = [
    ...rows(84, (index) => record(index, "expected", "present")),
    ...rows(5, (index) => record(index + 84, "expected", "U")),
    ...rows(29, (index) => record(index + 89, "unavailable", "E"))
  ];
  const analytics = teamAnalytics(records);

  assert.equal(analytics.participantRecordCount, 118);
  assert.equal(analytics.attendanceRecordCount, 118);
  assert.equal(analytics.dataCoverageRate, 1);
  assert.equal(analytics.expectedRecordedCount, 89);
  assert.equal(analytics.attendedWhenExpectedCount, 84);
  assert.equal(analytics.absentWhenExpectedCount, 5);
  assert.equal(analytics.teamAttendanceWhenExpectedRate, 84 / 89);
  assert.equal(analytics.absenceWhenExpectedRate, 5 / 89);
  assert.equal(analytics.notExpected, 29);
  assert.equal(analytics.plannedUnavailableRate, 29 / 118);
  assert.equal(analytics.actualParticipationRate, 84 / 118);
  assert.equal(analytics.actualAbsenceRate, 34 / 118);
});

test("actual outcome uses recorded attendance as its denominator", () => {
  const analytics = teamAnalytics([
    ...rows(85, (index) => record(index, "expected", index === 84 ? "left_early" : "present")),
    ...rows(33, (index) => record(index + 85, "expected", "absent"))
  ]);
  assert.equal(analytics.actualParticipationRate, 85 / 118);
  assert.equal(analytics.actualAbsenceRate, 33 / 118);
  assert.equal(analytics.leftEarly, 1);
  assert.equal(analytics.leftEarlyRate, 1 / 85);
});

test("rating coverage counts only expected Present or Late players", () => {
  const complete = rows(85, (index) => ({ ...record(index, "expected", index % 2 ? "present" : "Z"), overallRating: 4 }));
  const incomplete = complete.map((entry, index) => index < 82 ? entry : { ...entry, overallRating: undefined });
  assert.deepEqual(calculateRatingCoverage(complete), { eligible: 85, completed: 85, rate: 1, totalRated: 85, average: 4 });
  assert.equal(calculateRatingCoverage(incomplete).completed, 82);
  assert.equal(calculateRatingCoverage(incomplete).rate, 82 / 85);
});

test("Left early participates and an explicit rating affects averages without creating rating debt", () => {
  const records = [
    { ...record(0, "expected", "left_early"), overallRating: 5 },
    { ...record(1, "expected", "present"), overallRating: undefined }
  ];
  const coverage = calculateRatingCoverage(records);
  const analytics = teamAnalytics(records);
  assert.equal(analytics.present + analytics.late + analytics.leftEarly, 2);
  assert.equal(coverage.eligible, 1);
  assert.equal(coverage.completed, 0);
  assert.equal(coverage.totalRated, 1);
  assert.equal(coverage.average, 5);
});

test("player filters affect player KPIs without changing training and drill totals", () => {
  const allRecords = [record(0, "expected", "present"), record(1, "expected", "U")];
  const filteredRecords = [allRecords[0]];
  const analytics = createTeamAnalytics(
    squad(),
    [event],
    allRecords,
    [],
    [{ id: "instance", event_id: EVENT_ID, source_drill_id: "drill", title: "Passing" }],
    [],
    [],
    [],
    filters(),
    { seasonStartMonth: 7, seasonStartDay: 1 },
    filteredRecords
  );
  assert.equal(analytics.trainingSessions, 1);
  assert.equal(analytics.drillInstancesUsed, 1);
  assert.equal(analytics.participantRecordCount, 1);
  assert.equal(analytics.attendanceRecordCount, 1);
  assert.equal(analytics.teamAttendanceWhenExpectedRate, 1);
});

test("missing Training ratings create one action only after attendance is complete", () => {
  const attendance = rows(21, (index) => ({
    plannedStatus: "expected",
    finalStatus: "present",
    overallRating: index < 18 ? 4 : undefined,
    player: { firstName: "Player", lastName: String(index + 1) }
  }));
  const actions = getTrainingAttentionItems([attentionEvent(attendance)], { today: "2026-10-15" });
  const ratingActions = actions.filter((item) => item.type === "training-ratings-missing");
  assert.equal(ratingActions.length, 1);
  assert.equal(ratingActions[0].title, "3 Training ratings missing");
  assert.match(ratingActions[0].explanation, /^3 of 21/);
  assert.match(String(ratingActions[0].evidence.find((item) => item.label === "Players")?.value), /Player 19/);
  assert.equal(ratingActions[0].suggestedActions[0].href, `/trainings/${EVENT_ID}/ratings`);
  assert.equal(ratingActions[0].priority, "high");
});

test("complete ratings remove the action automatically", () => {
  const attendance = rows(21, () => ({ plannedStatus: "expected", finalStatus: "present", overallRating: 4 }));
  const actions = getTrainingAttentionItems([attentionEvent(attendance)], { today: "2026-10-15" });
  assert.equal(actions.some((item) => item.type === "training-ratings-missing"), false);
});

test("incomplete attendance suppresses premature rating debt", () => {
  const attendance = [
    { plannedStatus: "expected", finalStatus: "present", overallRating: undefined },
    { plannedStatus: "expected", finalStatus: undefined, overallRating: undefined }
  ];
  const actions = getTrainingAttentionItems([attentionEvent(attendance)], { today: "2026-10-15" });
  assert.equal(actions.some((item) => item.type === "training-ratings-missing"), false);
  assert.equal(actions.some((item) => item.type === "training-review-incomplete" && item.category === "attendance"), true);
});

function rows(count, create) {
  return Array.from({ length: count }, (_, index) => create(index));
}

function record(index, plannedStatus, finalStatus) {
  return {
    id: `attendance-${index}`,
    userId: USER_ID,
    eventId: EVENT_ID,
    playerId: `player-${index}`,
    plannedStatus,
    finalStatus,
    latePenaltyApplied: true,
    sensitiveNote: false,
    event,
    createdAt: "2026-10-12T18:00:00Z",
    updatedAt: "2026-10-12T18:00:00Z"
  };
}

function teamAnalytics(records) {
  return createTeamAnalytics(squad(), [event], records, [], [], [], [], [], filters(), { seasonStartMonth: 7, seasonStartDay: 1 });
}

function attentionEvent(attendance) {
  return { ...event, squadName: "U15", reviewCompleted: true, attendance };
}

function squad() {
  return { id: SQUAD_ID, userId: USER_ID, name: "U15", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
}

function filters() {
  return { section: "overview", period: "all", playerType: "all", sort: "name", direction: "asc", ratedOnly: false };
}
