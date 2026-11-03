import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseAnalyticsFilters } from "../lib/squad/analytics-queries.ts";
import { hrefFor, reportHrefFor, nextSortDirection } from "../components/squad/analytics/analytics-links.ts";
import { analyticsSortOptions } from "../components/squad/analytics/analytics-copy.ts";
import { analyticsFixture } from "./analytics-3-fixture.mjs";

test("all existing sections and filters round-trip using canonical query parsing", () => {
  for (const section of ["overview", "players", "training", "attendance", "development", "drills"]) {
    const filters = parseAnalyticsFilters({ section, period: "custom", from: "01.10.2026", to: "31.10.2026", playerType: "trial", position: "ST", ratedOnly: "true", sort: "average", direction: "desc", training: "10000000-0000-4000-8000-000000000001" });
    assert.deepEqual(parseAnalyticsFilters(Object.fromEntries(new URL(hrefFor(filters), "https://test.invalid").searchParams)), filters);
    const report = new URL(reportHrefFor(filters), "https://test.invalid");
    assert.equal(report.pathname, "/squad/analysis/report");
    assert.equal(report.searchParams.get("from"), "01.10.2026");
    assert.equal(report.searchParams.get("to"), "31.10.2026");
    assert.equal(report.searchParams.get("playerType"), "trial");
    assert.equal(report.searchParams.get("position"), "ST");
    assert.equal(report.searchParams.get("ratedOnly"), "true");
  }
});

test("all 14 sortable dimensions remain accessible in both locales", () => {
  const ids = ["name", "position", "status", "trainings", "rated", "ratingCoverage", "average", "latestFive", "trend", "attendance", "reliability", "lastTraining", "evidence", "coachAssessment"].sort();
  for (const locale of ["de", "en"]) {
    assert.deepEqual(analyticsSortOptions[locale].map((item) => item.id).sort(), ids);
    for (const sort of ids) {
      assert.equal(nextSortDirection(sort, "asc", sort), "desc");
      assert.equal(nextSortDirection(sort, "desc", sort), "asc");
    }
  }
});

test("zero ratings preserve complete attendance and null performance evidence", () => {
  const a = analyticsFixture({ period: "all", scenario: "zero" }).teamAnalytics;
  assert.equal(a.trainingSessions, 12);
  assert.equal(a.notRecorded, 0);
  assert.equal(a.dataCoverageRate, 1);
  assert.equal(a.totalRatedPerformances, 0);
  assert.equal(a.teamAverageOverallRating, null);
});

test("filtered player evidence retains event-level training totals", () => {
  const result = analyticsFixture({ period: "all", playerType: "trial", position: "ST" });
  assert.ok(result.summaries.length > 0);
  assert.ok(result.summaries.every((summary) => summary.player.playerType === "trial" && summary.player.position === "ST"));
  assert.equal(result.teamAnalytics.trainingSessions, 12);
  assert.equal(result.teamAnalytics.participantRecordCount, result.summaries.length * 12);
});

test("null ratings stay separate from numeric ratings in both sort directions", () => {
  for (const direction of ["asc", "desc"]) {
    const { summaries } = analyticsFixture({ period: "all", sort: "average", direction });
    const firstUnrated = summaries.findIndex((summary) => summary.averageRating === null);
    assert.ok(firstUnrated > 0);
    assert.ok(summaries.slice(firstUnrated).every((summary) => summary.averageRating === null));
    assert.ok(summaries.slice(0, firstUnrated).every((summary) => summary.averageRating >= 1));
  }
});

test("presentation no longer derives optional rating debt or calls the Action Center", () => {
  for (const name of ["analytics-primary-summary.tsx", "analytics/analytics-detail-sections.tsx", "analytics/analytics-overview.tsx"]) {
    const source = readFileSync(new URL(`../components/squad/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /missingRatings|ratingsComplete|href=["']\/actions|Bewertungen (offen|fehlen)/);
  }
});
