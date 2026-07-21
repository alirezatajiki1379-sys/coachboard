import assert from "node:assert/strict";
import { test } from "node:test";
import { generateTrainingRecurrenceDates } from "../lib/trainings/recurrence.ts";
import { findCalendarConflicts, publicHolidaysForGermanState, suggestedLocalDaysForGermanState } from "../lib/squad/regional-calendar.ts";

const mondaySeriesInput = {
  startDate: "2026-09-14",
  intervalWeeks: 1,
  weekdays: [1],
  endMode: "date",
  endDate: "2027-07-12"
};

const nrwSchoolHolidays = [
  event("Autumn holidays", "school_holiday", "2026-10-17", "2026-10-31"),
  event("Christmas holidays", "school_holiday", "2026-12-23", "2027-01-06"),
  event("Easter holidays", "school_holiday", "2027-03-22", "2027-04-03"),
  event("Additional school-free day", "school_holiday", "2027-05-18", "2027-05-18"),
  event("Summer holidays", "school_holiday", "2027-07-19", "2027-08-31")
];

const context = {
  teamId: "test-team",
  countryCode: "DE",
  federalStateCode: "DE-NW",
  preferences: {
    publicHolidays: "exclude",
    schoolHolidays: "exclude",
    localMovableHolidays: "exclude",
    customExclusions: "exclude"
  },
  events: [
    ...publicHolidaysForGermanState("DE-NW", "2026-09-14", "2027-07-12"),
    ...nrwSchoolHolidays,
    ...suggestedLocalDaysForGermanState("DE-NW", "2026-09-14", "2027-07-12")
  ],
  sourceLabel: "test"
};

test("weekly Monday recurrence creates exactly 44 unique dates", () => {
  const dates = generateTrainingRecurrenceDates(mondaySeriesInput);
  assert.equal(dates.length, 44);
  assert.equal(new Set(dates).size, 44);
  assert.equal(dates[0], "2026-09-14");
  assert.equal(dates.at(-1), "2027-07-12");
});

test("NRW school holiday ranges detect all Monday conflicts", () => {
  const dates = generateTrainingRecurrenceDates(mondaySeriesInput);
  const schoolHolidayMondays = dates.filter((date) =>
    findCalendarConflicts(date, context).some((conflict) => conflict.event.category === "school_holiday")
  );
  assert.deepEqual(schoolHolidayMondays, [
    "2026-10-19",
    "2026-10-26",
    "2026-12-28",
    "2027-01-04",
    "2027-03-22",
    "2027-03-29"
  ]);
});

test("public holidays overlap safely with school holidays", () => {
  const dates = generateTrainingRecurrenceDates(mondaySeriesInput);
  const schoolDates = conflictDateSet(dates, "school_holiday");
  const publicDates = conflictDateSet(dates, "public_holiday");
  assert.equal(schoolDates.size, 6);
  assert(publicDates.has("2027-03-29"));
  assert(publicDates.has("2027-05-17"));
  const excluded = new Set([...schoolDates, ...publicDates]);
  assert.equal(excluded.size, 7);
  assert.equal(dates.length - excluded.size, 37);
});

test("confirmed Rosenmontag is separate from statutory holidays", () => {
  const dates = generateTrainingRecurrenceDates(mondaySeriesInput);
  const schoolDates = conflictDateSet(dates, "school_holiday");
  const publicDates = conflictDateSet(dates, "public_holiday");
  const localDates = conflictDateSet(dates, "local_customary_day");
  assert(localDates.has("2027-02-08"));
  assert(!publicDates.has("2027-02-08"));
  const excluded = new Set([...schoolDates, ...publicDates, ...localDates]);
  assert.equal(dates.length - excluded.size, 36);
});

function conflictDateSet(dates, category) {
  return new Set(
    dates.filter((date) => findCalendarConflicts(date, context).some((conflict) => conflict.event.category === category))
  );
}

function event(name, category, startsOn, endsOn) {
  return {
    id: `${category}-${startsOn}-${name}`,
    name,
    category,
    startsOn,
    endsOn,
    source: "NRW official school holiday data 2026/27",
    confidence: "official",
    excludeByDefault: false
  };
}
