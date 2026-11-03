import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/(app)/squad/players/[id]/page.tsx");
const navigation = read("components/squad/player-hub/player-hub-navigation.tsx");
const preferences = read("components/squad/player-hub/player-header-preferences.tsx");
const periods = read("components/squad/player-hub/player-period-controls.tsx");
const hub = read("lib/squad/player-hub.ts");

for (const tab of ["development", "analytics", "medical", "history", "reviews", "attendance", "notes", "details"]) {
  assert.match(hub, new RegExp(`raw === "${tab}"`), `${tab} remains a supported deep-link tab`);
}

assert.match(navigation, /const primaryItems[\s\S]*"overview"[\s\S]*"development"[\s\S]*"analytics"[\s\S]*"medical"[\s\S]*"history"/, "the five coach-first destinations are primary");
assert.match(navigation, /const secondaryItems[\s\S]*"reviews"[\s\S]*"attendance"[\s\S]*"notes"[\s\S]*"details"/, "secondary destinations are grouped under More");
assert.match(navigation, /activeSecondary[\s\S]*activeSecondary\[locale\]/, "More communicates the active secondary destination");
assert.match(navigation, /min-h-11/, "navigation uses touch-friendly targets");
assert.match(page, /attentionItems\.length \? <AttentionSummaryCard/, "empty attention is hidden");
assert.match(page, /if \(!review\) return null/, "empty conversation card is hidden");
assert.match(page, /summary\.rated > 0 \? <AnalyticsMetricCard/, "rating KPI requires saved rating evidence");
assert.match(page, /summary\.trend\.value !== null \? <AnalyticsMetricCard/, "trend KPI requires an existing trend");
assert.match(page, /hasRelevantAvailability\(hub\) \? <MedicalOverviewCard/, "availability overview appears only when relevant");
assert.doesNotMatch(page, /<PlayerHubTabs/, "the nine-tab navigation is removed");
assert.doesNotMatch(page, /Customize header/, "header customization no longer occupies the profile header");
assert.match(page, /<PlayerHeaderPreferences[\s\S]*preferences=\{hub\.headerPreferences\}/, "saved header preferences remain available under Details");
assert.match(preferences, /savePlayerHeaderPreferences/, "display preferences retain their canonical action");
assert.match(periods, /<select[\s\S]*value=\{period\}/, "period selection uses one compact control");
assert.match(periods, /period === "custom" \?/, "custom date fields render only for a custom period");
assert.match(page, /const primaryFilters: AttendanceFilter\[\][\s\S]*"all"[\s\S]*"present"[\s\S]*"late"[\s\S]*"absent"/, "Attendance keeps four primary filters");
assert.match(page, /const primaryFilters: PlayerTimelineFilter\[\][\s\S]*"all"[\s\S]*"trainings"[\s\S]*"development"[\s\S]*"reviews"[\s\S]*"medical"/, "History keeps the coach-relevant primary filters");
assert.doesNotMatch(page, /function MedicalSection/, "Details no longer duplicates the canonical Availability editor");
assert.match(page, /formatPercent\(summary\.participationRate/, "overview retains canonical Player Hub participationRate");
assert.doesNotMatch(page, /attendanceRate/, "overview does not substitute the generic attendance metric");

console.log("Player Hub 2.0 regression: PASS (deep links, navigation, progressive disclosure, canonical metrics)");
