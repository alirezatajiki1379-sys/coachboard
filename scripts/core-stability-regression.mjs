import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as training from "../lib/trainings/utils.ts";
import * as attendance from "../lib/squad/attendance-utils.ts";
import { getTrainingSessionReview } from "../lib/squad/session-review.ts";

const now = { date: "2026-09-19", time: "15:00:00" };
const require = createRequire(import.meta.url);

// Execute the real actions against an in-memory query adapter, never Production.
export function loadModule(filename, mocks) {
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports
  );
  return loaded.exports;
}

function fakeDb(initial = {}) {
  const tables = structuredClone(initial);
  const calls = [];
  const db = {
    tables, calls, fail: null, beforeUpdate: null,
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from(table) {
      const filters = [];
      let mode = "select", payload, conflict, single = false;
      const query = {
        select() { return query; },
        update(value) { mode = "update"; payload = value; return query; },
        upsert(value, options) { mode = "upsert"; payload = value; conflict = options.onConflict.split(","); return query; },
        delete() { mode = "delete"; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        neq(key, value) { filters.push((row) => row[key] !== value); return query; },
        is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        lte(key, value) { filters.push((row) => row[key] <= value); return query; },
        gte(key, value) { filters.push((row) => row[key] >= value); return query; },
        order() { return query; },
        or(expression) {
          assert.equal(expression, "planned_status_source.is.null,planned_status_source.neq.manual");
          filters.push((row) => row.planned_status_source !== "manual");
          return query;
        },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push({ table, mode, payload });
            if (db.fail?.(table, mode)) return { data: null, error: { message: "Simulated database failure" } };
            if (mode === "update") db.beforeUpdate?.(table, payload, tables);
            const rows = tables[table] ?? (tables[table] = []);
            let result = rows.filter((row) => filters.every((filter) => filter(row)));
            if (mode === "update") result.forEach((row) => Object.assign(row, payload));
            if (mode === "upsert") {
              result = (Array.isArray(payload) ? payload : [payload]).map((value) => {
                let row = rows.find((row) => conflict.every((key) => row[key] === value[key]));
                if (!row) { row = { id: `new-${rows.length}`, created_at: "2026-09-19", updated_at: "2026-09-19" }; rows.push(row); }
                Object.assign(row, value);
                return row;
              });
            }
            if (mode === "delete") tables[table] = rows.filter((row) => !result.includes(row));
            return { data: structuredClone(single ? result[0] ?? null : result), error: null };
          }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  return db;
}

function actionMocks(db) {
  return {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(path) { throw new Error(`Redirect:${path}`); } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/squad/attendance-utils": attendance,
    "@/lib/trainings/utils": training,
    "@/lib/squad/squads": {},
    "@/lib/squad/participant-sync": {},
    "@/lib/squad/availability": {}
  };
}

function event(id, date, startTime, status = "prepared", deletedAt) {
  return { id, date, startTime, status, deletedAt, attendance: [] };
}

test("Past and Upcoming partition dates/times; workflows overlap and Trash stays separate", () => {
  const events = [
    event("yesterday", "2026-09-18", "18:00"), event("morning", now.date, "10:00"),
    event("tonight", now.date, "20:00"), event("tomorrow", "2026-09-20", "10:00"),
    event("completed", "2026-09-17", "18:00", "completed"), event("ratings", "2026-09-17", "18:00", "rating_open"),
    event("trash", "2026-09-17", "18:00", "completed", "2026-09-18"), event("boundary", now.date, "15:00")
  ];
  const ids = (filter) => training.filterTrainings(events, filter, now).map((item) => item.id);
  assert.deepEqual(ids("past"), ["yesterday", "morning", "completed", "ratings"]);
  assert.deepEqual(ids("upcoming"), ["tonight", "tomorrow", "boundary"]);
  assert.deepEqual(ids("completed"), ["completed"]);
  assert.deepEqual(ids("rating_open"), ["ratings"]);
  assert.deepEqual(ids("trash"), ["trash"]);
  assert.equal(ids("all").length, ids("past").length + ids("upcoming").length);
  assert.deepEqual(training.filterTrainings([], "past", now), []);
  assert.equal(training.parseTrainingFilter(["past"]), "past");
  assert.equal(training.parseTrainingFilter("Vergangen"), "all");
});

test("Berlin time works at midnight and across daylight-saving seasons", () => {
  assert.deepEqual(training.trainingNowParts("Europe/Berlin", new Date("2026-09-18T22:15:00Z")), { date: "2026-09-19", time: "00:15:00" });
  assert.equal(training.trainingNowParts("Europe/Berlin", new Date("2026-01-19T14:00:00Z")).time, "15:00:00");
  assert.equal(training.trainingNowParts("Europe/Berlin", new Date("2026-07-19T13:00:00Z")).time, "15:00:00");
});

function attendanceDb(finalStatus = "present", status = "prepared") {
  return fakeDb({
    squad_training_events: [{ id: "event", user_id: "owner", squad_id: "team", status, deleted_at: null, completed_at: status === "completed" ? "2026-09-18" : null }],
    squad_players: [{ id: "player", user_id: "owner", squad_id: "team" }],
    squad_attendance_records: [{ id: "record", user_id: "owner", event_id: "event", player_id: "player", final_status: finalStatus, planned_status: "expected", planned_reason: null, overall_rating: 4, updated_at: "2026-09-19" }]
  });
}

function ratingForm(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ eventId: "event", attendanceId: "record", overallRating: "3", ...overrides })) data.set(key, value);
  return data;
}

for (const method of ["updateAttendanceRating", "updateAttendanceRatingInline"]) {
  test(`${method}: saved value, null, strict 1-5, absence and ownership protection`, async () => {
    const db = attendanceDb();
    const actions = loadModule("lib/squad/attendance-actions.ts", actionMocks(db));
    for (const value of ["1", "2", "3", "4", "5", ""]) {
      assert.equal((await actions[method](ratingForm({ overallRating: value }))).ok, true);
      assert.equal(db.tables.squad_attendance_records[0].overall_rating, value ? Number(value) : null);
    }
    for (const value of ["0", "6", "3.5", "3oops", "NaN"]) assert.equal((await actions[method](ratingForm({ overallRating: value }))).ok, false);
    for (const status of ["absent", "V", "K", "E", "P", "S", "U", null]) {
      db.tables.squad_attendance_records[0].final_status = status;
      assert.equal((await actions[method](ratingForm())).ok, false);
      assert.equal(db.tables.squad_attendance_records[0].overall_rating, null);
    }
    db.tables.squad_attendance_records[0].final_status = "Z";
    assert.equal((await actions[method](ratingForm())).ok, true);
    db.tables.squad_training_events[0].user_id = "someone-else";
    assert.equal((await actions[method](ratingForm())).ok, false);
    assert.equal(db.tables.squad_attendance_records.length, 1);
  });
}

test("check-in clears every rating on absence, keeps plans, and does not regress workflow", async () => {
  const db = attendanceDb("present", "rating_open");
  const actions = loadModule("lib/squad/attendance-actions.ts", actionMocks(db));
  for (const reason of ["unexcused", "excused", "sick", "injured", "school", "work", "holiday", "private", "other"]) {
    const result = await actions.updateFinalAttendanceInline(ratingForm({ finalStatus: "absent", actualAbsenceReason: reason }));
    assert.equal(result.ok, true);
    const row = db.tables.squad_attendance_records[0];
    assert.equal(row.actual_absence_reason, reason);
    for (const key of ["overall_rating", "rating_technique", "rating_game_understanding", "rating_intensity", "rating_behavior", "rating_auto_suggestion"]) assert.equal(row[key], null);
    assert.equal(row.planned_status, "expected");
    assert.equal(db.tables.squad_training_events[0].status, "rating_open");
  }
  db.tables.squad_training_events[0].status = "completed";
  db.tables.squad_training_events[0].completed_at = "2026-09-18";
  assert.equal((await actions.updateFinalAttendanceInline(ratingForm({ finalStatus: "Z" }))).ok, true);
  assert.equal((await actions.updateAttendanceRating(ratingForm())).ok, true);
  assert.equal(db.tables.squad_training_events[0].status, "completed");
  assert.equal(db.tables.squad_training_events[0].completed_at, "2026-09-18");
});

test("rating write guards attendance again at update time", async () => {
  const db = attendanceDb();
  db.beforeUpdate = (table, _payload, tables) => {
    if (table === "squad_attendance_records") tables[table][0].final_status = "absent";
  };
  const actions = loadModule("lib/squad/attendance-actions.ts", actionMocks(db));
  assert.equal((await actions.updateAttendanceRatingInline(ratingForm())).ok, false);
  assert.equal(db.tables.squad_attendance_records[0].overall_rating, 4);
});

test("workflow-status failure reports a warning without pretending a saved rating failed", async () => {
  const db = attendanceDb();
  db.fail = (table, mode) => table === "squad_training_events" && mode === "update";
  const actions = loadModule("lib/squad/attendance-actions.ts", actionMocks(db));
  const result = await actions.updateAttendanceRatingInline(ratingForm());
  assert.equal(result.ok, true);
  assert.ok(result.warning);
  assert.equal(result.overallRating, 3);
  assert.equal(db.tables.squad_attendance_records[0].overall_rating, 3);
});

test("absent legacy ratings never become a UI default; late counts once in present total", () => {
  assert.equal(attendance.overallRatingInitialValue({ plannedStatus: "expected", finalStatus: "absent", overallRating: 4 }), undefined);
  const summary = attendance.getFinalAttendanceSummary([{ finalStatus: "present" }, { finalStatus: "Z" }, { finalStatus: "absent" }]);
  assert.equal(summary.present, 2);
  assert.equal(summary.late, 1);
  assert.equal(summary.absent, 1);
});

test("availability sync preserves historical/manual/final rows and batches future updates", async () => {
  const rows = [
    ["past-day", "2026-09-18", "18:00", "prepared", "default", null],
    ["past-today", now.date, "10:00", "prepared", "default", null],
    ["future-a", now.date, "20:00", "prepared", "default", null],
    ["future-b", "2026-09-20", "18:00", "prepared", "default", null],
    ["manual", now.date, "20:00", "prepared", "manual", null],
    ["recorded", now.date, "20:00", "prepared", "default", "present"],
    ["completed", "2026-09-20", "18:00", "completed", "default", null],
    ["in-progress", "2026-09-20", "18:00", "in_progress", "default", null],
    ["trash", "2026-09-20", "18:00", "prepared", "default", null]
  ].map(([id, date, start_time, status, source, final]) => ({
    id, user_id: "owner", player_id: "player", planned_status: "expected", planned_status_source: source, final_status: final,
    squad_training_events: { id, date, start_time, status, deleted_at: id === "trash" ? "2026-09-19" : null }
  }));
  const db = fakeDb({ squad_attendance_records: rows,
    player_availability_periods: [{ player_id: "player", user_id: "owner", reason: "school", starts_on: now.date, ends_on: "2026-09-21", status: "active", updated_at: "2026-09-19", note: "Fictional school trip" }]
  });
  const availability = loadModule("lib/squad/availability.ts", { "@/lib/trainings/utils": { ...training, trainingNowParts: () => now } });
  await availability.syncPlayerAvailabilityToFutureTrainings(db, "owner", "player");
  assert.deepEqual(db.tables.squad_attendance_records.filter((row) => row.planned_status === "unavailable").map((row) => row.id), ["future-a", "future-b"]);
  assert.equal(db.tables.squad_attendance_records.length, rows.length);
  assert.equal(db.calls.filter((call) => call.table === "player_availability_periods").length, 1);
  assert.equal(db.calls.filter((call) => call.table === "player_medical_periods").length, 1);
  assert.equal(db.calls.filter((call) => call.mode === "update").length, 1);
  db.beforeUpdate = (_table, _payload, tables) => {
    tables.squad_attendance_records.find((row) => row.id === "future-a").planned_status_source = "manual";
  };
  db.tables.player_availability_periods = [];
  await availability.syncPlayerAvailabilityToFutureTrainings(db, "owner", "player");
  assert.equal(db.tables.squad_attendance_records.find((row) => row.id === "future-a").planned_status, "unavailable");
  assert.equal(db.tables.squad_attendance_records.find((row) => row.id === "future-b").planned_status, "expected");
});

test("Session Review saves/loads player_response and long text; retries do not duplicate", async () => {
  const db = attendanceDb();
  const actions = loadModule("lib/squad/session-review-actions.ts", actionMocks(db));
  const note = "Fictional detailed coach feedback. ".repeat(500);
  const form = ratingForm({ objectiveOutcome: "achieved", overallQuality: "4", intensity: "3", playerResponse: "5", workedWell: note });
  for (const invalid of ["3.5", "2invalid", "6", "0"]) {
    form.set("playerResponse", invalid);
    assert.ok((await actions.saveTrainingSessionReview({}, form)).fieldErrors.playerResponse);
  }
  form.set("playerResponse", "5");
  db.fail = (table, mode) => table === "training_session_reviews" && mode === "upsert";
  assert.ok((await actions.saveTrainingSessionReview({}, form)).error);
  assert.equal(form.get("workedWell"), note);
  db.fail = null;
  assert.ok((await actions.saveTrainingSessionReview({}, form)).success);
  assert.ok((await actions.saveTrainingSessionReview({}, form)).success);
  assert.equal(db.tables.training_session_reviews.length, 1);
  const review = await getTrainingSessionReview(db, "owner", "event");
  assert.equal(review.playerResponse, 5);
  assert.equal(review.workedWell, note.trim());
  db.tables.training_session_reviews[0].player_response = null;
  assert.equal((await getTrainingSessionReview(db, "owner", "event")).playerResponse, undefined);
  assert.equal(await getTrainingSessionReview(db, "another-owner", "event"), null);
});

test("editing a roster/trial player never auto-syncs an earlier training today", async () => {
  const db = attendanceDb();
  Object.assign(db.tables.squad_training_events[0], {
    date: now.date, start_time: "10:00", participant_source_mode: "current_squad_sync", participants_locked_at: null
  });
  const mocks = actionMocks(db);
  mocks["@/lib/trainings/utils"] = { ...training, trainingNowParts: () => now };
  mocks["@/lib/squad/participant-sync"] = { currentEligibleSquadPlayerIds() { assert.fail("Past participant snapshot must not be rebuilt"); } };
  const actions = loadModule("lib/squad/attendance-actions.ts", mocks);
  await actions.syncFutureAutoSyncTrainingsForPlayer(db, "owner", "player");
  assert.equal(db.calls.some((call) => call.mode !== "select"), false);
});
