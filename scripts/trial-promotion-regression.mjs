import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./core-stability-regression.mjs";
import * as training from "../lib/trainings/utils.ts";
import * as attendance from "../lib/squad/attendance-utils.ts";
import { currentEligibleSquadPlayerIds } from "../lib/squad/participant-sync.ts";

function fixture() {
  const tables = {
    squad_players: [{ id: "player", user_id: "owner", squad_id: "team", player_type: "trial", converted_at: null, archived_at: null, deleted_at: null, trial_start_date: "2026-01-01", trial_end_date: "2026-02-01", trial_duration_mode: "end_date", notes: "Trial notes" }],
    scouting_players: [{ id: "scout", user_id: "owner", linked_squad_player_id: "player", status: "trial" }],
    scouting_history: [], squad_training_events: [],
    squad_attendance_records: [{ player_id: "player", final_status: "present", overall_rating: 4, coach_note: "Trial feedback" }]
  };
  const calls = [];
  const paths = [];
  const db = {
    tables, calls, fail: undefined,
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from(table) {
      let payload, mode = "select", single = false;
      const filters = [];
      const query = {
        select() { return query; },
        update(value) { payload = value; mode = "update"; return query; },
        insert(value) { payload = value; mode = "insert"; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        neq(key, value) { filters.push((row) => row[key] !== value); return query; },
        is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        gte(key, value) { filters.push((row) => row[key] >= value); return query; },
        maybeSingle() { single = true; return query; },
        then(resolve) {
          calls.push({ table, mode, payload });
          if (db.fail === table) return Promise.resolve(resolve({ data: null, error: { message: "Simulated failure" } }));
          if (mode === "insert") tables[table].push(structuredClone(payload));
          const result = tables[table].filter((row) => filters.every((filter) => filter(row)));
          if (mode === "update") result.forEach((row) => Object.assign(row, payload));
          return Promise.resolve(resolve({ data: single ? result[0] ?? null : result, error: null }));
        }
      };
      return query;
    }
  };
  const actions = loadModule("lib/squad/attendance-actions.ts", {
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "next/navigation": { redirect: (path) => { throw new Error(`Redirect:${path}`); } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/squad/attendance-utils": attendance,
    "@/lib/trainings/utils": training,
    "@/lib/squad/squads": {}, "@/lib/squad/participant-sync": {}, "@/lib/squad/availability": {},
    "@/lib/scouting/db": { asScoutingDb: (client) => client }, "@/lib/drills/graphics": {}
  });
  const form = new FormData();
  form.set("playerId", "player");
  return { db, tables, paths, promote: () => actions.convertTrialPlayerToSquadPlayer({ ok: false }, form) };
}

test("promotion preserves identity, trial fields, ratings and history, and enables normal roster eligibility", async () => {
  const { db, tables, paths, promote } = fixture();
  const playerBefore = structuredClone(tables.squad_players[0]);
  const attendanceBefore = structuredClone(tables.squad_attendance_records);
  assert.deepEqual(await currentEligibleSquadPlayerIds(db, "owner", "2026-11-17", "team"), []);
  assert.deepEqual(await promote(), { ok: true, warning: false });
  const after = tables.squad_players[0];
  assert.ok(after.converted_at);
  assert.deepEqual(after, { ...playerBefore, player_type: "roster", converted_at: after.converted_at });
  assert.deepEqual(tables.squad_attendance_records, attendanceBefore);
  assert.equal(tables.squad_players.length, 1);
  assert.deepEqual(await currentEligibleSquadPlayerIds(db, "owner", "2026-11-17", "team"), ["player"]);
  assert.ok(paths.includes("/squad/players/player"));
  assert.ok(paths.includes("/squad/planner"));
  assert.ok(paths.includes("/trainings"));
  assert.ok(!paths.includes("/trainings/"), "profile action needs no training ID");
  assert.ok(db.calls.some((call) => call.table === "squad_training_events"));
});

test("repeated and concurrent submissions preserve conversion time and create one scouting history entry", async () => {
  const { tables, promote } = fixture();
  const results = await Promise.all([promote(), promote()]);
  assert.ok(results.every((result) => result.ok));
  const convertedAt = tables.squad_players[0].converted_at;
  assert.equal((await promote()).ok, true);
  assert.equal(tables.squad_players[0].converted_at, convertedAt);
  assert.equal(tables.scouting_history.length, 1);
});

for (const change of [{ user_id: "other" }, { archived_at: "2026-01-01" }, { deleted_at: "2026-01-01" }, { player_type: "roster" }]) {
  test(`reject ineligible player ${JSON.stringify(change)} without side effects`, async () => {
    const { tables, promote } = fixture();
    Object.assign(tables.squad_players[0], change);
    const before = structuredClone(tables);
    assert.deepEqual(await promote(), { ok: false, error: "invalid_player" });
    assert.deepEqual(tables, before);
  });
}

test("database failure retains original player and returns a recoverable error", async () => {
  const { db, tables, promote } = fixture();
  db.fail = "squad_players";
  const before = structuredClone(tables);
  assert.deepEqual(await promote(), { ok: false, error: "save_failed" });
  assert.deepEqual(tables, before);
});

for (const failedTable of ["scouting_players", "squad_training_events"]) {
  test(`${failedTable} integration failure does not hide a successful promotion`, async () => {
    const { db, tables, promote } = fixture();
    db.fail = failedTable;
    assert.deepEqual(await promote(), { ok: true, warning: true });
    assert.equal(tables.squad_players[0].player_type, "roster");
  });
}
