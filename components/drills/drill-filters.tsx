"use client";

import { useEffect, useState } from "react";
import { Filter, Search } from "lucide-react";
import { drillTypes, mainFocuses, trainingBlocks } from "@/config/options";
import { Button, ButtonLink } from "@/components/ui/button";
import type { DrillFilters } from "@/lib/drills/queries";
import { ageFilterOptions } from "@/lib/drills/age-suitability";
import type { Locale } from "@/lib/i18n";

type DrillFiltersProps = {
  filters: DrillFilters;
  locale?: Locale;
};

export function DrillFilters({ filters, locale = "en" }: DrillFiltersProps) {
  const copy = drillFilterCopy[locale];
  const [desktop, setDesktop] = useState(false);
  const [expanded, setExpanded] = useState(() => Boolean(filters.ageGroup || filters.mainFocus || filters.trainingBlock || filters.drillType || filters.subFocus || filters.minPlayers || filters.maxPlayers || filters.minDuration || filters.maxDuration || filters.material || (filters.usage && filters.usage !== "all") || (filters.sort && filters.sort !== "updated")));
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const usageViews = [
    { value: "all", label: copy.usage.all },
    { value: "favorites", label: copy.usage.favorites },
    { value: "recent", label: copy.usage.recent },
    { value: "never", label: copy.usage.never }
  ] as const;

  return (
    <form className="min-w-0 rounded-lg border border-board-line bg-white p-3 shadow-soft sm:p-5">
      <input type="hidden" name="view" value={filters.view} />
      <div className="flex min-w-0 gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">{copy.searchPlaceholder}</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input name="search" defaultValue={filters.search} className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" placeholder={copy.searchPlaceholder} />
        </label>
        <Button type="submit" className="shrink-0 px-3">
          <Filter className="h-4 w-4" />{copy.filter}
        </Button>
      </div>
      <details className="drill-filters mt-3" open={desktop || expanded} onToggle={(event) => { if (!desktop) setExpanded(event.currentTarget.open); }}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-board-navy focus-visible:outline-board-green">{copy.filterOptions}</summary>
      <div className="drill-filter-content">
      <div className="mb-4 flex flex-wrap gap-2" aria-label={copy.usageLabel}>
        {usageViews.map((view) => (
          <label
            key={view.value}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 has-[:focus-visible]:ring-2 has-[:checked]:bg-board-green has-[:checked]:text-white"
          >
            <input type="radio" name="usage" value={view.value} defaultChecked={filters.usage === view.value} className="sr-only" />
            {view.label}
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select name="ageGroup" label={copy.anyAge} value={filters.ageGroup} options={localizeAgeOptions(ageFilterOptions(), locale)} />
        <Select name="mainFocus" label={copy.mainFocus} value={filters.mainFocus} options={mainFocuses} />
        <Select name="trainingBlock" label={copy.block} value={filters.trainingBlock} options={trainingBlocks} />
        <Select name="drillType" label={copy.drillType} value={filters.drillType} options={drillTypes} />
        <Select name="sort" label={copy.sort} value={filters.sort} options={[
          { value: "updated", label: copy.sortOptions.updated },
          { value: "recently_used", label: copy.sortOptions.recentlyUsed },
          { value: "most_used", label: copy.sortOptions.mostUsed },
          { value: "name", label: "Name" },
          { value: "created", label: copy.sortOptions.created },
          { value: "effectiveness", label: copy.sortOptions.effectiveness }
        ]} />

      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Input name="subFocus" label={copy.subFocus} value={filters.subFocus} />
        <Input name="minPlayers" label={copy.minPlayers} value={filters.minPlayers?.toString()} type="number" />
        <Input name="maxPlayers" label={copy.maxPlayers} value={filters.maxPlayers?.toString()} type="number" />
        <Input name="minDuration" label={copy.minDuration} value={filters.minDuration?.toString()} type="number" />
        <Input name="maxDuration" label={copy.maxDuration} value={filters.maxDuration?.toString()} type="number" />
        <Input name="material" label={copy.material} value={filters.material} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <Button type="submit" className="justify-center">{copy.filter}</Button>
        <ButtonLink href="/drills" variant="ghost" className="h-9 justify-center px-3">
          {copy.clearFilters}
        </ButtonLink>
      </div>
      </div>
      </details>
    </form>
  );
}

const drillFilterCopy = {
  en: {
    usageLabel: "Usage views",
    usage: { all: "All Drills", favorites: "Favorites", recent: "Recently used", never: "Never used" },
    searchPlaceholder: "Search title, description, sub focus",
    anyAge: "Any age",
    mainFocus: "Main focus",
    block: "Block",
    drillType: "Drill type",
    sort: "Sort",
    filter: "Filter",
    filterOptions: "Filters and sorting",
    subFocus: "Sub focus",
    minPlayers: "Min players",
    maxPlayers: "Max players",
    minDuration: "Min duration",
    maxDuration: "Max duration",
    material: "Material",
    clearFilters: "Clear filters",
    sortOptions: {
      updated: "Recently updated",
      recentlyUsed: "Recently used",
      mostUsed: "Most used",
      created: "Recently created",
      effectiveness: "Effectiveness"
    }
  },
  de: {
    usageLabel: "Nutzungsansichten",
    usage: { all: "Alle Übungen", favorites: "Favoriten", recent: "Zuletzt genutzt", never: "Noch nie genutzt" },
    searchPlaceholder: "Titel, Beschreibung oder Unterschwerpunkt suchen",
    anyAge: "Alle Altersklassen",
    mainFocus: "Hauptschwerpunkt",
    block: "Block",
    drillType: "Übungstyp",
    sort: "Sortierung",
    filter: "Filtern",
    filterOptions: "Filter und Sortierung",
    subFocus: "Unterschwerpunkt",
    minPlayers: "Min. Spieler",
    maxPlayers: "Max. Spieler",
    minDuration: "Min. Dauer",
    maxDuration: "Max. Dauer",
    material: "Material",
    clearFilters: "Filter zurücksetzen",
    sortOptions: {
      updated: "Zuletzt aktualisiert",
      recentlyUsed: "Zuletzt genutzt",
      mostUsed: "Am häufigsten genutzt",
      created: "Neueste zuerst",
      effectiveness: "Wirksamkeit"
    }
  }
} as const;

function localizeAgeOptions(options: ReturnType<typeof ageFilterOptions>, locale: Locale) {
  if (locale !== "de") return options;
  return options.map((option) => option.label === "All ages" ? { ...option, label: "Alle Altersklassen" } : option);
}

function Select({
  name,
  label,
  value,
  options
}: {
  name: string;
  label: string;
  value?: string;
  options: readonly (string | { value: string; label: string })[];
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
      >
        <option value="">{label}</option>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
          <option key={value} value={value}>
            {optionLabel}
          </option>
          );
        })}
      </select>
    </label>
  );
}

function Input({
  name,
  label,
  value,
  type = "text"
}: {
  name: string;
  label: string;
  value?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        name={name}
        type={type}
        min={type === "number" ? 0 : undefined}
        defaultValue={value}
        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
      />
    </label>
  );
}
