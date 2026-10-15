import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatMessage } from "../lib/i18n/index.ts";
import { formatWorkspacePercent, sortWorkspacePlayers } from "../lib/squad/workspace.ts";
import en from "../messages/en.json" with { type: "json" };
import de from "../messages/de.json" with { type: "json" };

const componentSource = readFileSync(new URL("../components/squad/coach-workspace.tsx", import.meta.url), "utf8");
const attentionSource = readFileSync(new URL("../lib/squad/attention.ts", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../app/(app)/squad/players/[id]/page.tsx", import.meta.url), "utf8");
const analyticsSource = readFileSync(new URL("../lib/squad/analytics.ts", import.meta.url), "utf8");

function workspacePlayer(name, attended, trainings, participationRate, attendanceRate) {
  return {
    analytics: {
      player: { firstName: name, lastName: "Example" },
      attended,
      trainings,
      participationRate,
      attendanceRate
    }
  };
}

test("Squad participation examples use all relevant historical trainings", () => {
  for (const [attended, trainings, expected] of [[4, 5, "80%"], [3, 5, "60%"], [5, 5, "100%"], [2, 5, "40%"]]) {
    assert.equal(formatWorkspacePercent(attended / trainings), expected);
  }
  assert.equal(formatWorkspacePercent(3 / 5), "60%", "unexpected participation remains part of the simple participation numerator");
});

test("Squad attendance sorting follows the displayed participation rate in both directions", () => {
  const players = [
    workspacePlayer("Hundred", 5, 5, 1, 0.5),
    workspacePlayer("Forty", 2, 5, 0.4, 1),
    workspacePlayer("Sixty", 3, 5, 0.6, 0.8),
    workspacePlayer("Eighty", 4, 5, 0.8, 1)
  ];
  assert.deepEqual(sortWorkspacePlayers(players, "attendance", "asc").map((item) => item.analytics.participationRate), [0.4, 0.6, 0.8, 1]);
  assert.deepEqual(sortWorkspacePlayers(players, "attendance", "desc").map((item) => item.analytics.participationRate), [1, 0.8, 0.6, 0.4]);
});

test("desktop, mobile and quick view all render participationRate", () => {
  assert.equal((componentSource.match(/formatWorkspacePercent\(summary\.participationRate\)/g) ?? []).length, 3);
  assert.doesNotMatch(componentSource, /formatWorkspacePercent\(summary\.attendanceRate\)/);
  assert.match(componentSource, /participatedDetail/);
  assert.equal(formatMessage(en.squad.labels.participatedDetail, { attended: 4, trainings: 5 }), "4 of 5 participated");
  assert.equal(formatMessage(de.squad.labels.participatedDetail, { attended: 4, trainings: 5 }), "4 von 5 teilgenommen");
});

test("Player Profile and low-participation attention remain aligned while detailed metrics remain available", () => {
  assert.match(profileSource, /formatPercent\(summary\.participationRate, locale\)/);
  assert.match(attentionSource, /summary\.participationRate/);
  assert.match(analyticsSource, /attendanceRate/);
  assert.match(analyticsSource, /attendanceWhenExpectedRate/);
});
