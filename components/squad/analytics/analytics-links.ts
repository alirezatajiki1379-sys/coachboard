import { defaultSortDirection, type AnalyticsPeriod, type AnalyticsSection, type AnalyticsPlayerTypeFilter, type AnalyticsSortKey, type AnalyticsSortDirection } from "@/lib/squad/analytics";
import type { AnalyticsFilters } from "@/lib/squad/analytics-queries";

export function hrefFor(filters: {
  period: AnalyticsPeriod;
  section: AnalyticsSection;
  playerType: AnalyticsPlayerTypeFilter;
  position?: string;
  ratedOnly: boolean;
  sort: AnalyticsSortKey;
  direction: AnalyticsSortDirection;
  customFrom?: string;
  customTo?: string;
  trainingId?: string;
}) {
  const params = new URLSearchParams();
  if (filters.period !== "last10") params.set("period", filters.period);
  if (filters.section !== "overview") params.set("section", filters.section);
  if (filters.period === "custom") {
    if (filters.customFrom) params.set("from", formatGermanDate(filters.customFrom));
    if (filters.customTo) params.set("to", formatGermanDate(filters.customTo));
  }
  if (filters.playerType !== "all") params.set("playerType", filters.playerType);
  if (filters.position) params.set("position", filters.position);
  if (filters.trainingId) params.set("training", filters.trainingId);
  if (filters.ratedOnly) params.set("ratedOnly", "true");
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.direction !== defaultSortDirection(filters.sort)) params.set("direction", filters.direction);
  const query = params.toString();
  return query ? `/squad/analysis?${query}` : "/squad/analysis";
}

export function reportHrefFor(filters: AnalyticsFilters) {
  const source = hrefFor(filters);
  const query = source.includes("?") ? source.slice(source.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  params.set("mode", filters.section === "attendance" ? "attendance" : filters.section === "players" ? "performance" : "combined");
  return `/squad/analysis/report?${params.toString()}`;
}

export function formatGermanDate(date?: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}

export function nextSortDirection(currentSort: AnalyticsSortKey, currentDirection: AnalyticsSortDirection, nextSort: AnalyticsSortKey): AnalyticsSortDirection {
  if (currentSort !== nextSort) return defaultSortDirection(nextSort);
  return currentDirection === "asc" ? "desc" : "asc";
}
