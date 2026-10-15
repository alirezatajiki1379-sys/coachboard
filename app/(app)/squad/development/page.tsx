import { getActiveLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownAZ, ArrowUpAZ, Search, Target } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { SquadNav } from "@/components/squad/squad-nav";
import {
  developmentGoalCategories,
  developmentGoalPriorities,
  developmentProgressLabel
} from "@/config/development";
import { getDevelopmentOverview, isDevelopmentReviewDue, latestProgressForGoal, type DevelopmentOverviewPlayer } from "@/lib/squad/development";
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
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
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
    <PageContainer width="wide" translate="no">
      <PageHeader eyebrow={ui("Squad")} title={ui("Development")} description={ui("Track player goals, progress updates, observations and review dates for the active Team.")} />
      <SquadNav />

      {stats.playersWithActiveGoals || stats.goalsDueForReview || stats.observationsThisWeek ? (
        <section className="flex flex-wrap gap-2 text-sm font-bold">
          {stats.playersWithActiveGoals ? <Metric label={ui("Players with active Goals")} value={String(stats.playersWithActiveGoals)} /> : null}
          {stats.goalsDueForReview ? <Metric label={ui("Goals due for review")} value={String(stats.goalsDueForReview)} tone="warning" /> : null}
          {stats.observationsThisWeek ? <Metric label={ui("Observations this week")} value={String(stats.observationsThisWeek)} /> : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <form action="/squad/development" className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_auto]">
          <label>
            <span className="text-xs font-bold uppercase text-slate-500">{ui("Search")}</span>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input name="search" defaultValue={filters.search ?? ""} placeholder={ui("Player or goal")} className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </div>
          </label>
          <Select name="status" label={ui("View")} value={filters.status} options={statusFilters} />
          <Select name="category" label={ui("Category")} value={filters.category ?? ""} options={[{ value: "", label: "All categories" }, ...developmentGoalCategories]} />
          <Select name="priority" label={ui("Priority")} value={filters.priority ?? ""} options={[{ value: "", label: "All priorities" }, ...developmentGoalPriorities]} />
          <Select name="review" label={ui("Review")} value={filters.review ?? ""} options={[{ value: "", label: "Any review date" }, { value: "due", label: "Review due" }, { value: "soon", label: "Due soon" }]} />
          <Select name="sort" label={ui("Sort")} value={filters.sort} options={sortOptions} />
          <div className="flex items-end gap-2">
            <input type="hidden" name="direction" value={filters.direction === "asc" ? "asc" : "desc"} />
            <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-board-navy px-4 text-sm font-bold text-white hover:bg-slate-800">{ui("Apply")}</button>
            <Link href="/squad/development" className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200">{ui("Reset")}</Link>
          </div>
        </form>
      </section>

      <section className="hidden overflow-x-auto rounded-lg border border-board-line bg-white shadow-soft lg:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <SortableHead label={ui("Player")} sort="player" filters={filters} />
              <th className="px-4 py-3">{ui("Current focus")}</th>
              <th className="px-4 py-3">{ui("Progress")}</th>
              <th className="px-4 py-3">{ui("Next step")}</th>
              <SortableHead label={ui("Next Review")} sort="nextReview" filters={filters} />
              <th className="px-4 py-3">{ui("Last observation")}</th>
              <th className="px-4 py-3">{ui("Action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-board-line">
            {players.length ? players.map((item) => <DevelopmentRow key={item.player.id} item={item} />) : (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600">{ui("No players match this development view.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 lg:hidden">
        {players.length ? players.map((item) => <DevelopmentCard key={item.player.id} item={item} />) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <Target className="mx-auto h-8 w-8 text-board-green" />
            <h2 className="mt-3 text-lg font-bold text-board-navy">{ui("No players match this view.")}</h2>
            <p className="mt-2 text-sm text-slate-600">{ui("Adjust the filters or open a player profile to create a development goal.")}</p>
            <ButtonLink href="/squad" className="mt-5">{ui("Open players")}</ButtonLink>
          </div>
        )}
      </section>
    </PageContainer>
  );
}

async function DevelopmentRow({ item }: { item: DevelopmentOverviewPlayer }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  const goal = item.primaryActiveGoal;
  const latestProgress = goal ? latestProgressForGoal(goal) : undefined;
  return (
    <tr className="align-top">
      <td className="sticky left-0 bg-white px-4 py-4">
        <Link href={`/squad/players/${item.player.id}?tab=development`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
          {[item.player.firstName, item.player.lastName].filter(Boolean).join(" ")}
        </Link>
        <p className="mt-1 text-xs font-semibold text-slate-500">{item.player.position ?? ui("No position")} · {item.player.playerType === "trial" ? ui("Trial") : ui("Roster")}</p>
      </td>
      <td className="px-4 py-4">
        {goal ? <><p translate="no" className="max-w-60 break-words font-bold text-board-navy [overflow-wrap:anywhere]">{goal.title}</p>{isDevelopmentReviewDue(goal) ? <p className="mt-1 text-xs font-bold text-amber-700">{ui("Review due")}</p> : null}</> : <p className="text-slate-500">{ui("No active goal")}</p>}
      </td>
      <td className="px-4 py-4">
        {goal ? <p className="font-bold text-board-navy">{developmentProgressLabel(latestProgress?.progressLevel ?? goal.progress, locale)}</p> : <span className="text-slate-500">-</span>}
      </td>
      <td translate="no" className="max-w-64 break-words px-4 py-4 text-slate-600 [overflow-wrap:anywhere]">{item.nextAction?.description ?? "-"}</td>
      <td className="px-4 py-4">{item.nextReviewDate ? formatEventDate(item.nextReviewDate, locale) : ui("Not set")}</td>
      <td className="max-w-64 px-4 py-4">{item.latestObservation ? <><span className="text-xs text-slate-500">{formatEventDate(item.latestObservation.observationDate, locale)}</span><p translate="no" className="mt-1 line-clamp-2 break-words text-slate-600 [overflow-wrap:anywhere]">{item.latestObservation.note}</p></> : <span className="text-slate-500">-</span>}</td>
      <td className="px-4 py-4"><ButtonLink href={`/squad/players/${item.player.id}?tab=development`} variant="secondary" className="h-8 px-2 text-xs">{ui("Open Development")}</ButtonLink></td>
    </tr>
  );
}

async function DevelopmentCard({ item }: { item: DevelopmentOverviewPlayer }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  const goal = item.primaryActiveGoal;
  const latestProgress = goal ? latestProgressForGoal(goal) : undefined;
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <Link href={`/squad/players/${item.player.id}?tab=development`} className="text-lg font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
        {[item.player.firstName, item.player.lastName].filter(Boolean).join(" ")}
      </Link>
      <p className="mt-1 text-sm text-slate-600">{item.player.position ?? ui("No position")}</p>
      {goal ? (
        <div className="mt-3 space-y-3 rounded-md bg-board-paper p-3">
          <div><p className="text-xs font-bold uppercase text-slate-500">{ui("Current focus")}</p><p translate="no" className="mt-1 break-words font-bold text-board-navy [overflow-wrap:anywhere]">{goal.title}</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><SmallDetail label={ui("Progress")} value={developmentProgressLabel(latestProgress?.progressLevel ?? goal.progress, locale)} /><SmallDetail label={ui("Next review")} value={item.nextReviewDate ? formatEventDate(item.nextReviewDate, locale) : ui("Not set")} /></div>
          {item.nextAction ? <SmallDetail label={ui("Next step")} value={item.nextAction.description} userContent /> : null}
          {item.latestObservation ? <SmallDetail label={ui("Last observation")} value={`${formatEventDate(item.latestObservation.observationDate, locale)} · ${item.latestObservation.note}`} userContent /> : null}
          {isDevelopmentReviewDue(goal) ? <p className="text-xs font-bold text-amber-700">{ui("Review due")}</p> : null}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-board-line p-3">
          <p className="font-bold text-board-navy">{ui("No active development Goals")}</p>
          <p className="mt-1 text-sm text-slate-600">{ui("Open the player profile to add one observable focus area.")}</p>
        </div>
      )}
      <ButtonLink href={`/squad/players/${item.player.id}?tab=development`} variant="secondary" className="mt-3 h-10 w-full px-3">{ui("Open Development")}</ButtonLink>
    </article>
  );
}

function SmallDetail({ label, value, userContent = false }: { label: string; value: string; userContent?: boolean }) {
  return <div className="min-w-0"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p translate={userContent ? "no" : undefined} className="mt-1 break-words text-sm text-slate-700 [overflow-wrap:anywhere]">{value}</p></div>;
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
      <p className="max-w-48 break-words text-xs font-bold uppercase text-slate-500 [overflow-wrap:anywhere]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

async function Select<T extends string>({ name, label, value, options }: { name: string; label: string; value: string; options: Array<{ value: T; label: string }> }) {
  const ui = createSystemTranslator(await getActiveLocale());
  return (
    <label>
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <select name={name} defaultValue={value} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
        {options.map((option) => <option key={option.value} value={option.value}>{ui(option.label)}</option>)}
      </select>
    </label>
  );
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
