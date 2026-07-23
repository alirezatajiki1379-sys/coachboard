import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePositions } from "../lib/squad/intake.ts";
import { getPositionFamily } from "../lib/squad/positions.ts";

test("ZOM normalizes to CAM without review warning", () => {
  assert.deepEqual(normalizePositions("ZOM"), { values: ["CAM"], warnings: [] });
});

test("ZDM normalizes to CDM without review warning", () => {
  assert.deepEqual(normalizePositions("ZDM"), { values: ["CDM"], warnings: [] });
});

test("ZM normalizes to CM without review warning", () => {
  assert.deepEqual(normalizePositions("ZM"), { values: ["CM"], warnings: [] });
});

test("Rechts Fluegel variants normalize to RW", () => {
  assert.deepEqual(normalizePositions("Rechts Flügel"), { values: ["RW"], warnings: [] });
  assert.deepEqual(normalizePositions("rechter Flügel"), { values: ["RW"], warnings: [] });
  assert.deepEqual(normalizePositions("Rechtsflügel"), { values: ["RW"], warnings: [] });
});

test("RF normalizes to RW instead of storing RF", () => {
  assert.deepEqual(normalizePositions("RF"), { values: ["RW"], warnings: [] });
});

test("combined position values preserve canonical order", () => {
  assert.deepEqual(normalizePositions("ZOM / ZM"), { values: ["CAM", "CM"], warnings: [] });
  assert.deepEqual(normalizePositions("ZDM, ZM"), { values: ["CDM", "CM"], warnings: [] });
  assert.deepEqual(normalizePositions("Rechts Flügel / ZOM"), { values: ["RW", "CAM"], warnings: [] });
});

test("German midfield aliases with role-number notes normalize like the base alias", () => {
  assert.deepEqual(normalizePositions("ZOM (10er)"), { values: ["CAM"], warnings: [] });
  assert.deepEqual(normalizePositions("ZM (8er)"), { values: ["CM"], warnings: [] });
  assert.deepEqual(normalizePositions("ZDM (6er)"), { values: ["CDM"], warnings: [] });
  assert.deepEqual(normalizePositions("ZOM (10er) / ZM (8er)"), { values: ["CAM", "CM"], warnings: [] });
});

test("new canonical codes belong to the correct position families", () => {
  assert.equal(getPositionFamily("CAM"), "midfield");
  assert.equal(getPositionFamily("CDM"), "midfield");
  assert.equal(getPositionFamily("CM"), "midfield");
  assert.equal(getPositionFamily("RW"), "attacking");
});

test("goalkeeper aliases normalize to GK", () => {
  for (const value of ["TW", "Torwart", "Torhüterin", "Keeper", "Goalie"]) {
    assert.deepEqual(normalizePositions(value), { values: ["GK"], warnings: [] });
  }
});

test("centre-back aliases normalize to CB", () => {
  for (const value of ["IV", "Innenverteidiger", "Central Defender", "Stopper"]) {
    assert.deepEqual(normalizePositions(value), { values: ["CB"], warnings: [] });
  }
});

test("full-back aliases normalize by side", () => {
  for (const value of ["RV", "Rechtsverteidiger", "Right Full-Back"]) {
    assert.deepEqual(normalizePositions(value), { values: ["RB"], warnings: [] });
  }
  for (const value of ["LV", "Linksverteidiger", "Left Back"]) {
    assert.deepEqual(normalizePositions(value), { values: ["LB"], warnings: [] });
  }
});

test("wing-back aliases normalize by side", () => {
  for (const value of ["Schiene rechts", "Rechter Wingback"]) {
    assert.deepEqual(normalizePositions(value), { values: ["RWB"], warnings: [] });
  }
  for (const value of ["Schiene links", "Linker Wingback"]) {
    assert.deepEqual(normalizePositions(value), { values: ["LWB"], warnings: [] });
  }
});

test("midfield aliases normalize to canonical midfield codes", () => {
  for (const value of ["ZDM", "6er", "Defensives Mittelfeld"]) {
    assert.deepEqual(normalizePositions(value), { values: ["CDM"], warnings: [] });
  }
  for (const value of ["ZM", "8er", "Box-to-Box"]) {
    assert.deepEqual(normalizePositions(value), { values: ["CM"], warnings: [] });
  }
  for (const value of ["ZOM", "10er", "Spielmacher"]) {
    assert.deepEqual(normalizePositions(value), { values: ["CAM"], warnings: [] });
  }
  assert.deepEqual(normalizePositions("Rechtes Mittelfeld"), { values: ["RM"], warnings: [] });
  assert.deepEqual(normalizePositions("Linkes Mittelfeld"), { values: ["LM"], warnings: [] });
});

test("winger aliases normalize by side", () => {
  for (const value of ["Rechts Flügel", "RF", "RA", "Right Winger"]) {
    assert.deepEqual(normalizePositions(value), { values: ["RW"], warnings: [] });
  }
  for (const value of ["Links Flügel", "LF", "LA", "Left Winger"]) {
    assert.deepEqual(normalizePositions(value), { values: ["LW"], warnings: [] });
  }
});

test("attacker aliases normalize to SS and ST", () => {
  for (const value of ["Hängende Spitze", "Second Striker"]) {
    assert.deepEqual(normalizePositions(value), { values: ["SS"], warnings: [] });
  }
  for (const value of ["ST", "9er", "Mittelstürmer", "Striker"]) {
    assert.deepEqual(normalizePositions(value), { values: ["ST"], warnings: [] });
  }
});

test("contextual sentences detect primary and secondary positions in order", () => {
  assert.deepEqual(normalizePositions("Hauptsächlich IV, kann aber auch auf der 6 spielen."), { values: ["CB", "CDM"], warnings: [] });
  assert.deepEqual(normalizePositions("Am liebsten rechts außen oder als Zehner."), { values: ["RW", "CAM"], warnings: [] });
  assert.deepEqual(normalizePositions("Torwart, manchmal aber auch Stürmer."), { values: ["GK", "ST"], warnings: [] });
  assert.deepEqual(normalizePositions("Links- und Rechtsverteidiger."), { values: ["LB", "RB"], warnings: [] });
});

test("typo-tolerant matching handles clear single-candidate spelling errors", () => {
  assert.deepEqual(normalizePositions("Defensive miedfilder"), { values: ["CDM"], warnings: [] });
  assert.deepEqual(normalizePositions("Attaking midfielder"), { values: ["CAM"], warnings: [] });
  assert.deepEqual(normalizePositions("Central midfelder"), { values: ["CM"], warnings: [] });
  assert.deepEqual(normalizePositions("Innnenverteidiger"), { values: ["CB"], warnings: [] });
  assert.deepEqual(normalizePositions("Rechts Fluegel"), { values: ["RW"], warnings: [] });
});

test("broad and ambiguous values require manual review instead of guessing", () => {
  const allrounder = normalizePositions("Allrounder");
  assert.deepEqual(allrounder.values, []);
  assert.equal(allrounder.warnings.some((warning) => warning.includes("Ambiguous position description")), true);

  const midfield = normalizePositions("Mittelfeld");
  assert.deepEqual(midfield.values, []);
  assert.equal(midfield.warnings.some((warning) => warning.includes("Position family recognized (midfield)")), true);
});

test("SS belongs to the attacking family", () => {
  assert.equal(getPositionFamily("SS"), "attacking");
});
