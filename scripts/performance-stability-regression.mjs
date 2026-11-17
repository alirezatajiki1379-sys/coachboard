import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as analytics from "../lib/squad/analytics.ts";
import * as attendanceMappers from "../lib/squad/attendance-mappers.ts";
import * as mappers from "../lib/squad/mappers.ts";
import * as attendanceUtils from "../lib/squad/attendance-utils.ts";
import * as attention from "../lib/squad/attention.ts";

const baseRef = process.env.COACHBOARD_PERF_BASE_REF;
const json = (value) => JSON.parse(JSON.stringify(value));
function load(file, mocks, baseline = false) {
  const input = baseline ? execFileSync("git", ["show", `${baseRef}:${file}`], { encoding: "utf8" }) : readFileSync(file, "utf8");
  const source = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} }, require = createRequire(import.meta.url);
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })((id) => id in mocks ? mocks[id] : require(id), loaded, loaded.exports);
  return loaded.exports;
}

const squad = { id: "team", userId: "owner", name: "Fictional team" };
const player = { id: "active", user_id: "owner", squad_id: "team", first_name: "Fictional", last_name: "Player", player_type: "roster", position: "CM", archived_at: null, deleted_at: null, created_at: "2020-01-01", updated_at: "2020-01-01" };
const event = { id: "event", user_id: "owner", squad_id: "team", date: "2020-01-01", start_time: "18:00:00", end_time: "19:00:00", status: "completed", archived_at: null, deleted_at: null };
const record = { id: "record", user_id: "owner", event_id: "event", player_id: "active", planned_status: "expected", final_status: "present", overall_rating: 4 };
function fixture(historical = true) {
  return {
    profiles: [{ id: "owner", season_start_month: 7, season_start_day: 1 }],
    squad_players: [player, ...(historical ? [{ ...player, id: "archived", archived_at: "2021-01-01" }] : []), { ...player, id: "foreign", user_id: "other" }],
    squad_training_events: [event, { ...event, id: "deleted-event", deleted_at: "2021-01-01" }, { ...event, id: "other-team", squad_id: "other-team" }],
    squad_attendance_records: [record, ...(historical ? [{ ...record, id: "r2", player_id: "archived", final_status: "Z", overall_rating: null }] : []), { ...record, id: "foreign", user_id: "other", player_id: "foreign" }],
    training_session_reviews: [{ id: "review", user_id: "owner", event_id: "event", overall_quality: 4, intensity: 3, player_response: 5, objective_outcome: "achieved" }],
    training_session_drill_instances: [
      { id: "instance", user_id: "owner", event_id: "event", source_drill_id: "drill", title: "Fictional drill", status: "active", snapshot_json: { canvas: "x".repeat(50000) }, override_json: { instructions: "y".repeat(5000) } },
      { id: "removed", user_id: "owner", event_id: "event", source_drill_id: "removed", title: "Removed", status: "removed" }
    ],
    training_session_drill_reviews: [{ id: "drill-review", user_id: "owner", session_review_id: "review", session_drill_instance_id: "instance", effectiveness_rating: 4, feedback_status: "worked_well" }]
  };
}

// Emulates read filters/projection/pagination and records query shapes, not DB latency.
function database(tables) {
  const queries = [];
  return { queries, from(table) {
    const filters = [], predicates = [];
    let columns = "*", single = false, start = 0, end = Infinity;
    const value = (row, key) => key.split(".").reduce((v, part) => v?.[part], row);
    const q = {
      select(c) { columns = c; return q; },
      eq(k, v) { filters.push([k, "eq", v]); predicates.push(r => value(r, k) === v); return q; },
      neq(k, v) { filters.push([k, "neq", v]); predicates.push(r => value(r, k) !== v); return q; },
      is(k, v) { filters.push([k, "is", v]); predicates.push(r => (value(r, k) ?? null) === v); return q; },
      in(k, values) { filters.push([k, "in", values]); predicates.push(r => values.includes(value(r, k))); return q; },
      order() { return q; }, range(a, b) { start = a; end = b + 1; return q; }, maybeSingle() { single = true; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        let rows = (tables[table] ?? []).filter(r => predicates.every(p => p(r))).slice(start, end);
        if (!columns.includes("*")) rows = rows.map(r => Object.fromEntries(columns.split(",").map(k => [k.trim(), r[k.trim()]])));
        queries.push({ table, columns, filters, bytes: Buffer.byteLength(JSON.stringify(rows)) });
        return { data: structuredClone(single ? rows[0] ?? null : rows), error: null };
      }).then(resolve, reject); }
    };
    return q;
  } };
}
function analyticsModule(baseline = false) {
  return load("lib/squad/analytics-queries.ts", {
    "@/lib/squad/analytics": analytics,
    "@/lib/squad/attendance-mappers": attendanceMappers,
    "@/lib/squad/mappers": mappers,
    "@/lib/squad/attendance-utils": attendanceUtils,
    "@/lib/squad/squads": { ensureActiveSquad: async (_db, userId) => { assert.equal(userId, "owner"); return squad; } }
  }, baseline);
}

test("analytics preserves active/archive/trial history, excludes foreign/deleted events, and projects only required drill fields", async () => {
  const api = analyticsModule(), tables = fixture();
  tables.squad_players[1].player_type = "trial";
  const db = database(tables), filters = api.parseAnalyticsFilters({ period: "all" });
  const result = await api.getSquadAnalyticsOverview(db, "owner", filters);
  assert.deepEqual(result.summaries.map(s => s.player.id).sort(), ["active", "archived"]);
  assert.equal(result.summaries.find(s => s.player.id === "archived").player.playerType, "trial");
  assert.equal(result.teamAnalytics.trainingSessions, 1);
  assert.equal(result.teamAnalytics.drillInstancesUsed, 1);
  assert.equal(result.teamAnalytics.drillUsage[0].averageEffectiveness, 4);
  const historical = db.queries.find(q => q.table === "squad_players" && q.filters.some(f => f[1] === "in"));
  assert.deepEqual(historical.filters.find(f => f[1] === "in")[2], ["archived"]);
  const instances = db.queries.find(q => q.table === "training_session_drill_instances");
  assert.equal(instances.columns, "id,event_id,source_drill_id,title");
  for (const q of db.queries) assert.ok(q.filters.some(f => f[0] === (q.table === "profiles" ? "id" : "user_id") && f[2] === "owner"));
  if (baseRef) {
    const before = database(tables);
    assert.deepEqual(json(result), json(await analyticsModule(true).getSquadAnalyticsOverview(before, "owner", filters)));
    console.log("Identical analytics output; fictional drill payload bytes", { before: before.queries.find(q => q.table === "training_session_drill_instances").bytes, after: instances.bytes });
  }
});

test("analytics skips redundant historical lookup for an all-active roster and handles an empty team", async () => {
  const api = analyticsModule(), filters = api.parseAnalyticsFilters({ period: "all" });
  for (const tables of [fixture(false), {}]) {
    const db = database(tables);
    const result = await api.getSquadAnalyticsOverview(db, "owner", filters);
    assert.equal(db.queries.filter(q => q.table === "squad_players").length, 1);
    if (!tables.profiles) assert.equal(result.summaries.length, 0);
    if (baseRef) {
      const before = database(tables);
      assert.deepEqual(json(result), json(await analyticsModule(true).getSquadAnalyticsOverview(before, "owner", filters)));
      console.log("Squad player queries", { before: before.queries.filter(q => q.table === "squad_players").length, after: 1 });
    }
  }
});

function attentionModule(log, preferences, states, baseline = false, events = []) {
  return load("lib/squad/attention-queries.ts", {
    "@/lib/squad/attention": { ...attention,
      getAttentionPreferences: async () => { log.push("preferences"); return await preferences; },
      listAttentionStates: async () => { log.push("states"); return await states; }
    },
    "@/lib/squad/workspace": { parseWorkspaceState: v => v, getCoachWorkspaceData: async (_db, user) => {
      assert.equal(user, "owner"); log.push("workspace"); return { allPlayers: [], positions: [], periodLabel: "all" };
    } },
    "@/lib/squad/attendance-queries": { listTrainingEventDetails: async (_db, user) => { assert.equal(user, "owner"); log.push("events"); return events; } },
    "@/lib/squad/session-review": { listTrainingSessionReviewSummaries: async (_db, user, ids) => {
      assert.equal(user, "owner"); log.push(["reviews", ids]); return new Map();
    } }
  }, baseline);
}
test("attention reads start together, dashboard reuses request-local events and errors are not hidden", async () => {
  const log = []; let releasePreferences, releaseStates;
  const preferences = new Promise(r => { releasePreferences = r; }), states = new Promise(r => { releaseStates = r; });
  const api = attentionModule(log, preferences, states);
  const pending = api.getDashboardAttentionData({}, "owner", "de", Promise.resolve([]));
  assert.deepEqual(log, ["preferences", "states", "workspace"]);
  releasePreferences(attention.normalizeAttentionPreferences({})); releaseStates(new Map());
  const result = await pending;
  assert.equal(log.includes("events"), false);
  const fallbackLog = [];
  assert.deepEqual(json(await attentionModule(fallbackLog, attention.normalizeAttentionPreferences({}), new Map()).getDashboardAttentionData({}, "owner", "de")), json(result));
  assert.equal(fallbackLog.filter(v => v === "events").length, 1);
  await assert.rejects(api.getDashboardAttentionData({}, "owner", "en", Promise.reject(new Error("DB unavailable"))), /DB unavailable/);
  if (baseRef) {
    const oldLog = [];
    assert.deepEqual(json(await attentionModule(oldLog, attention.normalizeAttentionPreferences({}), new Map(), true).getDashboardAttentionData({}, "owner", "de")), json(result));
    console.log("Extra attention event loads when Dashboard supplies its read", { before: oldLog.filter(v => v === "events").length, after: 0 });
  }
});

test("shared event results preserve real Coach Actions and localization without mutating attendance", async () => {
  const events = [{ ...attendanceMappers.mapTrainingEventRow(event), attendance: [attendanceMappers.mapAttendanceRow(record)] }];
  const original = structuredClone(events), preferences = attention.normalizeAttentionPreferences({});
  for (const locale of ["de", "en"]) {
    const log = [], api = attentionModule(log, preferences, new Map(), false, events);
    const shared = await api.getDashboardAttentionData({}, "owner", locale, Promise.resolve(events));
    const separate = await api.getDashboardAttentionData({}, "owner", locale);
    assert.deepEqual(json(shared), json(separate));
    assert.ok(shared.items.some(item => item.targetId === "event"));
    assert.deepEqual(log[3], ["reviews", ["event"]]);
    if (baseRef) assert.deepEqual(json(shared), json(await attentionModule([], preferences, new Map(), true, events).getDashboardAttentionData({}, "owner", locale)));
  }
  assert.deepEqual(events, original);
});

test("large analytics drill history produces identical results without repeated full scans", () => {
  const api = analyticsModule(), e = attendanceMappers.mapTrainingEventRow(event);
  const instances = Array.from({ length: 5000 }, (_, i) => ({ id: `i${i}`, event_id: e.id, source_drill_id: i % 5 ? `d${i % 1000}` : null, title: `Drill ${i}` }));
  const reviews = instances.map((d, i) => ({ id: `r${i}`, session_drill_instance_id: d.id, effectiveness_rating: i % 6 || null, feedback_status: "worked_well" }));
  reviews.push({ id: "stale", session_drill_instance_id: "removed", effectiveness_rating: 1 });
  const args = [squad, [e], [], [], instances, reviews, [], [], api.parseAnalyticsFilters({ period: "all" }), { seasonStartMonth: 7, seasonStartDay: 1 }];
  const after = api.createTeamAnalytics(...args);
  assert.equal(after.reviewedDrillInstances, 5000);
  if (baseRef) {
    const before = analyticsModule(true);
    assert.deepEqual(json(after), json(before.createTeamAnalytics(...args)));
    const measure = fn => { const times = []; for (let i = 0; i < 5; i++) { const start = performance.now(); fn(...args); times.push(performance.now() - start); } return times.sort((a,b) => a-b)[2].toFixed(1); };
    console.log("Local synthetic analytics CPU, 5000 drill instances, median of 5 ms (not Production latency)", { before: measure(before.createTeamAnalytics), after: measure(api.createTeamAnalytics) });
  }
});

test("page wiring shares Dashboard reads and starts independent library draft count in the existing parallel batch", () => {
  const dashboard = readFileSync("app/(app)/dashboard/page.tsx", "utf8");
  assert.equal((dashboard.match(/listTrainingEventDetails\(supabase/g) ?? []).length, 1);
  assert.match(dashboard, /getDashboardAttentionData\(supabase, user.id, locale, trainingEventsPromise\)/);
  const library = readFileSync("app/(app)/drills/page.tsx", "utf8");
  assert.doesNotMatch(library, /await countDraftDrills/);
  assert.match(library, /filters.view === "drafts" \? drills.length : otherViewDraftCount/);
});
