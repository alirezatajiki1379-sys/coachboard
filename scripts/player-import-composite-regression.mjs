import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReviewedRows, suggestColumnMapping, valueOf } from "../lib/squad/importer.ts";

const headers = [
  "Nachname",
  "Vorname",
  "Straße",
  "PLZ",
  "Ort",
  "Geb.",
  "Verein",
  "Telefon privat",
  "E-Mail",
  "2. E-Mail",
  "Eintritt ins TFP",
  "Gesichtet bei",
  "Stützpunkt",
  "Austritt",
  "Austrittsgrund",
  "Datum letzte Leistungsbewertung",
  "Links",
  "Rechts",
  "Abwehr",
  "Mittelfeld",
  "Angriff",
  "Torwart",
  "Größe",
  "Gewicht",
  "Entfernung"
];

const mappings = headers.map(suggestColumnMapping);

const row = [
  "Muster",
  "Mina",
  "Albert-Einstein-Straße 20",
  "'01234",
  "Monheim",
  "04.09.2012",
  "SPORTCLUB GERMANIA REUSRATH 1913 E.V.",
  "'017657910844",
  "mina@example.test",
  "familie@example.test",
  "01.07.2024",
  "Talentsichtungstag",
  "Solingen",
  "",
  "",
  "",
  "X",
  "",
  "X",
  "X",
  "",
  "",
  "166,4",
  "47,8",
  "15"
];

test("real German CSV headers auto-map to composite CoachBoard fields", () => {
  assert.equal(fieldFor("Straße"), "addressStreet");
  assert.equal(fieldFor("PLZ"), "addressPostalCode");
  assert.equal(fieldFor("Ort"), "addressCity");
  assert.equal(fieldFor("Vorname"), "firstName");
  assert.equal(fieldFor("Nachname"), "lastName");
  assert.equal(fieldFor("Telefon privat"), "playerPhone");
  assert.equal(fieldFor("2. E-Mail"), "secondaryEmail");
  assert.equal(fieldFor("Links"), "dominantFootLeftMarker");
  assert.equal(fieldFor("Abwehr"), "positionFamilyDefensive");
  assert.equal(fieldFor("Torwart"), "positionFamilyGoalkeeper");
});

test("German player CSV values normalize without destructive numeric conversion", () => {
  const [reviewed] = buildReviewedRows(headers, [row], mappings, []);
  assert.equal(valueOf(reviewed.values.firstName), "Mina");
  assert.equal(valueOf(reviewed.values.lastName), "Muster");
  assert.equal(valueOf(reviewed.values.dateOfBirth), "2012-09-04");
  assert.equal(valueOf(reviewed.values.addressStreet), "Albert-Einstein-Straße 20");
  assert.equal(valueOf(reviewed.values.addressPostalCode), "01234");
  assert.equal(valueOf(reviewed.values.addressCity), "Monheim");
  assert.equal(valueOf(reviewed.values.playerPhone), "017657910844");
  assert.equal(valueOf(reviewed.values.heightCm), "166.4");
  assert.equal(valueOf(reviewed.values.weightKg), "47.8");
  assert.equal(valueOf(reviewed.values.strongFoot), "left");
  assert.equal(valueOf(reviewed.values.positionFamilies), "Defensive, Midfield");
  assert.equal(valueOf(reviewed.values.position), "");
});

test("goalkeeper marker can derive exact GK but outfield families are not guessed", () => {
  const goalkeeperRow = [...row];
  goalkeeperRow[16] = "";
  goalkeeperRow[18] = "";
  goalkeeperRow[19] = "";
  goalkeeperRow[21] = "X";
  const [reviewed] = buildReviewedRows(headers, [goalkeeperRow], mappings, []);
  assert.equal(valueOf(reviewed.values.positionFamilies), "Goalkeeper");
  assert.equal(valueOf(reviewed.values.position), "GK");
});

function fieldFor(header) {
  return mappings[headers.indexOf(header)]?.field;
}
