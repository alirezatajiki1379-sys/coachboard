import assert from "node:assert/strict";
import { getDrillUsageStatsByDrillId } from "../lib/drills/usage.ts";
import { drillAgeLabel } from "../lib/drills/display.ts";
import { parseDrillFilters } from "../lib/drills/queries.ts";

const tables = {
  training_session_drill_instances: [
    { id: "a", event_id: "past", source_drill_id: "one", block: "Main part 1", planned_duration_minutes: 15, status: "planned", user_id: "owner" },
    { id: "b", event_id: "past", source_drill_id: "one", status: "planned", user_id: "owner" },
    { id: "c", event_id: "future", source_drill_id: "one", status: "planned", user_id: "owner" },
    { id: "d", event_id: "trash", source_drill_id: "one", status: "planned", user_id: "owner" },
    { id: "removed", event_id: "past", source_drill_id: "one", status: "removed", user_id: "owner" },
    { id: "other-owner", event_id: "past", source_drill_id: "one", status: "planned", user_id: "someone-else" }
  ],
  squad_training_events: [
    { id: "past", squad_id: "team", date: "2020-01-01", start_time: "18:00", label: "Historical title", focus: "Original focus", deleted_at: null, user_id: "owner" },
    { id: "future", squad_id: "team", date: "2999-01-01", deleted_at: null, user_id: "owner" },
    { id: "trash", squad_id: "team", date: "2020-01-01", deleted_at: "2020-01-02", user_id: "owner" }
  ],
  training_session_drill_reviews: [{ session_drill_instance_id: "a", feedback_status: "worked_well", effectiveness_rating: 4, note: "Original review\nSecond line", user_id: "owner" }],
  squads: [{ id: "team", name: "Original Team", user_id: "owner" }]
};
const original = JSON.stringify(tables);
const calls = [];
const db = {
  from(table) {
    calls.push(table);
    let rows = tables[table];
    return {
      select() { return this; },
      eq(key, value) { rows = rows.filter((row) => row[key] === value); return this; },
      neq(key, value) { rows = rows.filter((row) => row[key] !== value); return this; },
      in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return this; },
      is(key, value) { rows = rows.filter((row) => row[key] === value); return this; },
      lte(key, value) { rows = rows.filter((row) => row[key] <= value); return this; },
      then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); }
    };
  }
};
const stats = await getDrillUsageStatsByDrillId(db, "owner", ["one", "two", "one"]);
assert.equal(stats.get("one").historicalUseCount, 2, "repeat use counts, future/trash/removed/other owner excluded");
assert.equal(stats.get("one").reviewedUseCount, 1);
assert.equal(stats.get("one").averageEffectiveness, 4);
assert.equal(stats.get("two").averageEffectiveness, undefined, "no invented zero rating");
assert.equal(stats.get("one").history[0].trainingTitle, "Historical title");
assert.equal(stats.get("one").history[0].reviewNote, "Original review\nSecond line");
assert.equal(calls.length, 4, "queries are batched, not per card");
assert.equal(JSON.stringify(tables), original, "presentation/usage does not mutate historical data");
const unavailable = await getDrillUsageStatsByDrillId({ from() { throw new Error("fixture query error"); } }, "owner", ["one"]);
assert.equal(unavailable.get("one").usageUnavailable, true);
for (const view of ["active", "published", "drafts", "archived", "trash"]) {
  const filters = parseDrillFilters({ view, search: "original", mainFocus: "Passing", drillType: "Technical drill", sort: "most_used", usage: "recent" });
  assert.equal(filters.view, view);
  assert.equal(filters.search, "original");
  assert.equal(filters.mainFocus, "Passing");
  assert.equal(filters.drillType, "Technical drill");
  assert.equal(filters.sort, "most_used");
  assert.equal(filters.usage, "recent");
}
const age = { ageMode: "custom_range", ageGroups: [], minimumAge: 7, maximumAge: 12 };
assert.equal(drillAgeLabel(age, "en"), "Ages 7-12");
assert.equal(drillAgeLabel(age, "de"), "Alter 7-12");
assert.equal(age.minimumAge, 7);
console.log("PASS: batched usage, ownership, historical evidence, future/trash exclusion, repeat use, unchanged filters, localized age labels.");
