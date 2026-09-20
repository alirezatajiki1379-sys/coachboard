import assert from "node:assert/strict";
import test from "node:test";
import { systemText } from "../lib/i18n/system-text.ts";
import { formatDate, formatNumber } from "../lib/i18n/index.ts";
import { trainingSectionLabel, trainingFocusLabel } from "../lib/i18n/training-labels.ts";
import { finalStatusLabel, plannedStatusLabel, actualAbsenceReasonLabel } from "../lib/squad/attendance-format.ts";
import { isExpectedFromPlannedStatus } from "../lib/squad/attendance-utils.ts";
import { formatRating, formatPercent } from "../lib/squad/analytics.ts";
import { developmentCategoryLabel } from "../config/development.ts";
import { localizationInventory } from "./localization-inventory.mjs";

test("reported Analytics and Development labels translate in both directions", () => {
  const labels = {
    "Training Sessions": "Trainingseinheiten", "Training Focus": "Trainingsschwerpunkte",
    Sessions: "Einheiten", Reviewed: "Reflektiert", "Review coverage": "Reflexionsabdeckung",
    Quality: "Qualität", Intensity: "Intensität", "Planned sessions": "Geplante Einheiten",
    Partly: "Teilweise erreicht", "Add development goal": "Entwicklungsziel hinzufügen"
  };
  for (const locale of ["en", "de", "en", "de"]) {
    for (const [en, de] of Object.entries(labels)) assert.equal(systemText(locale, en), locale === "de" ? de : en);
  }
  assert.equal(systemText("de", "No structured focus has been saved for trainings in this period."), "Für die Trainings in diesem Zeitraum wurden noch keine strukturierten Schwerpunkte gespeichert.");
});

test("canonical attendance statuses and absence reasons are language independent", () => {
  for (const locale of ["en", "de"]) {
    assert.equal(plannedStatusLabel("expected", locale), locale === "de" ? "Eingeplant" : "Expected");
    assert.equal(plannedStatusLabel("unavailable", locale), locale === "de" ? "Nicht eingeplant" : "Not expected");
    assert.equal(finalStatusLabel("present", locale), locale === "de" ? "Anwesend" : "Present");
    assert.equal(finalStatusLabel("Z", locale), locale === "de" ? "Verspätet" : "Late");
    assert.equal(finalStatusLabel("absent", locale), locale === "de" ? "Abwesend" : "Absent");
    assert.equal(finalStatusLabel(undefined, locale), locale === "de" ? "Nicht erfasst" : "Not recorded");
    assert.equal(isExpectedFromPlannedStatus({ plannedStatus: "expected" }), true);
    assert.equal(isExpectedFromPlannedStatus({ plannedStatus: "unavailable" }), false);
  }
  for (const [code, de] of Object.entries({ unexcused: "Unentschuldigt", excused: "Entschuldigt", sick: "Krank", injured: "Verletzt", school: "Schule", work: "Arbeit", holiday: "Urlaub", private: "Privat", other: "Sonstiges" })) assert.equal(actualAbsenceReasonLabel(code, "de"), de);
});

test("built-in sections translate without rewriting IDs or custom content", () => {
  assert.equal(trainingSectionLabel("activation", "de"), "Aktivierung");
  assert.equal(trainingSectionLabel("Main part 1", "de"), "Hauptteil 1");
  assert.equal(trainingSectionLabel("Main part 2", "en"), "Main part 2");
  assert.equal(trainingSectionLabel("Coach's own phase", "de"), "Coach's own phase");
  assert.equal(trainingSectionLabel("Activation", "de", true), "Activation");
  assert.equal(trainingFocusLabel("Passing", "de"), "Passspiel");
  assert.equal(trainingFocusLabel("Passing with Amir", "de"), "Passing with Amir");
});

test("dates, decimals, percentages and null ratings respect the active locale", () => {
  assert.equal(formatRating(3.5, "de"), "3,5");
  assert.equal(formatRating(3.5, "en"), "3.5");
  assert.equal(formatRating(null, "de"), "Keine Bewertungen");
  assert.equal(formatRating(null, "en"), "No ratings");
  assert.equal(formatPercent(.75, "de").replace(/\s/g, ""), "75%");
  assert.equal(formatNumber(47.8, "de"), "47,8");
  assert.equal(formatDate("2026-09-19", "de", { day: "2-digit", month: "2-digit", year: "numeric" }), "19.09.2026");
  assert.equal(formatDate("2026-09-19", "en", { day: "2-digit", month: "2-digit", year: "numeric" }), "19/09/2026");
  assert.equal(developmentCategoryLabel("physical", "de"), "Körperlich");
});

test("interpolated user values are never translated", () => {
  assert.equal(systemText("de", "Sort by {label}", { label: "Quality" }), "Nach Quality sortieren");
  assert.equal(systemText("en", "{count} active goals", { count: 2 }), "2 active goals");
  assert.equal(systemText("de", "{count} active goal", { count: 1 }), "1 aktives Entwicklungsziel");
});

test("the route inventory contains actual App Router pages only", () => {
  const { routes, findings } = localizationInventory();
  assert.ok(routes.some(({ route }) => route === "/squad/analysis"));
  assert.ok(routes.some(({ route }) => route === "/trainings/[id]/plan"));
  assert.ok(routes.every(({ file, route }) => file.startsWith("app/") && !route.includes("..")));
  assert.ok(findings.length > 0, "Source inventory must not pretend remaining legacy copy is fully localized.");
});
