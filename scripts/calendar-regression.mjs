import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findCalendarConflicts,
  municipalitySpecificPublicHolidayWarningsForGermanState,
  officialSchoolHolidaysForGermanState,
  publicHolidaysForGermanState,
  suggestedLocalDaysForGermanState
} from "../lib/squad/regional-calendar.ts";

test("NRW official school holiday ranges include Christmas 2026/27 across year boundary", () => {
  const holidays = officialSchoolHolidaysForGermanState("DE-NW", "2026-12-01", "2027-01-31");
  const context = contextFor("DE-NW", "2026-12-01", "2027-01-31");

  assert(holidays.some((event) => event.name === "Christmas holidays" && event.startsOn === "2026-12-23" && event.endsOn === "2027-01-06"));
  assert(findCalendarConflicts("2026-12-28", context).some((conflict) => conflict.event.category === "official_school_holiday"));
  assert(findCalendarConflicts("2027-01-04", context).some((conflict) => conflict.event.category === "official_school_holiday"));
});

test("Easter Monday can be both statutory public holiday and official school holiday", () => {
  const context = contextFor("DE-NW", "2027-03-01", "2027-04-30");
  const conflicts = findCalendarConflicts("2027-03-29", context);

  assert(conflicts.some((conflict) => conflict.event.name === "Ostermontag" && conflict.event.category === "statutory_public_holiday"));
  assert(conflicts.some((conflict) => conflict.event.name === "Easter holidays" && conflict.event.category === "official_school_holiday"));
});

test("Rosenmontag is suggested for NRW but is not a statutory public holiday", () => {
  const context = contextFor("DE-NW", "2027-02-01", "2027-02-28");
  const conflicts = findCalendarConflicts("2027-02-08", context);

  assert(conflicts.some((conflict) => conflict.event.name === "Rosenmontag" && conflict.event.category === "movable_school_holiday" && conflict.event.confidence === "suggested"));
  assert(!conflicts.some((conflict) => conflict.event.category === "statutory_public_holiday"));
  assert(!conflicts.some((conflict) => conflict.event.category === "official_school_holiday"));
});

test("Rosenmontag is an official school holiday in selected states where state data covers it", () => {
  for (const stateCode of ["DE-BY", "DE-MV", "DE-SL", "DE-SN"]) {
    const context = contextFor(stateCode, "2027-02-01", "2027-02-28");
    const conflicts = findCalendarConflicts("2027-02-08", context);
    assert(conflicts.some((conflict) => conflict.event.category === "official_school_holiday"), `${stateCode} should have official school holiday on Rosenmontag`);
    assert(!conflicts.some((conflict) => conflict.event.name === "Rosenmontag" && conflict.event.confidence === "suggested"), `${stateCode} should not need a suggested Rosenmontag duplicate`);
  }
});

test("municipality-specific public holidays are not applied statewide without city confirmation", () => {
  const bavariaWithoutCity = municipalitySpecificPublicHolidayWarningsForGermanState("DE-BY", "", "2027-08-01", "2027-08-31");
  const bavariaAugsburg = municipalitySpecificPublicHolidayWarningsForGermanState("DE-BY", "Augsburg", "2027-08-01", "2027-08-31");

  assert(bavariaWithoutCity.some((event) => event.name === "Augsburger Friedensfest may apply regionally" && event.confidence === "suggested"));
  assert(!bavariaWithoutCity.some((event) => event.name === "Augsburger Friedensfest" && event.confidence === "official"));
  assert(bavariaAugsburg.some((event) => event.name === "Augsburger Friedensfest" && event.confidence === "official"));
});

function contextFor(stateCode, startDate, endDate) {
  const publicEvents = publicHolidaysForGermanState(stateCode, startDate, endDate);
  const officialSchoolEvents = officialSchoolHolidaysForGermanState(stateCode, startDate, endDate);
  return {
    countryCode: "DE",
    federalStateCode: stateCode,
    preferences: {
      publicHolidays: "ask",
      schoolHolidays: "ask",
      localMovableHolidays: "ask",
      customExclusions: "exclude"
    },
    events: [
      ...publicEvents,
      ...officialSchoolEvents,
      ...suggestedLocalDaysForGermanState(stateCode, startDate, endDate, officialSchoolEvents)
    ],
    sourceLabel: "calendar regression"
  };
}
