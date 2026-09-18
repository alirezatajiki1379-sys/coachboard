import assert from "node:assert/strict";
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
