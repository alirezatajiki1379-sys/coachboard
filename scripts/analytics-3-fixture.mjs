import { createPlayerAnalyticsSummary, filterEventsByPeriod, sortPlayerAnalytics } from "../lib/squad/analytics.ts";
import { createTeamAnalytics, parseAnalyticsFilters } from "../lib/squad/analytics-queries.ts";

// Fictional, deterministic evidence. No Supabase calls or personal data.
const stamp = "2026-10-01T00:00:00Z";
const squad = { id: "squad", userId: "coach", name: "Test U15", createdAt: stamp, updatedAt: stamp };
const players = Array.from({ length: 22 }, (_, index) => ({
  id: `player-${index}`, userId: "coach", squadId: squad.id, firstName: index === 0 ? "Alexandermustermannlangname" : `Test ${String(index).padStart(2, "0")}`,
  lastName: "Beispiel", playerType: index > 18 ? "trial" : "roster", position: index % 2 ? "ST" : "GK",
  positionFamilies: [], secondaryPositions: [], preferredPositions: [], onboardingWarnings: [], createdAt: stamp, updatedAt: stamp
}));
const allEvents = Array.from({ length: 12 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, userId: "coach", squadId: squad.id,
  date: `2026-10-${String(index + 1).padStart(2, "0")}`, startTime: "18:00", endTime: "19:30", label: `Training ${index + 1}`,
  status: "completed", focus: "Passing", createdAt: stamp, updatedAt: stamp
}));

export function analyticsFixture(params = {}) {
  const filters = parseAnalyticsFilters(params);
  const scenario = params.scenario ?? "normal";
  const availableEvents = scenario === "empty" ? [] : allEvents;
  const periodEvents = filterEventsByPeriod(availableEvents, filters.period, new Date("2026-11-03T12:00:00Z"), 7, 1, filters.customFrom, filters.customTo)
    .filter((event) => !filters.trainingId || event.id === filters.trainingId);
  const records = periodEvents.flatMap((event, eventIndex) => players.map((player, index) => ({
    id: `${event.id}-${player.id}`, userId: "coach", playerId: player.id, eventId: event.id, event,
    plannedStatus: index === 4 ? "unavailable" : "expected",
    finalStatus: scenario === "missing" && index === 0 ? undefined : index === 1 ? "Z" : index === 2 ? "left_early" : index === 3 ? "absent" : "present",
    actualAbsenceReason: index === 3 ? "excused" : undefined, latePenaltyApplied: false,
    overallRating: scenario === "zero" || index >= 4 || index === 3 ? undefined : 3 + (eventIndex % 3),
    sensitiveNote: false, createdAt: stamp, updatedAt: stamp
  })));
  const ids = new Set(periodEvents.map((event) => event.id));
  const summaries = players.filter((player) => (filters.playerType === "all" || filters.playerType === player.playerType) && (!filters.position || player.position === filters.position))
    .map((player) => createPlayerAnalyticsSummary(player, records, filters.period, undefined, 7, 1, filters.customFrom, filters.customTo, ids))
    .filter((summary) => !filters.ratedOnly || summary.rated > 0);
  const playerIds = new Set(summaries.map((summary) => summary.player.id));
  const drillInstances = periodEvents.map((event) => ({ id: `drill-instance-${event.id}`, event_id: event.id, source_drill_id: "drill-example", title: "Fictional passing practice" }));
  const reviews = scenario === "zero" ? [] : periodEvents.slice(0, 2).map((event) => ({ event_id: event.id, overall_quality: 4, intensity: 3, player_response: 4, objective_outcome: "partly_achieved" }));
  const goals = [{ id: "goal", playerId: players[0].id, category: "technical", status: "in_progress" }];
  const progress = [{ id: "progress", playerId: players[0].id, goalId: "goal", progressLevel: "developing", recordedAt: "2026-10-10" }];
  const drillReviews = scenario === "zero" ? [] : drillInstances.slice(0, 1).map((instance) => ({ session_drill_instance_id: instance.id, effectiveness_rating: 4, feedback_status: "worked_well" }));
  const teamAnalytics = createTeamAnalytics(squad, periodEvents, records, reviews, drillInstances, drillReviews, goals, progress, filters,
    { seasonStartMonth: 7, seasonStartDay: 1 }, records.filter((record) => playerIds.has(record.playerId)));
  return { filters, summaries: sortPlayerAnalytics(summaries, filters.sort, filters.direction), teamAnalytics, availableEvents, positions: ["GK", "ST"] };
}
