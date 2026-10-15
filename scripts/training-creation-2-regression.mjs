import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateTrainingRecurrenceDates } from "../lib/trainings/utils.ts";
import { shouldExcludeByDefault } from "../lib/squad/regional-calendar.ts";
import { systemText } from "../lib/i18n/system-text.ts";

const form = readFileSync("components/squad/training-event-form.tsx", "utf8");
const actions = readFileSync("lib/squad/attendance-actions.ts", "utf8");

test("simple scheduling uses progressive disclosure without changing action field names", () => {
  assert.match(form, /data-training-creation-form/);
  assert.match(form, /data-more-details/);
  assert.match(form, /data-participant-selector/);
  assert.match(form, /data-repeat-section/);
  assert.match(form, /name="participantSourceMode"/);
  assert.match(form, /name="linkedTrainingSessionId"/);
  assert.match(form, /name="creationToken"/);
  assert.doesNotMatch(form, /Select entire Squad/);
});

test("recurrence still uses the canonical generator for weekly, fortnightly and multiple weekdays", () => {
  const weekly = generateTrainingRecurrenceDates({ startDate: "2026-10-19", intervalWeeks: 1, weekdays: [1], endMode: "occurrence_count", occurrenceCount: 3 });
  const fortnightly = generateTrainingRecurrenceDates({ startDate: "2026-10-19", intervalWeeks: 2, weekdays: [1], endMode: "occurrence_count", occurrenceCount: 3 });
  const multi = generateTrainingRecurrenceDates({ startDate: "2026-10-19", intervalWeeks: 1, weekdays: [1, 4], endMode: "occurrence_count", occurrenceCount: 4 });
  assert.deepEqual(weekly, ["2026-10-19", "2026-10-26", "2026-11-02"]);
  assert.deepEqual(fortnightly, ["2026-10-19", "2026-11-02", "2026-11-16"]);
  assert.deepEqual(multi, ["2026-10-19", "2026-10-22", "2026-10-26", "2026-10-29"]);
});

test("calendar defaults remain delegated to the established Team preferences", () => {
  const conflict = { date: "2026-10-19", event: { category: "official_school_holiday", excludeByDefault: false } };
  const context = { preferences: { publicHolidays: "ask", schoolHolidays: "exclude", localMovableHolidays: "ask", customExclusions: "ask" } };
  assert.equal(shouldExcludeByDefault(conflict, context), true);
});

test("server duplicate, snapshot and edit-scope safeguards remain present", () => {
  assert.match(actions, /creation_token: values\.creationToken/);
  assert.match(actions, /verifyCreatedEventDates/);
  assert.match(actions, /createSessionPlanSnapshot/);
  assert.match(actions, /is_series_exception/);
  assert.match(actions, /recurrence_original_date/);
  assert.match(actions, /\.neq\("status", "completed"\)/);
});

test("create and edit routes localize their page copy", () => {
  for (const file of ["app/(app)/trainings/new/page.tsx", "app/(app)/trainings/[id]/edit/page.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /getUserLocale/);
    assert.match(source, /locale === "de"/);
  }
});

test("server validation messages are localized without duplicating validation rules", () => {
  assert.equal(systemText("de", "Choose the training date."), "Wähle das Trainingsdatum.");
  assert.equal(systemText("de", "End time cannot be before the start time."), "Die Endzeit darf nicht vor der Startzeit liegen.");
  assert.equal(systemText("de", "No trainings would be created."), "Es würden keine Trainings erstellt.");
});
