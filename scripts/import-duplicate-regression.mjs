import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReviewedRows } from "../lib/squad/importer.ts";

const headers = ["First name", "Last name", "Date of birth"];
const mappings = [
  { source: "First name", field: "firstName", confidence: "high" },
  { source: "Last name", field: "lastName", confidence: "high" },
  { source: "Date of birth", field: "dateOfBirth", confidence: "high" }
];

function player(overrides) {
  return {
    id: overrides.id,
    userId: "user-1",
    squadId: overrides.squadId,
    playerType: "roster",
    firstName: overrides.firstName,
    lastName: overrides.lastName,
    dateOfBirth: overrides.dateOfBirth,
    secondaryPositions: [],
    preferredPositions: [],
    onboardingWarnings: [],
    archivedAt: overrides.archivedAt,
    deletedAt: overrides.deletedAt,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function uniqueImportRows(count) {
  return Array.from({ length: count }, (_, index) => [`First${index + 1}`, `Last${index + 1}`, `01.01.${2010 + index}`]);
}

const emptyContext = {
  activeTeamPlayers: [],
  archivedTeamPlayers: [],
  trashedTeamPlayers: [],
  legacyPlayers: [],
  otherTeamPlayers: []
};

test("empty active squad with unique import rows creates all rows without duplicates", () => {
  const rows = buildReviewedRows(headers, uniqueImportRows(20), mappings, emptyContext);
  assert.equal(rows.length, 20);
  assert.equal(rows.filter((row) => row.operation === "create").length, 20);
  assert.equal(rows.filter((row) => row.duplicateMatches.length).length, 0);
  assert.equal(rows.filter((row) => row.duplicateMatches.some((match) => match.source === "active_team_player")).length, 0);
});

test("trashed current-team players are labelled as trash matches, not active duplicates", () => {
  const rows = buildReviewedRows(headers, [["Max", "Mustermann", "01.01.2012"]], mappings, {
    ...emptyContext,
    trashedTeamPlayers: [player({ id: "trash-1", squadId: "team-a", firstName: "Max", lastName: "Mustermann", dateOfBirth: "2012-01-01", deletedAt: "2026-01-01T00:00:00.000Z" })]
  });
  assert.equal(rows[0].operation, "create");
  assert.equal(rows[0].duplicateMatches[0]?.source, "trashed_team_player");
  assert.equal(rows[0].duplicateMatches.some((match) => match.source === "active_team_player"), false);
});

test("legacy no-team players are labelled separately and do not become active duplicates", () => {
  const rows = buildReviewedRows(headers, [["Max", "Mustermann", "01.01.2012"]], mappings, {
    ...emptyContext,
    legacyPlayers: [player({ id: "legacy-1", firstName: "Max", lastName: "Mustermann", dateOfBirth: "2012-01-01" })]
  });
  assert.equal(rows[0].operation, "create");
  assert.equal(rows[0].duplicatePlayerId, undefined);
  assert.equal(rows[0].duplicateMatches[0]?.source, "legacy_player");
});

test("other-team players are labelled separately and do not become current-team updates", () => {
  const rows = buildReviewedRows(headers, [["Max", "Mustermann", "01.01.2012"]], mappings, {
    ...emptyContext,
    otherTeamPlayers: [player({ id: "other-1", squadId: "team-b", firstName: "Max", lastName: "Mustermann", dateOfBirth: "2012-01-01" })]
  });
  assert.equal(rows[0].operation, "create");
  assert.equal(rows[0].duplicatePlayerId, undefined);
  assert.equal(rows[0].duplicateMatches[0]?.source, "other_team_player");
});

test("duplicate rows inside the imported file are not existing-player duplicates", () => {
  const rows = buildReviewedRows(headers, [["Max", "Mustermann", "01.01.2012"], ["Max", "Mustermann", "01.01.2012"]], mappings, emptyContext);
  assert.equal(rows[0].duplicateMatches.length, 0);
  assert.equal(rows[1].duplicateMatches[0]?.source, "duplicate_import_row");
  assert.equal(rows[1].duplicateMatches.some((match) => match.source === "active_team_player"), false);
});

test("one imported row with no existing players is not compared against itself", () => {
  const rows = buildReviewedRows(headers, [["Solo", "Player", "01.01.2012"]], mappings, emptyContext);
  assert.equal(rows[0].operation, "create");
  assert.equal(rows[0].duplicateMatches.length, 0);
});
