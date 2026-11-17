import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as validation from "../lib/scouting/validation.ts";
import * as workflow from "../lib/scouting/workflow.ts";
import { scoutingCopy } from "../lib/scouting/copy.ts";

const form = (values) => { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, String(value)); return result; };
export function load(filename, mocks) {
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  const require = createRequire(import.meta.url);
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })((id) => id in mocks ? mocks[id] : require(id), loaded, loaded.exports);
  return loaded.exports;
}
export function fakeDb() {
  const tables = { scouting_players: [], scouting_observations: [], scouting_history: [], squad_players: [] };
  const db = { tables, fail: null, auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from(table) {
    const predicates = [], orders = [];
    let payload, mode = "select", single = false, limit = Infinity;
    const q = {
      select() { return q; }, insert(p) { mode = "insert"; payload = p; return q; }, update(p) { mode = "update"; payload = p; return q; },
      upsert(p) { mode = "upsert"; payload = p; return q; }, delete() { mode = "delete"; return q; },
      in(k, values) { predicates.push((r) => values.includes(r[k])); return q; },
      eq(k, v) { predicates.push((r) => r[k] === v); return q; }, neq(k, v) { predicates.push((r) => r[k] !== v); return q; },
      is(k, v) { predicates.push((r) => (r[k] ?? null) === v); return q; },
      limit(n) { limit = n; return q; }, order(k, options) { orders.push([k, options?.ascending !== false]); return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (db.fail === table) return { data: null, error: { message: "Simulated database failure" } };
        const rows = tables[table] ?? (tables[table] = []);
        let result = rows.filter((r) => predicates.every((p) => p(r)));
        if (mode === "insert") { const row = { id: `${table}-${rows.length}`, created_at: `2026-11-17T12:00:0${rows.length}Z`, ...payload }; rows.push(row); result = [row]; }
        if (mode === "update") result.forEach((r) => Object.assign(r, payload));
        if (mode === "upsert") {
          result = rows.some((r) => r.player_id === payload.player_id && r.target_id === payload.target_id) ? [] : [{ ...payload }];
          rows.push(...result);
        }
        if (mode === "delete") tables[table] = rows.filter((r) => !result.includes(r));
        result.sort((a, b) => { for (const [key, ascending] of orders) { const d = String(a[key]).localeCompare(String(b[key])); if (d) return ascending ? d : -d; } return 0; });
        result = result.slice(0, limit);
        return { data: structuredClone(single ? result[0] ?? null : result), error: null };
      }).then(resolve, reject); }
    };
    return q;
  } };
  return db;
}
export function actions(db) {
  return load("lib/scouting/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(url) { throw Object.assign(new Error(url), { digest: "NEXT_REDIRECT" }); } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/scouting/db": { asScoutingDb: (v) => v },
    "@/lib/squad/attendance-actions": { syncFutureAutoSyncTrainingsForPlayer: async () => {} },
    "@/lib/scouting/validation": validation,
    "@/lib/scouting/workflow": workflow
  });
}

test("quick capture needs only an identity; year and shirt remain optional and editable", () => {
  const p = validation.playerPayload(form({ firstName: "Nr. 7", shirtNumber: "07", birthYear: "2012" }));
  assert.equal(p.shirt_number, "07"); assert.equal(p.birth_year, 2012); assert.equal(p.date_of_birth, null);
  assert.equal(p.status, "identified"); assert.equal(p.notes, null);
  assert.throws(() => validation.playerPayload(form({ firstName: "Test", birthYear: 2012, birthDate: "2011-02-03" })), /birth year/);
});

test("observations retain all text, category ratings and independent historical decisions", () => {
  const p = validation.observationPayload(form({ observedOn: "2026-11-17", summary: "Good first action", situations: "23. Decision under pressure\n\n51. Second situation", strengths: "Orientation", development: "Context matters", openQuestions: "Stronger opponent?", nextFocus: "Back to goal", recommendation: "shortlist", nextAction: "Watch video", followUpDate: "2026-11-24", playerTeam: "Club U15", opponent: "Visitors", competition: "League", ratingTechnical: 4 }));
  assert.equal(p.recommendation, "shortlist"); assert.equal(p.open_questions, "Stronger opponent?"); assert.equal(p.next_focus, "Back to goal");
  assert.equal(p.rating_technical, 4); assert.equal(p.rating_mental, null); assert.match(p.situations, /\n\n51/);
  assert.equal(p.follow_up_date, "2026-11-24"); assert.equal(p.opponent, "Visitors");
  assert.equal("status" in p, false); assert.equal("overall_rating" in p, false);
  assert.throws(() => validation.observationPayload(form({ observedOn: "2026-02-30", summary: "x" })), /date/);
  assert.throws(() => validation.observationPayload(form({ observedOn: "2026-11-17", summary: "x", ratingPhysical: "2.5" })), /whole/);
  assert.throws(() => validation.observationPayload(form({ observedOn: "2026-11-17", summary: "x", recommendation: "talent_score" })), /recommendation/);
  assert.throws(() => validation.observationPayload(form({ observedOn: "2026-11-17", summary: "x", situations: "x".repeat(12001) })), /too long/);
});

test("duplicate warning respects normalized names, club, year and contradictory birthdays", () => {
  const a = { first_name: "  TEST  Name ", last_name: "Müller", date_of_birth: null, birth_year: 2012, current_club: "Club" };
  assert.equal(workflow.possibleScoutingDuplicate(a, { ...a, first_name: "test name", birth_year: null, date_of_birth: "2012-02-01" }), true);
  assert.equal(workflow.possibleScoutingDuplicate(a, { ...a, birth_year: 2013 }), false);
  assert.equal(workflow.possibleScoutingDuplicate({ ...a, birth_year: null }, { ...a, birth_year: null, current_club: " club " }), true);
});

test("follow-ups include latest observation and retain independent player action; archive excluded", () => {
  const p = { status: "monitoring", next_action: "observe_again", next_action_date: "2026-12-01" };
  assert.equal(workflow.scoutingFollowUpDate(p, { next_action: "Video", follow_up_date: "2026-11-20" }), "2026-11-20");
  assert.equal(workflow.scoutingFollowUpDate(p, { next_action: null, follow_up_date: null }), "2026-12-01");
  assert.equal(workflow.scoutingFollowUpDate(p, { next_action: null, follow_up_date: "2026-11-20" }), "2026-11-20");
  assert.equal(workflow.scoutingFollowUpDate({ ...p, status: "added_to_squad" }, { next_action: "Video", follow_up_date: "2026-11-20" }), null);
});

test("real create/edit actions: ownership, duplicate review, history, observations and errors", async () => {
  const db = fakeDb(); const a = actions(db);
  await assert.rejects(a.createScoutingPlayer({}, form({ firstName: "Test", currentClub: "Club" })), /\/scouting\/players\//);
  const id = db.tables.scouting_players[0].id;
  assert.equal(db.tables.scouting_history[0].event_type, "created");
  const duplicate = await a.createScoutingPlayer({}, form({ firstName: "Test", currentClub: "Club" }));
  assert.equal(duplicate.duplicates[0].id, id); assert.equal(db.tables.scouting_players.length, 1);
  const first = { observedOn: "2026-11-10", summary: "First", recommendation: "monitoring", nextFocus: "Pressure" };
  await assert.rejects(a.createScoutingObservation(id, {}, form(first)), /tab=observations/);
  await assert.rejects(a.createScoutingObservation(id, {}, form({ ...first, observedOn: "2026-11-17", summary: "Second", recommendation: "shortlist" })), /tab=observations/);
  const oldObservation = structuredClone(db.tables.scouting_observations[0]);
  await assert.rejects(a.updateScoutingPlayer(id, {}, form({ firstName: "Test", status: "shortlist" })), /\/scouting\/players\//);
  assert.deepEqual(db.tables.scouting_observations[0], oldObservation);
  assert.deepEqual(workflow.readPipelineHistory(db.tables.scouting_history.at(-1).detail), { from: "identified", to: "shortlist", note: "" });
  await assert.rejects(a.updateScoutingObservation(id, oldObservation.id, {}, form({ ...first, summary: "Corrected", openQuestions: "Consistency?" })), /tab=observations/);
  assert.equal(db.tables.scouting_observations.length, 2); assert.equal(db.tables.scouting_observations[0].open_questions, "Consistency?");
  db.tables.scouting_players.push({ id: "foreign", user_id: "someone-else", first_name: "Other" });
  assert.equal((await a.createScoutingObservation("foreign", {}, form(first))).error, "Prospect not found.");
  assert.equal((await a.updateScoutingObservation(id, "not-owned", {}, form(first))).error, "Observation not found.");
  db.fail = "scouting_observations";
  assert.match((await a.createScoutingObservation(id, {}, form(first))).error, /database failure/);
  assert.equal(db.tables.scouting_observations.length, 2);
});

test("profile reload and follow-up query use dated history and owner scopes", async () => {
  const db = fakeDb();
  db.tables.scouting_players.push({ id: "p", user_id: "owner", status: "monitoring", next_action: null, next_action_date: null });
  db.tables.scouting_observations.push(
    { id: "old", user_id: "owner", player_id: "p", observed_on: "2026-11-10", created_at: "2026-11-10", next_focus: "Old", next_action: "Old task", follow_up_date: "2026-11-11" },
    { id: "new", user_id: "owner", player_id: "p", observed_on: "2026-11-17", created_at: "2026-11-17", next_focus: "New", next_action: "Video", follow_up_date: "2026-11-20" },
    { id: "foreign", user_id: "other", player_id: "p", observed_on: "2026-11-18" }
  );
  const q = load("lib/scouting/queries.ts", { "@/lib/scouting/db": { asScoutingDb: (v) => v }, "@/lib/scouting/workflow": workflow });
  const detail = await q.getScoutingPlayer(db, "owner", "p");
  assert.deepEqual(detail.observations.map((r) => r.id), ["new", "old"]);
  assert.equal(detail.observations[0].next_focus, "New");
  assert.equal((await q.getScoutingListData(db, "owner")).followUpDates.p, "2026-11-20");
});

test("DE/EN have matching non-empty scouting keys; squad conversion still keeps linked history", () => {
  assert.deepEqual(Object.keys(scoutingCopy("en")).sort(), Object.keys(scoutingCopy("de")).sort());
  assert.ok(Object.values(scoutingCopy("de")).every((text) => text.trim()));
  const source = readFileSync("lib/squad/attendance-actions.ts", "utf8");
  const conversion = source.slice(source.indexOf("export async function convertTrialPlayerToSquadPlayer"), source.indexOf("export async function syncFutureAutoSyncTrainingsForPlayer"));
  assert.match(conversion, /player_type: "roster"/); assert.match(conversion, /linked_squad_player_id/); assert.match(conversion, /status: "added_to_squad"/);
  assert.doesNotMatch(conversion, /scouting_observations|\.delete\(/);
});
