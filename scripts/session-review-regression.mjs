import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  sessionReviewRatingLabel,
  sessionReviewStarFillStates
} from "../lib/squad/session-review.ts";

test("quality rating fills stars cumulatively", () => {
  assert.deepEqual(sessionReviewStarFillStates(1), [true, false, false, false, false]);
  assert.deepEqual(sessionReviewStarFillStates(3), [true, true, true, false, false]);
  assert.deepEqual(sessionReviewStarFillStates(5), [true, true, true, true, true]);
});

test("intensity rating 4 shows first four stars filled", () => {
  assert.deepEqual(sessionReviewStarFillStates(4), [true, true, true, true, false]);
  assert.equal(sessionReviewRatingLabel("intensity", 4, "en"), "High");
  assert.equal(sessionReviewRatingLabel("intensity", 4, "de"), "Hoch");
});

test("player response rating has English and German anchors", () => {
  assert.deepEqual(sessionReviewStarFillStates(2), [true, true, false, false, false]);
  assert.equal(sessionReviewRatingLabel("playerResponse", 2, "en"), "Weak");
  assert.equal(sessionReviewRatingLabel("playerResponse", 2, "de"), "Schwach");
});

test("hover preview overrides selected value without changing it", () => {
  assert.deepEqual(sessionReviewStarFillStates(3, 5), [true, true, true, true, true]);
  assert.deepEqual(sessionReviewStarFillStates("", 4), [true, true, true, true, false]);
});

test("player observation remains optional and separate from review validation", () => {
  const source = readFileSync("components/squad/session-review-form.tsx", "utf8");
  assert.match(source, /observationDialogOpen/);
  assert.match(source, /createPlayerObservation\(formData\)/);
  assert.doesNotMatch(source, /if \(!observation/);
  assert.match(source, /players\.find\(\(player\) => player\.id === selectedPlayerId\)/);
});

test("next Training note explains its optional planning reminder", () => {
  const source = readFileSync("components/squad/session-review-form.tsx", "utf8");
  assert.match(source, /Shown again when you plan this Team's next Training\./);
  assert.match(source, /Wird dir bei der Planung der nächsten Trainingseinheit dieser Mannschaft wieder angezeigt\./);
  assert.doesNotMatch(source, /send to next Training|an nächstes Training senden/i);
});
