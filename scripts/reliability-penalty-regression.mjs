import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  LEGACY_AUTO_UNEXCUSED_CUTOFF,
  calculateReliabilityBreakdown,
  calculateReliabilityPenalty,
  calculateReliabilityPenaltyFromStatus,
  isLegacyAutoUnexcusedCandidate
} from "../lib/squad/attendance-utils.ts";
import { calculateReliabilitySummary } from "../lib/squad/analytics.ts";

const beforeCutoff = "2026-10-14T22:49:00Z";
const afterCutoff = "2026-10-14T22:51:00Z";

function entry(values = {}) {
  return {
    finalStatus: "present",
    latePenaltyApplied: true,
    updatedAt: afterCutoff,
    ...values
  };
}

test("compatibility cutoff matches the actual attendance context rollout", () => {
  assert.equal(LEGACY_AUTO_UNEXCUSED_CUTOFF, "2026-10-15T00:50:04+02:00");
});

test("historical automatic Unexcused is reviewable and carries no penalty", () => {
  const legacy = entry({ finalStatus: "U", actualAbsenceReason: "unexcused", updatedAt: beforeCutoff });
  assert.equal(isLegacyAutoUnexcusedCandidate(legacy), true);
  assert.equal(calculateReliabilityPenalty(legacy), 0);
  assert.deepEqual(calculateReliabilityBreakdown([legacy]), { late: 0, lateCancellation: 0, unexcused: 0, legacyNeedsReview: 1 });
});

test("a modern explicit Unexcused record carries minus two", () => {
  const modern = entry({ finalStatus: "U", actualAbsenceReason: "unexcused" });
  assert.equal(isLegacyAutoUnexcusedCandidate(modern), false);
  assert.equal(calculateReliabilityPenalty(modern), -2);
  assert.equal(calculateReliabilityPenalty(entry({ finalStatus: "absent", actualAbsenceReason: "unexcused" })), -2);
});

test("actual reason is authoritative and normal absence reasons carry no penalty", () => {
  for (const finalStatus of ["present", "left_early", "absent"]) {
    assert.equal(calculateReliabilityPenalty(entry({ finalStatus, actualAbsenceReason: undefined })), 0, finalStatus);
  }
  for (const actualAbsenceReason of ["excused", "sick", "injured", "school", "work", "holiday", "private", "other"]) {
    assert.equal(calculateReliabilityPenalty(entry({ finalStatus: "U", actualAbsenceReason })), 0, actualAbsenceReason);
  }
  assert.equal(calculateReliabilityPenaltyFromStatus("P"), 0);
});

test("Late, penalty opt-out and late cancellation follow canonical values", () => {
  assert.equal(calculateReliabilityPenalty(entry({ finalStatus: "Z", latePenaltyApplied: true })), -1);
  assert.equal(calculateReliabilityPenalty(entry({ finalStatus: "Z", latePenaltyApplied: false })), 0);
  assert.equal(calculateReliabilityPenalty(entry({ finalStatus: "S", actualAbsenceReason: undefined })), -1);
});

test("reliability summary separates genuine and ambiguous Unexcused records", () => {
  const legacy = entry({ finalStatus: "U", actualAbsenceReason: "unexcused", updatedAt: beforeCutoff, eventId: "legacy-training" });
  const genuine = entry({ finalStatus: "U", actualAbsenceReason: "unexcused", eventId: "modern-training" });
  const secondGenuine = entry({ finalStatus: "U", actualAbsenceReason: "unexcused", eventId: "modern-training-2" });
  assert.equal(calculateReliabilitySummary([genuine, secondGenuine]).total, -4);
  const summary = calculateReliabilitySummary([legacy, genuine]);
  assert.equal(summary.total, -2);
  assert.deepEqual(summary.breakdown, { late: 0, lateCancellation: 0, unexcused: 1, legacyNeedsReview: 1 });
  assert.equal(summary.legacyReviewEventId, "legacy-training");
});

test("current Absent flow never silently defaults to Unexcused", () => {
  const controls = fs.readFileSync(new URL("../components/squad/attendance-controls.tsx", import.meta.url), "utf8");
  const actions = fs.readFileSync(new URL("../lib/squad/attendance-actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(controls, /plannedReasonToActualAbsenceReason\(entry\.plannedReason\)\s*\?\?\s*["']unexcused["']/);
  assert.doesNotMatch(actions, /actualAbsenceReasonValue\([^)]*\)\s*\?\?\s*["']unexcused["']/);
  assert.match(controls, /value="">\{ui\("Select reason"\)\}/);
});

test("Analytics and report surfaces use the canonical explainable reliability value", () => {
  const analyticsPage = fs.readFileSync(new URL("../app/(app)/squad/analysis/page.tsx", import.meta.url), "utf8");
  const playerPage = fs.readFileSync(new URL("../app/(app)/squad/players/[id]/page.tsx", import.meta.url), "utf8");
  const report = fs.readFileSync(new URL("../components/squad/team-analytics-report.tsx", import.meta.url), "utf8");
  for (const source of [analyticsPage, playerPage, report]) assert.match(source, /ReliabilityValue/);
});
