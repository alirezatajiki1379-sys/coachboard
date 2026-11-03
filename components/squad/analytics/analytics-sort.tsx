"use client";

import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { AnalyticsFilters } from "@/lib/squad/analytics-queries";
import { analyticsSortOptions } from "./analytics-copy";
import { hrefFor, nextSortDirection } from "./analytics-links";

export function AnalyticsSort({ filters, locale }: { filters: AnalyticsFilters; locale: Locale }) {
  const router = useRouter();
  const label = locale === "de" ? "Sortieren nach" : "Sort by";
  const direction = locale === "de" ? (filters.direction === "asc" ? "Aufsteigend" : "Absteigend") : (filters.direction === "asc" ? "Ascending" : "Descending");
  return <div className="mb-3 flex min-w-0 flex-wrap items-end gap-2" data-analytics-sort>
    <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600 sm:max-w-64">{label}
      <select aria-label={label} value={filters.sort} className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-board-line bg-white px-3 text-sm text-board-navy" onChange={(event) => {
        const sort = analyticsSortOptions[locale].find((option) => option.id === event.target.value)?.id;
        if (sort) router.push(hrefFor({ ...filters, sort, direction: nextSortDirection(filters.sort, filters.direction, sort) }));
      }}>{analyticsSortOptions[locale].map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </label>
    <button type="button" title={direction} aria-label={direction} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-board-line bg-white hover:bg-slate-50" onClick={() => router.push(hrefFor({ ...filters, direction: filters.direction === "asc" ? "desc" : "asc" }))}>
      {filters.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
    </button>
  </div>;
}
