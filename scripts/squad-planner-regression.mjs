import assert from "node:assert/strict";
import { getTacticalFormation, slot, tacticalFormations } from "../lib/squad/tactical-formations.ts";
import { createSlotRowsForPlan, mapTacticalSlotRow } from "../lib/squad/tactical-planner.ts";

for (const formation of tacticalFormations) {
  assert.equal(formation.slots.length, 11, `${formation.code} must have 11 positions`);
  assert.equal(new Set(formation.slots.map((item) => item.slotKey)).size, 11, `${formation.code} slot keys must be unique`);
  assert.ok(formation.slots.every((item) => item.x >= 8 && item.x <= 92 && item.y >= 12 && item.y <= 90), `${formation.code} slots stay within safe pitch bounds`);
}

assert.equal(getTacticalFormation("Custom").code, "Custom");
assert.equal(slot("left-centre-back", "LCB", 30, 74, 1).acceptedPositions[0], "CB");
assert.equal(slot("right-central-mid", "RCM", 70, 54, 2).acceptedPositions[0], "CM");

const rows = createSlotRowsForPlan("coach", "plan", "4-3-3");
assert.equal(rows.length, 11);
const mapped = mapTacticalSlotRow({ id: "slot", ...rows[1], label: "Left 8" });
assert.equal(mapped.x, rows[1].x);
assert.equal(mapped.y, rows[1].y);
assert.equal(mapped.label, "Left 8");
assert.equal(mapped.planId, "plan");

console.log("PASS: 11-slot formations, unique normalized geometry, canonical role conversion and slot persistence mapping.");
