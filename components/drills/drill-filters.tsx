import { Filter, Search } from "lucide-react";
import { drillTypes, mainFocuses, trainingBlocks } from "@/config/options";
import { Button, ButtonLink } from "@/components/ui/button";
import type { DrillFilters } from "@/lib/drills/queries";
import { ageFilterOptions } from "@/lib/drills/age-suitability";

type DrillFiltersProps = {
  filters: DrillFilters;
};

export function DrillFilters({ filters }: DrillFiltersProps) {
  const usageViews = [
    { value: "all", label: "All Drills" },
    { value: "favorites", label: "Favorites" },
    { value: "recent", label: "Recently used" },
    { value: "never", label: "Never used" }
  ] as const;

  return (
    <form className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <input type="hidden" name="view" value={filters.view} />
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Usage views">
        {usageViews.map((view) => (
          <label
            key={view.value}
            className={`cursor-pointer rounded-md px-3 py-2 text-sm font-semibold transition ${
              filters.usage === view.value ? "bg-board-green text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-board-navy"
            }`}
          >
            <input type="radio" name="usage" value={view.value} defaultChecked={filters.usage === view.value} className="sr-only" />
            {view.label}
          </label>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(5,1fr)_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            name="search"
            defaultValue={filters.search}
            className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            placeholder="Search title, description, sub focus"
          />
        </label>

        <Select name="ageGroup" label="Any age" value={filters.ageGroup} options={ageFilterOptions()} />
        <Select name="mainFocus" label="Main focus" value={filters.mainFocus} options={mainFocuses} />
        <Select name="trainingBlock" label="Block" value={filters.trainingBlock} options={trainingBlocks} />
        <Select name="drillType" label="Drill type" value={filters.drillType} options={drillTypes} />
        <Select name="sort" label="Sort" value={filters.sort} options={[
          { value: "updated", label: "Recently updated" },
          { value: "recently_used", label: "Recently used" },
          { value: "most_used", label: "Most used" },
          { value: "name", label: "Name" },
          { value: "created", label: "Recently created" },
          { value: "effectiveness", label: "Effectiveness" }
        ]} />

        <Button type="submit" className="h-10 justify-center">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-6">
        <Input name="subFocus" label="Sub focus" value={filters.subFocus} />
        <Input name="minPlayers" label="Min players" value={filters.minPlayers?.toString()} type="number" />
        <Input name="maxPlayers" label="Max players" value={filters.maxPlayers?.toString()} type="number" />
        <Input name="minDuration" label="Min duration" value={filters.minDuration?.toString()} type="number" />
        <Input name="maxDuration" label="Max duration" value={filters.maxDuration?.toString()} type="number" />
        <Input name="material" label="Material" value={filters.material} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <ButtonLink href="/drills" variant="ghost" className="h-9 justify-center px-3">
          Clear filters
        </ButtonLink>
      </div>
    </form>
  );
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
