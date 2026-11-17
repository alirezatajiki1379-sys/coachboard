import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./core-stability-regression.mjs";
import * as attendance from "../lib/squad/attendance-utils.ts";
import * as analytics from "../lib/squad/analytics.ts";
import { actualAbsenceReasonLabel, plannedReasonLabel } from "../lib/squad/attendance-format.ts";
import { absenceDistribution, isMissedTraining } from "../lib/squad/player-report.ts";
import { currentEligibleSquadPlayerIds } from "../lib/squad/participant-sync.ts";
import { parseWorkspaceState } from "../lib/squad/workspace.ts";

const player = { id: "player", userId: "owner", squadId: "team", firstName: "Test", lastName: "Player", playerType: "roster", secondaryPositions: [], preferredPositions: [], positionFamilies: [], onboardingWarnings: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" };
function record(id, values = {}) {
  return { id, eventId: id, playerId: player.id, userId: "owner", plannedStatus: "expected", finalStatus: "present", latePenaltyApplied: true, sensitiveNote: false, event: { id, userId: "owner", date: "2026-01-10", startTime: "18:00", status: "completed" }, ...values };
}

test("not nominated is excluded from all attendance denominators and missed-training lists", () => {
  const rows = [record("present"), record("absent", { finalStatus: "absent", actualAbsenceReason: "school" }), record("not-nominated", { finalStatus: "absent", actualAbsenceReason: "not_nominated" })];
  assert.deepEqual(analytics.calculateAttendanceMetric(rows), { count: 1, opportunities: 2, rate: 0.5 });
  assert.equal(analytics.calculateAttendanceWhenExpectedRate(rows), 0.5);
  assert.equal(analytics.calculateParticipationRate(rows), 0.5);
  const summary = analytics.createPlayerAnalyticsSummary(player, rows, "all");
  assert.equal(summary.absent, 1);
  assert.equal(summary.absentWhenExpected, 1);
  assert.equal(summary.reliabilityPenalty, 0);
  assert.equal(summary.records.length, 3, "keep historical records visible");
  assert.equal(summary.recordedTrainings, 3);
  assert.deepEqual(absenceDistribution(rows), [{ reason: "school", count: 1 }]);
  assert.equal(attendance.getFinalAttendanceSummary(rows).absent, 1);
  assert.equal(analytics.calculateAttendanceRate([rows[2]]), null);
  assert.equal(analytics.calculateParticipationRate([rows[2]]), null);
});

test("actual outcomes override non-nomination plans; participation always counts", () => {
  const planned = record("planned", { plannedStatus: "unavailable", plannedReason: "not_nominated", finalStatus: "absent" });
  assert.equal(attendance.isNotNominatedAttendance(planned), true);
  assert.equal(isMissedTraining(planned), false);
  for (const finalStatus of ["present", "Z", "left_early"]) {
    const participated = { ...planned, finalStatus };
    assert.equal(attendance.isNotNominatedAttendance(participated), false);
    assert.deepEqual(analytics.calculateAttendanceMetric([participated]), { count: 1, opportunities: 1, rate: 1 });
  }
  assert.equal(attendance.isNotNominatedAttendance({ ...planned, actualAbsenceReason: "unexcused" }), false);
  assert.equal(attendance.isNotNominatedAttendance({ ...planned, finalStatus: "U" }), false);
  assert.equal(attendance.calculateReliabilityPenalty({ ...planned, actualAbsenceReason: "not_nominated" }), 0);
  assert.equal(attendance.calculateReliabilityPenalty({ ...planned, actualAbsenceReason: "unexcused" }), -2);
  assert.equal(analytics.calculatePlannedAbsenceDistribution([planned]).other, 0);
});

test("reasons share canonical planning/check-in semantics and localized labels", () => {
  for (const [reason, en, de] of [["not_nominated", "Not nominated", "Nicht nominiert"], ["club", "Club activity", "Verein / Vereinsmaßnahme"]]) {
    assert.ok(attendance.plannedAttendanceReasonOptions.includes(reason));
    assert.equal(attendance.plannedReasonToActualAbsenceReason(reason), reason);
    assert.equal(attendance.applyAsExpectedDecision({ plannedStatus: "unavailable", plannedReason: reason }).actualAbsenceReason, reason);
    assert.equal(actualAbsenceReasonLabel(reason, "en"), en);
    assert.equal(actualAbsenceReasonLabel(reason, "de"), de);
    assert.equal(plannedReasonLabel(reason, "de"), de);
  }
});

function archiveDb() {
  const rows = [{ id: "player", user_id: "owner", squad_id: "team", player_type: "roster", archived_at: null, deleted_at: null, notes: "Keep notes", created_at: "2026-01-01" }, { id: "foreign", user_id: "other", squad_id: "team", player_type: "roster", archived_at: null, deleted_at: null }];
  return { rows, fail: false, auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from(table) {
    assert.equal(table, "squad_players");
    const filters = [];
    let patch, single = false;
    const query = {
      update(value) { patch = value; return query; },
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      is(key, value) { filters.push((row) => row[key] === value); return query; },
      single() { single = true; return query; },
      then: (resolve) => {
        const matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (this.fail || (single && matches.length !== 1)) return Promise.resolve(resolve({ data: null, error: { message: "Update failed" } }));
        if (patch) matches.forEach((row) => Object.assign(row, patch));
        return Promise.resolve(resolve({ data: single ? matches[0] : matches, error: null }));
      }
    };
    return query;
  } };
}

test("archive/reactivate updates same owned row, preserves fields and changes active eligibility", async () => {
  const db = archiveDb();
  const baseline = structuredClone(db.rows[0]);
  const synced = [];
  const actions = loadModule("lib/squad/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(path) { throw new Error(`Redirect:${path}`); } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/squad/form": {}, "@/lib/squad/squads": {}, "@/lib/squad/trials": {},
    "@/lib/squad/attendance-actions": { syncFutureAutoSyncTrainingsForPlayer: async (_, userId, playerId) => synced.push([userId, playerId]) }
  });
  const form = new FormData();
  form.set("playerId", "player");
  await assert.rejects(actions.archiveSquadPlayer(form), /Redirect:\/squad\?players=archived/);
  assert.ok(db.rows[0].archived_at);
  assert.deepEqual(await currentEligibleSquadPlayerIds(db, "owner", "2026-11-17", "team"), []);
  await assert.rejects(actions.restoreSquadPlayer(form), /Redirect:\/squad\?players=active/);
  assert.deepEqual(db.rows[0], baseline);
  assert.deepEqual(await currentEligibleSquadPlayerIds(db, "owner", "2026-11-17", "team"), ["player"]);
  assert.equal(db.rows.length, 2);
  assert.equal(synced.length, 2);
  form.set("playerId", "foreign");
  await assert.rejects(actions.archiveSquadPlayer(form), /Update failed/);
  assert.equal(db.rows[1].archived_at, null);
  assert.equal(synced.length, 2);
  form.set("playerId", "player");
  db.fail = true;
  await assert.rejects(actions.restoreSquadPlayer(form), /Update failed/);
  assert.equal(synced.length, 2);
});

test("current and legacy archive URLs select the archive rather than the active list", () => {
  assert.equal(parseWorkspaceState({ players: "archived" }).players, "archived");
  assert.equal(parseWorkspaceState({ view: "archived" }).players, "archived");
  assert.equal(parseWorkspaceState({ players: "active" }).players, "active");
  assert.equal(parseWorkspaceState({ players: "active" }).hasExplicitState, true);
});
