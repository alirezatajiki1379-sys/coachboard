import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownAZ, ArrowUpAZ, ClipboardCheck, Search, Target } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { SquadNav } from "@/components/squad/squad-nav";
import {
  developmentGoalCategories,
  developmentGoalPriorities,
  developmentProgressLabel
} from "@/config/development";
import { getDevelopmentOverview, type DevelopmentOverviewPlayer } from "@/lib/squad/development";
import { formatEventDate } from "@/lib/squad/attendance-format";
import { createClient } from "@/lib/supabase/server";

type DevelopmentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusFilters = [
  { value: "all", label: "All Players" },
  { value: "active", label: "Active Goals" },
  { value: "none", label: "No active Goals" },
  { value: "identified", label: "Identified" },
  { value: "in_progress", label: "In progress" },
  { value: "achieved", label: "Achieved" },
  { value: "paused", label: "Paused" }
];

const sortOptions = [
  { value: "player", label: "Player" },
  { value: "nextReview", label: "Next Review" },
  { value: "lastUpdate", label: "Last Update" },
  { value: "goals", label: "Active Goal count" },
  { value: "priority", label: "Priority" }
];

export default async function SquadDevelopmentPage({ searchParams }: DevelopmentPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const filters = {
    search: one(params.search),
    status: one(params.status) || "all",
    category: one(params.category),
    priority: one(params.priority),
    review: one(params.review),
    sort: one(params.sort) || "nextReview",
    direction: one(params.direction) || "asc"
  };
  const { players, stats } = await getDevelopmentOverview(supabase, user.id, filters);

  return (
    <PageContainer width="wide">
      <PageHeader eyebrow="Squad" title="Development" description="Track player goals, progress updates, observations and review dates for the active Team." />
      <SquadNav />

      <section className="flex flex-wrap gap-2 text-sm font-bold">
        <Metric label="Players" value={String(stats.playersTotal)} />
        <Metric label="With active Goals" value={String(stats.playersWithActiveGoals)} />
        <Metric label="Without active Goals" value={String(stats.playersWithoutActiveGoals)} />
        <Metric label="Goals due for review" value={String(stats.goalsDueForReview)} tone={stats.goalsDueForReview ? "warning" : "normal"} />
        <Metric label="High priority Goals" value={String(stats.activeHighPriorityGoals)} />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <form action="/squad/development" className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_auto]">
          <label>
            <span className="text-xs font-bold uppercase text-slate-500">Search</span>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input name="search" defaultValue={filters.search ?? ""} placeholder="Player or goal" className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </div>
          </label>
          <Select name="status" label="View" value={filters.status} options={statusFilters} />
          <Select name="category" label="Category" value={filters.category ?? ""} options={[{ value: "", label: "All categories" }, ...developmentGoalCategories]} />
          <Select name="priority" label="Priority" value={filters.priority ?? ""} options={[{ value: "", label: "All priorities" }, ...developmentGoalPriorities]} />
          <Select name="review" label="Review" value={filters.review ?? ""} options={[{ value: "", label: "Any review date" }, { value: "due", label: "Review due" }, { value: "soon", label: "Due soon" }]} />
          <Select name="sort" label="Sort" value={filters.sort} options={sortOptions} />
          <div className="flex items-end gap-2">
            <input type="hidden" name="direction" value={filters.direction === "asc" ? "asc" : "desc"} />
            <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-board-navy px-4 text-sm font-bold text-white hover:bg-slate-800">Apply</button>
            <Link href="/squad/development" className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200">Reset</Link>
          </div>
        </form>
      </section>

      <section className="hidden overflow-x-auto rounded-lg border border-board-line bg-white shadow-soft lg:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <SortableHead label="Player" sort="player" filters={filters} />
              <SortableHead label="Active Goals" sort="goals" filters={filters} />
              <SortableHead label="High Priority" sort="priority" filters={filters} />
              <th className="px-4 py-3">Latest Progress</th>
              <SortableHead label="Next Review" sort="nextReview" filters={filters} />
              <SortableHead label="Last Update" sort="lastUpdate" filters={filters} />
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-board-line">
            {players.length ? players.map((item) => <DevelopmentRow key={item.player.id} item={item} />) : (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600">No players match this development view.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 lg:hidden">
        {players.length ? players.map((item) => <DevelopmentCard key={item.player.id} item={item} />) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <Target className="mx-auto h-8 w-8 text-board-green" />
            <h2 className="mt-3 text-lg font-bold text-board-navy">No players match this view.</h2>
            <p className="mt-2 text-sm text-slate-600">Adjust the filters or open a player profile to create a development goal.</p>
            <ButtonLink href="/squad" className="mt-5">Open players</ButtonLink>
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function DevelopmentRow({ item }: { item: DevelopmentOverviewPlayer }) {
  const latestGoal = item.latestGoal;
  const latestProgress = item.latestProgress;
  return (
    <tr className="align-top">
      <td className="sticky left-0 bg-white px-4 py-4">
        <Link href={`/squad/players/${item.player.id}?tab=development`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
          {[item.player.firstName, item.player.lastName].filter(Boolean).join(" ")}
        </Link>
        <p className="mt-1 text-xs font-semibold text-slate-500">{item.player.position ?? "No position"} · {item.player.playerType === "trial" ? "Trial" : "Roster"}</p>
      </td>
      <td className="px-4 py-4">
        <p className="font-bold text-board-navy">{item.activeGoals.length}</p>
        {latestGoal ? <p className="mt-1 line-clamp-2 text-xs text-slate-600">{latestGoal.title}</p> : <p className="mt-1 text-xs text-slate-500">No active development Goals</p>}
      </td>
      <td className="px-4 py-4 font-bold text-board-navy">{item.highPriorityGoalCount}</td>
      <td className="px-4 py-4">
        {latestProgress ? (
          <>
            <p className="font-bold text-board-navy">{developmentProgressLabel(latestProgress.progressLevel)}</p>
            <p className="mt-1 line-clamp-2 text-xs text-slate-600">{latestProgress.note}</p>
          </>
        ) : latestGoal ? (
          <p className="font-bold text-board-navy">{developmentProgressLabel(latestGoal.progress)}</p>
        ) : (
          <span className="text-slate-500">-</span>
        )}
      </td>
      <td className="px-4 py-4">{item.nextReviewDate ? formatEventDate(item.nextReviewDate) : "Not set"}</td>
      <td className="px-4 py-4">{item.lastDevelopmentUpdate ? formatEventDate(item.lastDevelopmentUpdate) : "No update"}</td>
      <td className="px-4 py-4"><ButtonLink href={`/squad/players/${item.player.id}?tab=development`} variant="secondary" className="h-8 px-2 text-xs">Open Development</ButtonLink></td>
    </tr>
  );
}

function DevelopmentCard({ item }: { item: DevelopmentOverviewPlayer }) {
  const latestGoal = item.latestGoal;
  const latestProgress = item.latestProgress;
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <Link href={`/squad/players/${item.player.id}?tab=development`} className="text-lg font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
        {[item.player.firstName, item.player.lastName].filter(Boolean).join(" ")}
      </Link>
      <p className="mt-1 text-sm text-slate-600">{item.player.position ?? "No position"}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{item.activeGoals.length} active Goals</span>
        <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{item.highPriorityGoalCount} high priority</span>
      </div>
      {latestGoal ? (
        <div className="mt-3 rounded-md bg-board-paper p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Latest</p>
          <p className="mt-1 font-bold text-board-navy">{latestGoal.title}</p>
          <p className="mt-1 text-sm text-slate-600">{latestProgress ? developmentProgressLabel(latestProgress.progressLevel) : developmentProgressLabel(latestGoal.progress)}</p>
          <p className="mt-1 text-xs text-slate-500">Next review: {item.nextReviewDate ? formatEventDate(item.nextReviewDate) : "Not set"}</p>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-board-line p-3">
          <p className="font-bold text-board-navy">No active development Goals</p>
          <p className="mt-1 text-sm text-slate-600">Open the player profile to add one observable focus area.</p>
        </div>
      )}
    </article>
  );
}

function SortableHead({ label, sort, filters }: { label: string; sort: string; filters: Record<string, string | undefined> }) {
  const active = filters.sort === sort;
  const nextDirection = active && filters.direction !== "desc" ? "desc" : "asc";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, sort, direction: nextDirection })) {
    if (value && value !== "all") params.set(key, value);
  }
  return (
    <th className="px-4 py-3">
      <Link href={`/squad/development?${params.toString()}`} className="inline-flex items-center gap-1 hover:text-board-green">
        {label}
        {active ? (filters.direction === "desc" ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />) : null}
      </Link>
    </th>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warning" }) {
  return (
    <div className={`rounded-lg border px-4 py-3 shadow-soft ${tone === "warning" ? "border-amber-200 bg-amber-50" : "border-board-line bg-white"}`}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><ClipboardCheck className="h-4 w-4" />{label}</p>
      <p className="mt-1 text-2xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

function Select<T extends string>({ name, label, value, options }: { name: string; label: string; value: string; options: Array<{ value: T; label: string }> }) {
  return (
    <label>
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <select name={name} defaultValue={value} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
