import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyReviewCarryForward, includesReviewCarryForward } from "../lib/sessions/review-carry-forward.ts";
import { getPreviousTrainingPlanningContext } from "../lib/squad/session-review.ts";

function mockSupabase({ previousEvent, review }) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, filters: [], orders: [], limit: undefined };
      calls.push(call);
      const chain = {
        select() { return chain; },
        eq(column, value) { call.filters.push(["eq", column, value]); return chain; },
        is(column, value) { call.filters.push(["is", column, value]); return chain; },
        or(value) { call.filters.push(["or", value]); return chain; },
        order(column, options) { call.orders.push([column, options]); return chain; },
        limit(value) { call.limit = value; return chain; },
        async maybeSingle() {
          return { data: table === "squad_training_events" ? previousEvent : review, error: null };
        }
      };
      return chain;
    }
  };
}

test("immediately previous same-Team Training supplies the only eligible note", async () => {
  const supabase = mockSupabase({
    previousEvent: { id: "training-a", date: "2026-10-16", start_time: "10:00", label: "Morning Training", training_sessions: null },
    review: { next_training_note: "Counterpress faster after losing possession.", objective_outcome: "partly_achieved" }
  });
  const context = await getPreviousTrainingPlanningContext(supabase, "coach", { id: "training-b", squadId: "u14", date: "2026-10-16", startTime: "18:00" });
  assert.deepEqual(context, {
    sourceEventId: "training-a",
    sourceDate: "2026-10-16",
    sourceLabel: "Morning Training",
    nextTrainingNote: "Counterpress faster after losing possession.",
    objectiveOutcome: "partly_achieved"
  });
  const eventQuery = supabase.calls[0];
  assert.deepEqual(eventQuery.filters.slice(0, 4), [["eq", "user_id", "coach"], ["eq", "squad_id", "u14"], ["is", "deleted_at", null], ["is", "archived_at", null]]);
  assert.ok(eventQuery.filters.some((filter) => filter[0] === "or" && filter[1] === "date.lt.2026-10-16,and(date.eq.2026-10-16,start_time.lt.18:00)"));
  assert.deepEqual(eventQuery.orders.map(([column]) => column), ["date", "start_time"]);
  assert.equal(eventQuery.limit, 1);
});

test("an empty review on the immediately previous Training does not search further back", async () => {
  const supabase = mockSupabase({
    previousEvent: { id: "training-b", date: "2026-10-15", start_time: "18:00", label: "Training B", training_sessions: null },
    review: { next_training_note: "   ", objective_outcome: "achieved" }
  });
  assert.equal(await getPreviousTrainingPlanningContext(supabase, "coach", { id: "training-c", squadId: "u14", date: "2026-10-17", startTime: "18:00" }), null);
  assert.equal(supabase.calls.filter((call) => call.table === "squad_training_events").length, 1);
  assert.equal(supabase.calls.filter((call) => call.table === "training_session_reviews").length, 1);
});

test("carry-forward uses local plan values, preserves focus and deduplicates", () => {
  const note = "Improve counterpressing.";
  assert.deepEqual(applyReviewCarryForward("", "", note, "From last reflection:"), { mainFocus: note, notes: "", destination: "focus" });
  const withFocus = applyReviewCarryForward("Build-up", "Existing notes", note, "From last reflection:");
  assert.equal(withFocus.mainFocus, "Build-up");
  assert.equal(withFocus.notes, "Existing notes\n\nFrom last reflection:\nImprove counterpressing.");
  assert.equal(withFocus.destination, "notes");
  assert.equal(includesReviewCarryForward(withFocus.mainFocus, withFocus.notes, note), true);
  assert.deepEqual(applyReviewCarryForward(withFocus.mainFocus, withFocus.notes, note, "From last reflection:"), { ...withFocus, destination: "already" });
});

test("integration remains advisory and uses existing Review and Plan fields", () => {
  const page = readFileSync("app/(app)/trainings/[id]/plan/page.tsx", "utf8");
  const form = readFileSync("components/sessions/session-form.tsx", "utf8");
  const review = readFileSync("components/squad/session-review-form.tsx", "utf8");
  assert.match(page, /getPreviousTrainingPlanningContext/);
  assert.match(page, /carryForwardContext=\{carryForwardContext\}/);
  assert.match(form, /applyReviewCarryForward/);
  assert.match(form, /carryForwardContext\?/);
  assert.match(review, /nextTrainingCarryForwardHelper/);
  assert.doesNotMatch(page + form, /Action Center|completeness|automatically copy/i);
});
