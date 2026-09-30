import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { observationPayload, playerPayload, targetPayload } from "../lib/scouting/validation.ts";

const player = new FormData();
player.set("firstName", "Mara");
player.set("lastName", "Beispiel");
player.set("birthDate", "2012-04-18");
player.set("primaryPosition", "ZOM");
player.set("secondaryPositions", "RW / ST");
player.set("strongFoot", "left");
player.set("status", "monitoring");
player.set("priority", "high");
player.set("nextAction", "observe_again");
player.set("nextActionDate", "2026-10-15");
const parsedPlayer = playerPayload(player);
assert.equal(parsedPlayer.primary_position, "CAM");
assert.deepEqual(parsedPlayer.secondary_positions, ["RW", "ST"]);
assert.equal(parsedPlayer.status, "monitoring");
assert.equal(parsedPlayer.priority, "high");
assert.equal(parsedPlayer.next_action, "observe_again");

const observation = new FormData();
observation.set("observedOn", "2026-10-01");
observation.set("context", "match");
observation.set("observedPosition", "RW");
observation.set("summary", "Quick decisions in transition.");
observation.set("ratingTechnical", "4");
const parsedObservation = observationPayload(observation);
assert.equal(parsedObservation.rating_technical, 4);
assert.equal(parsedObservation.rating_tactical, null);
assert.equal(parsedObservation.rating_physical, null);
assert.equal(parsedObservation.rating_mental, null);

const target = new FormData();
target.set("title", "U15 Left-sided defender");
target.set("positions", "IV, LV");
target.set("birthYearFrom", "2011");
target.set("birthYearTo", "2012");
target.set("preferredFoot", "left");
target.set("status", "active");
const parsedTarget = targetPayload(target);
assert.deepEqual(parsedTarget.positions, ["CB", "LB"]);
assert.equal(parsedTarget.preferred_foot, "left");

assert.throws(() => {
  const invalid = new FormData();
  invalid.set("observedOn", "01.10.2026");
  invalid.set("summary", "Invalid date");
  observationPayload(invalid);
}, /valid observation date/);

const migration = readFileSync(new URL("../supabase/migrations/20260920_scouting_workspace.sql", import.meta.url), "utf8");
for (const table of ["scouting_players", "scouting_observations", "scouting_targets", "scouting_target_players", "scouting_history"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(migration, /foreign key \(user_id, linked_squad_player_id\)/);
assert.match(migration, /foreign key \(user_id, target_id\)/);
assert.match(migration, /foreign key \(user_id, player_id\)/);

console.log("PASS: Scouting canonical values, optional ratings, position normalization, validation and owner-scoped migration safeguards.");
