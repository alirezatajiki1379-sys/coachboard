import assert from "node:assert/strict";
import { getTacticalFormation, slot, tacticalFormations } from "../lib/squad/tactical-formations.ts";
import {
  createSlotRowsForPlan,
  evaluatePlayerSlotFit,
  getPlayerPositionFit,
  isFitVisibleInMode,
  mapTacticalSlotRow
} from "../lib/squad/tactical-planner.ts";

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

const player = (position, secondaryPositions = []) => ({ position, secondaryPositions });
const fit = (position, secondaryPositions, target) => getPlayerPositionFit(player(position, secondaryPositions), target);

assert.equal(fit("CB", [], "CB").fit, "primary");
assert.equal(fit("CB", [], "CDM").fit, "compatible");
assert.equal(fit("CB", ["CM"], "CDM").fit, "compatible");

const leftBridge = fit("LB", ["LW"], "LM");
assert.equal(leftBridge.fit, "compatible");
assert.equal(leftBridge.reason?.type, "bridge");
assert.deepEqual(leftBridge.reason?.sourcePositions, ["LB", "LW"]);
assert.equal(fit("LW", ["LB"], "LM").fit, "compatible");

assert.equal(fit("RB", ["RW"], "RM").fit, "compatible");
assert.equal(fit("CM", ["LW"], "LM").fit, "compatible");
assert.equal(fit("CM", ["RW"], "RM").fit, "compatible");
assert.equal(fit("CDM", ["CAM"], "CM").fit, "compatible");

assert.equal(fit("ST", [], "RW").fit, "out_of_position");
assert.equal(fit("LB", [], "LW").fit, "out_of_position");
assert.equal(fit("RB", [], "RW").fit, "out_of_position");
assert.equal(fit("RW", [], "LW").fit, "compatible");

assert.equal(fit("CM", ["CAM"], "CAM").fit, "secondary", "Explicit secondary must beat compatible");
assert.equal(fit("CAM", ["CM"], "CAM").fit, "primary", "Primary must beat all other fit levels");
assert.equal(fit("LB", ["LW"], "RM").fit, "out_of_position", "Derived LM must not chain into RM");

assert.equal(fit("LB", [], "LWB").fit, "compatible");
assert.equal(fit("RB", [], "RWB").fit, "compatible");
assert.equal(fit("LB", ["LM"], "LWB").reason?.type, "bridge");
assert.equal(fit("RB", ["RM"], "RWB").reason?.type, "bridge");

assert.equal(isFitVisibleInMode("natural", "natural"), true);
assert.equal(isFitVisibleInMode("secondary", "natural"), false);
assert.equal(isFitVisibleInMode("secondary", "natural_secondary"), true);
assert.equal(isFitVisibleInMode("compatible", "natural_secondary"), false);
assert.equal(isFitVisibleInMode("compatible", "natural_secondary_compatible"), true);
assert.equal(isFitVisibleInMode("out_of_position", "natural_secondary_compatible"), false);
assert.equal(isFitVisibleInMode("out_of_position", "all"), true);

const customLabelSlot = {
  code: "LEFT-8",
  label: "Left 8",
  naturalPositions: ["CM"],
  acceptedPositions: ["CM", "CAM"]
};
assert.equal(evaluatePlayerSlotFit(player("CM"), customLabelSlot).fitType, "natural");

const broadAcceptedPositions = {
  code: "LB",
  label: "Left Back",
  naturalPositions: ["LB"],
  acceptedPositions: ["LB", "CB", "LW"]
};
assert.equal(evaluatePlayerSlotFit(player("CB"), broadAcceptedPositions, true).fitType, "out_of_position");
assert.equal(evaluatePlayerSlotFit(player("LW"), broadAcceptedPositions, true).fitType, "out_of_position");
assert.equal(evaluatePlayerSlotFit(player(undefined), broadAcceptedPositions, true).fitType, "out_of_position");
assert.equal(evaluatePlayerSlotFit(player(undefined), broadAcceptedPositions, true).eligible, true);

console.log("PASS: formations, canonical position fit precedence, direct/bridge compatibility, no transitive inference, Fit Mode and custom slot semantics.");
