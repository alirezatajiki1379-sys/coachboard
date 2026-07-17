import { Filter, Search } from "lucide-react";
import { ageGroups, drillTypes, mainFocuses, trainingBlocks } from "@/config/options";
import { Button, ButtonLink } from "@/components/ui/button";
import type { DrillFilters } from "@/lib/drills/queries";

type DrillFiltersProps = {
  filters: DrillFilters;
};

export function DrillFilters({ filters }: DrillFiltersProps) {
  return (
    <form className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <input type="hidden" name="view" value={filters.view} />
      <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(4,1fr)_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            name="search"
            defaultValue={filters.search}
            className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            placeholder="Search title, description, sub focus"
          />
        </label>

        <Select name="ageGroup" label="Age group" value={filters.ageGroup} options={ageGroups} />
        <Select name="mainFocus" label="Main focus" value={filters.mainFocus} options={mainFocuses} />
        <Select name="trainingBlock" label="Block" value={filters.trainingBlock} options={trainingBlocks} />
        <Select name="drillType" label="Drill type" value={filters.drillType} options={drillTypes} />

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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="favorites"
            value="true"
            defaultChecked={filters.favorites}
            className="h-4 w-4 rounded border-board-line text-board-green"
          />
          Favorites only
        </label>
        <ButtonLink href="/drills" variant="ghost" className="h-9 justify-center px-3">
          Reset filters
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
  options: readonly string[];
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
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
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
