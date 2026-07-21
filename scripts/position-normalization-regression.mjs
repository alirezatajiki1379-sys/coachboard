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

test("new canonical codes belong to the correct position families", () => {
  assert.equal(getPositionFamily("CAM"), "midfield");
  assert.equal(getPositionFamily("CDM"), "midfield");
  assert.equal(getPositionFamily("CM"), "midfield");
  assert.equal(getPositionFamily("RW"), "attacking");
});
