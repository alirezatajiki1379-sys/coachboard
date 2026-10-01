import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerAnalyticsSummary, filterEventsByPeriod, formatPercent } from "../lib/squad/analytics.ts";
import { createTeamAnalytics, parseAnalyticsFilters } from "../lib/squad/analytics-queries.ts";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_EVENT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const SQUAD_ID = "44444444-4444-4444-8444-444444444444";

const event = trainingEvent(EVENT_ID, "2026-09-30", "18:00", "Training A");
const player = {
  id: "55555555-5555-4555-8555-555555555555",
  userId: USER_ID,
  squadId: SQUAD_ID,
  playerType: "roster",
  firstName: "Test",
  positionFamilies: [],
  secondaryPositions: [],
  preferredPositions: [],
  onboardingWarnings: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};

test("one training reconciles all participant attendance rows", () => {
  const records = [
    ...attendanceRows("present", 14),
    ...attendanceRows("Z", 2, 14),
    ...attendanceRows("U", 1, 16),
    ...attendanceRows(undefined, 1, 17)
  ];
  const analytics = createTeamAnalytics(
    squad(),
    [event],
    records,
    [],
    [],
    [],
    [],
    [],
    filters(),
    { seasonStartMonth: 7, seasonStartDay: 1 }
  );

  assert.equal(analytics.trainingSessions, 1);
  assert.equal(analytics.participantRecordCount, 18);
  assert.equal(analytics.attendanceRecordCount, 17);
  assert.equal(analytics.present, 14);
  assert.equal(analytics.late, 2);
  assert.equal(analytics.absent, 1);
  assert.equal(analytics.notRecorded, 1);
  assert.equal(analytics.teamParticipationRate, 16 / 18);
  assert.equal(analytics.teamAttendanceWhenExpectedRate, 16 / 17);
  assert.equal(analytics.teamAttendanceRate, 16 / 17);
});

test("training remains counted without attendance, ratings or a review", () => {
  const analytics = createTeamAnalytics(
    squad(),
    [event],
    [],
    [],
    [],
    [],
    [],
    [],
    filters(),
    { seasonStartMonth: 7, seasonStartDay: 1 }
  );

  assert.equal(analytics.trainingSessions, 1);
  assert.equal(analytics.reviewedSessions, 0);
  assert.equal(analytics.reviewCoverage, 0);
  assert.equal(analytics.attendanceRecordCount, 0);
  assert.equal(analytics.teamAttendanceRate, null);
});

test("team participation and attendance when expected remain distinct", () => {
  const records = [
    attendanceRow("present", 0),
    { ...attendanceRow("U", 1), plannedStatus: "unavailable" },
    { ...attendanceRow("present", 2), plannedStatus: "unavailable" }
  ];
  const analytics = createTeamAnalytics(squad(), [event], records, [], [], [], [], [], filters(), { seasonStartMonth: 7, seasonStartDay: 1 });
  assert.equal(analytics.attendanceRecordCount, 3);
  assert.equal(analytics.absent, 1);
  assert.equal(analytics.teamParticipationRate, 2 / 3);
  assert.equal(analytics.teamAttendanceWhenExpectedRate, 1);
  assert.equal(analytics.teamAttendanceRate, 1);
});

test("player analytics counts not expected snapshots in trainings and participation", () => {
  const summary = playerSummary([
    playerRecord("training-a", "2026-09-01", "expected", "present"),
    playerRecord("training-b", "2026-09-08", "unavailable", undefined, "holiday"),
    playerRecord("training-c", "2026-09-15", "unavailable", undefined, "private")
  ]);

  assert.equal(summary.trainings, 3);
  assert.equal(summary.attended, 1);
  assert.equal(summary.notExpectedTrainings, 2);
  assert.equal(summary.participationRate, 1 / 3);
  assert.equal(summary.attendanceWhenExpectedRate, 1);
  assert.equal(summary.attendedWhenExpected, 1);
  assert.equal(summary.attendanceWhenExpectedRecorded, 1);
  assert.equal(summary.recordedTrainings, 1);
  assert.equal(summary.notRecordedTrainings, 2);
  assert.equal(summary.plannedAbsenceDistribution.holiday, 1);
  assert.equal(summary.plannedAbsenceDistribution.private, 1);
  assert.match(formatPercent(summary.participationRate, "en"), /33\.3/);
});

test("present, absent and late reconcile to both rates", () => {
  const summary = playerSummary([
    playerRecord("training-a", "2026-09-01", "expected", "present"),
    playerRecord("training-b", "2026-09-08", "expected", "absent"),
    playerRecord("training-c", "2026-09-15", "expected", "Z")
  ]);

  assert.equal(summary.trainings, 3);
  assert.equal(summary.attended, 2);
  assert.equal(summary.absent, 1);
  assert.equal(summary.participationRate, 2 / 3);
  assert.equal(summary.attendanceWhenExpectedRate, 2 / 3);
});

test("not recorded stays relevant without becoming absent", () => {
  const summary = playerSummary([
    playerRecord("training-a", "2026-09-01", "expected", "present"),
    playerRecord("training-b", "2026-09-08", "unavailable", undefined, "sick"),
    playerRecord("training-c", "2026-09-15", "expected", undefined)
  ]);

  assert.equal(summary.trainings, 3);
  assert.equal(summary.participationRate, 1 / 3);
  assert.equal(summary.attendanceWhenExpectedRate, 1);
  assert.equal(summary.absent, 0);
  assert.equal(summary.recordedTrainings, 1);
  assert.equal(summary.notRecordedTrainings, 2);
});

test("historical participant snapshots exclude trainings before a player joined", () => {
  const joinedPlayer = { ...player, joinedDate: "2026-09-10" };
  const summary = createPlayerAnalyticsSummary(
    joinedPlayer,
    [playerRecord("after-join", "2026-09-15", "expected", "present")],
    "all"
  );
  assert.equal(summary.trainings, 1);
  assert.equal(summary.records[0].event?.date, "2026-09-15");
});

test("trial analytics use only the trial player's historical snapshots", () => {
  const trialPlayer = { ...player, playerType: "trial", trialStartDate: "2026-09-08", trialEndDate: "2026-09-16" };
  const ownRecords = [
    { ...playerRecord("trial-a", "2026-09-08", "expected", "present"), playerId: trialPlayer.id },
    { ...playerRecord("trial-b", "2026-09-15", "unavailable", undefined, "school"), playerId: trialPlayer.id }
  ];
  const unrelatedOutsideWindow = { ...playerRecord("outside", "2026-09-22", "expected", "present"), playerId: "another-player" };
  const summary = createPlayerAnalyticsSummary(trialPlayer, [...ownRecords, unrelatedOutsideWindow], "all");
  assert.equal(summary.trainings, 2);
  assert.equal(summary.notExpectedTrainings, 1);
  assert.equal(summary.participationRate, 0.5);
});

test("a player who later left keeps historical participant analytics", () => {
  const formerPlayer = { ...player, archivedAt: "2026-09-20T00:00:00Z", exitDate: "2026-09-20" };
  const summary = createPlayerAnalyticsSummary(
    formerPlayer,
    [
      playerRecord("former-a", "2026-09-01", "expected", "present"),
      playerRecord("former-b", "2026-09-08", "unavailable", undefined, "work")
    ],
    "all"
  );
  assert.equal(summary.trainings, 2);
  assert.equal(summary.attended, 1);
  assert.equal(summary.notExpectedTrainings, 1);
});

test("single-training selection uses the canonical event id", () => {
  const parsed = parseAnalyticsFilters({ training: EVENT_ID });
  assert.equal(parsed.trainingId, EVENT_ID);
  assert.equal(parseAnalyticsFilters({ training: "participant-id" }).trainingId, undefined);

  const exactIds = new Set([EVENT_ID]);
  const summary = createPlayerAnalyticsSummary(
    player,
    [attendanceRow("present", 0), { ...attendanceRow("present", 1), eventId: OTHER_EVENT_ID, event: trainingEvent(OTHER_EVENT_ID, "2026-09-29", "18:00", "Training B") }],
    "all",
    undefined,
    7,
    1,
    undefined,
    undefined,
    exactIds
  );
  assert.equal(summary.records.length, 1);
  assert.equal(summary.records[0].eventId, EVENT_ID);
});

test("last 5 and last 10 use canonical training timestamps", () => {
  const events = Array.from({ length: 12 }, (_, index) => trainingEvent(
    `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
    `2026-09-${String(index + 1).padStart(2, "0")}`,
    "18:00",
    `Training ${index + 1}`
  ));
  const now = new Date("2026-10-01T12:00:00Z");
  assert.deepEqual(filterEventsByPeriod(events, "last5", now).map((item) => item.date), ["2026-09-12", "2026-09-11", "2026-09-10", "2026-09-09", "2026-09-08"]);
  assert.equal(filterEventsByPeriod(events, "last10", now).length, 10);
});

test("30 day, 90 day, season and custom periods use training dates", () => {
  const events = [
    trainingEvent("77777777-7777-4777-8777-777777777777", "2026-10-01", "10:00", "Today"),
    trainingEvent("88888888-8888-4888-8888-888888888888", "2026-09-02", "18:00", "30-day edge"),
    trainingEvent("99999999-9999-4999-8999-999999999999", "2026-09-01", "18:00", "Outside 30"),
    trainingEvent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "2026-07-01", "18:00", "Season"),
    trainingEvent("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "2026-06-30", "18:00", "Previous season")
  ];
  const now = new Date("2026-10-01T18:00:00Z");
  assert.deepEqual(filterEventsByPeriod(events, "30d", now).map((item) => item.label), ["Today", "30-day edge"]);
  assert.deepEqual(filterEventsByPeriod(events, "90d", now).map((item) => item.label), ["Today", "30-day edge", "Outside 30"]);
  assert.deepEqual(filterEventsByPeriod(events, "season", now, 7, 1).map((item) => item.label), ["Today", "30-day edge", "Outside 30", "Season"]);
  assert.deepEqual(filterEventsByPeriod(events, "custom", now, 7, 1, "01.09.2026", "02.09.2026").map((item) => item.label), ["30-day edge", "Outside 30"]);
});

test("review averages use saved values without changing the training population", () => {
  const review = {
    id: "66666666-6666-4666-8666-666666666666",
    user_id: USER_ID,
    squad_id: SQUAD_ID,
    event_id: EVENT_ID,
    overall_quality: 4,
    intensity: 3,
    player_response: 5,
    objective_outcome: "achieved"
  };
  const analytics = createTeamAnalytics(squad(), [event], [], [review], [], [], [], [], filters(), { seasonStartMonth: 7, seasonStartDay: 1 });
  assert.equal(analytics.trainingSessions, 1);
  assert.equal(analytics.reviewedSessions, 1);
  assert.equal(analytics.averageSessionQuality, 4);
  assert.equal(analytics.averageSessionIntensity, 3);
  assert.equal(analytics.averagePlayerResponse, 5);
});

function attendanceRows(status, count, offset = 0) {
  return Array.from({ length: count }, (_, index) => attendanceRow(status, offset + index));
}

function attendanceRow(finalStatus, index) {
  return {
    id: `attendance-${index}`,
    userId: USER_ID,
    eventId: EVENT_ID,
    playerId: index === 0 ? player.id : `player-${index}`,
    plannedStatus: "expected",
    finalStatus,
    latePenaltyApplied: true,
    sensitiveNote: false,
    event,
    createdAt: "2026-09-30T18:00:00Z",
    updatedAt: "2026-09-30T18:00:00Z"
  };
}

function playerRecord(id, date, plannedStatus, finalStatus, plannedReason) {
  const recordEvent = trainingEvent(`${id}-1111-4111-8111-111111111111`.slice(0, 36), date, "18:00", id);
  return {
    id: `attendance-${id}`,
    userId: USER_ID,
    eventId: recordEvent.id,
    playerId: player.id,
    plannedStatus,
    plannedReason,
    finalStatus,
    latePenaltyApplied: true,
    sensitiveNote: false,
    event: recordEvent,
    createdAt: `${date}T18:00:00Z`,
    updatedAt: `${date}T18:00:00Z`
  };
}

function playerSummary(records) {
  return createPlayerAnalyticsSummary(player, records, "all");
}

function trainingEvent(id, date, startTime, label) {
  return {
    id,
    userId: USER_ID,
    squadId: SQUAD_ID,
    isSeriesException: false,
    date,
    startTime,
    label,
    participantSourceMode: "current_squad_sync",
    status: "completed",
    createdAt: `${date}T00:00:00Z`,
    updatedAt: `${date}T00:00:00Z`
  };
}

function squad() {
  return {
    id: SQUAD_ID,
    userId: USER_ID,
    name: "Analytics Test Team",
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  };
}

function filters() {
  return {
    period: "all",
    section: "overview",
    playerType: "all",
    ratedOnly: false,
    sort: "name",
    direction: "asc"
  };
}
