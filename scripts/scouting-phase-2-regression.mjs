import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { actions, fakeDb, load } from "./scouting-workflow-regression.mjs";
import * as workflow from "../lib/scouting/workflow.ts";

const form = (values) => { const fd = new FormData(); for (const [key, value] of Object.entries(values)) fd.set(key, value); return fd; };
const player = { id: "p", user_id: "owner", first_name: "Fictional", status: "monitoring", next_action: null, next_action_date: null, linked_squad_player_id: null };
const latest = { player_id: "p", observed_on: "2026-11-17", follow_up_date: null, next_focus: null, open_questions: null, recommendation: "shortlist", next_action: null };
const queries = (db) => load("lib/scouting/queries.ts", { "@/lib/scouting/db": { asScoutingDb: () => db }, "@/lib/scouting/workflow": workflow });

test("attention uses only due dates and explicit latest questions/focus, never age or ratings", () => {
  assert.deepEqual(workflow.scoutingAttention(player, undefined, "2026-11-17"), []);
  assert.deepEqual(workflow.scoutingAttention(player, { ...latest, observed_on: "2020-01-01", rating_technical: 1 }, "2026-11-17"), []);
  const observation = { ...latest, follow_up_date: "2026-11-17", next_focus: "Pressure", open_questions: "Consistency?" };
  assert.deepEqual(workflow.scoutingAttention(player, observation, "2026-11-17"), ["due", "focus", "questions"]);
  assert.deepEqual(workflow.scoutingAttention(player, { ...latest, follow_up_date: "2026-11-18", next_focus: " " }, "2026-11-17"), []);
  for (const status of ["archived", "added_to_squad"]) assert.deepEqual(workflow.scoutingAttention({ ...player, status }, observation, "2026-11-17"), []);
  assert.deepEqual(workflow.scoutingAttention({ ...player, next_action: "discuss", next_action_date: "2026-11-16" }, latest, "2026-11-17"), ["due"]);
});

test("recommendation offers only reversible reviewed pipeline changes, never a trial or roster shortcut", () => {
  assert.equal(workflow.reviewableRecommendation(player, "shortlist"), "shortlist");
  for (const value of [null, "monitoring", "identified", "trial", "added_to_squad", "talent_score"]) assert.equal(workflow.reviewableRecommendation(player, value), null);
  for (const status of ["archived", "added_to_squad", "trial"]) assert.equal(workflow.reviewableRecommendation({ ...player, status }, "shortlist"), null);
  assert.equal(workflow.reviewableRecommendation({ ...player, linked_squad_player_id: "squad-player" }, "shortlist"), null);
});

test("pipeline note persists original/new state without altering historical observations; old history remains readable", async () => {
  const db = fakeDb(); db.tables.scouting_players.push({ ...player }); db.tables.scouting_observations.push({ ...latest });
  const a = actions(db);
  const before = structuredClone(db.tables.scouting_observations);
  await assert.rejects(a.updateScoutingPlayer("p", {}, form({ firstName: "Fictional", status: "shortlist", statusNote: "Watch decision-making, not current size" })), /\/scouting\/players\/p/);
  assert.deepEqual(workflow.readPipelineHistory(db.tables.scouting_history[0].detail), { from: "monitoring", to: "shortlist", note: "Watch decision-making, not current size" });
  assert.deepEqual(db.tables.scouting_observations, before);
  for (const value of [null, "shortlist", "{broken", '{"kind":"pipeline","from":"bad","to":"shortlist","note":""}']) assert.equal(workflow.readPipelineHistory(value), null);
  const count = db.tables.scouting_history.length;
  await assert.rejects(a.updateScoutingPlayer("p", {}, form({ firstName: "Fictional", status: "shortlist" })), /\/scouting\/players\/p/);
  assert.equal(db.tables.scouting_history.length, count);
});

test("latest context uses deterministic date order, ignores foreign rows, and never resurrects cleared older questions", async () => {
  const db = fakeDb(); db.tables.scouting_players.push({ ...player });
  db.tables.scouting_observations.push(
    { ...latest, id: "old", user_id: "owner", observed_on: "2026-11-16", next_focus: "Old question", open_questions: "Old", created_at: "2026-11-18" },
    { ...latest, id: "new", user_id: "owner", created_at: "2026-11-17" },
    { ...latest, id: "foreign", user_id: "other", observed_on: "2026-11-18", next_focus: "Foreign" }
  );
  const data = await queries(db).getScoutingListData(db, "owner");
  assert.equal(data.latestObservations.p.next_focus, null);
  assert.deepEqual(workflow.scoutingAttention(player, data.latestObservations.p, "2026-11-17"), []);
  db.tables.scouting_observations.push({ ...latest, id: "z", user_id: "owner", created_at: "2026-11-17", next_focus: "Tie breaker" });
  assert.equal((await queries(db).getScoutingListData(db, "owner")).latestObservations.p.next_focus, "Tie breaker");
});

test("target context preserves archived linked prospects, scopes latest observations, and existing link/unlink/create/edit work", async () => {
  const db = fakeDb(); const a = actions(db);
  db.tables.scouting_players.push({ ...player, status: "archived" }, { ...player, id: "other", user_id: "foreign" });
  await assert.rejects(a.createScoutingTarget({}, form({ title: "Left side" })), /\/scouting\/targets\//);
  const target = db.tables.scouting_targets[0];
  await assert.rejects(a.updateScoutingTarget(target.id, {}, form({ title: "Left side U15" })), /\/scouting\/targets\//);
  await a.linkScoutingTarget(form({ playerId: "p", targetId: target.id }));
  await a.linkScoutingTarget(form({ playerId: "p", targetId: target.id }));
  assert.equal(db.tables.scouting_target_players.length, 1);
  db.tables.scouting_observations.push({ ...latest, id: "o", user_id: "owner" }, { ...latest, id: "foreign", user_id: "other", observed_on: "2026-12-01" });
  const detail = await queries(db).getScoutingTarget(db, "owner", target.id);
  assert.equal(detail.players.length, 1); assert.equal(detail.players[0].status, "archived");
  assert.equal(detail.latestObservations.p.observed_on, "2026-11-17");
  await assert.rejects(a.linkScoutingTarget(form({ playerId: "other", targetId: target.id })), /not found/);
  await a.unlinkScoutingTarget(form({ playerId: "p", targetId: target.id }));
  assert.equal(db.tables.scouting_target_players.length, 0);
  assert.equal(db.tables.scouting_observations.length, 2);
});

test("phase 2 uses canonical observations and no derived score, schema change or automatic recommendation mutation", () => {
  const ui = readFileSync("components/scouting/evidence.tsx", "utf8");
  assert.match(ui, /o\[key\] == null/);
  assert.doesNotMatch(ui, /average|Math\.round|overall_rating|talent_score/);
  assert.match(ui, /<details/);
  const edit = readFileSync("app/(app)/scouting/players/[id]/edit/page.tsx", "utf8");
  assert.match(edit, /latest\.data\?\.recommendation === requested/);
  assert.doesNotMatch(edit, /\.update\(/);
  const observationAction = readFileSync("lib/scouting/actions.ts", "utf8").split("async function saveObservation")[1].split("export async function createScoutingTarget")[0];
  assert.doesNotMatch(observationAction, /status:/);
});

test("existing Scouting-to-Trial invitation creates one linked squad identity and leaves observations intact", async () => {
  const db = fakeDb(); const a = actions(db);
  db.tables.scouting_players.push({ ...player, secondary_positions: [], primary_position: "CM" });
  db.tables.squads = [{ id: "team", user_id: "owner", archived_at: null }];
  db.tables.scouting_observations.push({ ...latest });
  const previous = structuredClone(db.tables.scouting_observations);
  const invitation = form({ squadId: "team", startDate: "2026-11-17", durationMode: "training_count", trainingLimit: "3" });
  await assert.rejects(a.inviteScoutingPlayerToTrial("p", {}, invitation), /\/scouting\/players\/p/);
  assert.equal(db.tables.squad_players.length, 1);
  assert.equal(db.tables.scouting_players[0].linked_squad_player_id, db.tables.squad_players[0].id);
  assert.equal(db.tables.scouting_players[0].status, "trial");
  assert.equal(db.tables.scouting_history[0].event_type, "invited_to_trial");
  assert.match((await a.inviteScoutingPlayerToTrial("p", {}, invitation)).error, /already linked/);
  assert.equal(db.tables.squad_players.length, 1);
  assert.deepEqual(db.tables.scouting_observations, previous);
});
