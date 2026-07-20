import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Search, Target } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { SquadNav } from "@/components/squad/squad-nav";
import {
  developmentCategoryLabel,
  developmentGoalCategories,
  developmentGoalPriorities,
  developmentGoalStatuses,
  developmentPriorityLabel,
  developmentProgressLabel,
  developmentStatusLabel
} from "@/config/development";
import { getDevelopmentOverview } from "@/lib/squad/development";
import { formatEventDate } from "@/lib/squad/attendance-format";
import { createClient } from "@/lib/supabase/server";

type DevelopmentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SquadDevelopmentPage({ searchParams }: DevelopmentPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const filters = {
    search: one(params.search),
    status: one(params.status),
    category: one(params.category),
    priority: one(params.priority),
    review: one(params.review)
  };
  const { goals, stats } = await getDevelopmentOverview(supabase, user.id, filters);

  return (
    <PageContainer width="wide">
      <PageHeader eyebrow="Squad" title="Development" description="Track player goals, actions, observations and review dates." />
      <SquadNav />

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Players to review" value={String(stats.playersNeedingReview)} />
        <Metric label="High priority active goals" value={String(stats.activeHighPriorityGoals)} />
        <Metric label="Observations this week" value={String(stats.observationsThisWeek)} />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <form action="/squad/development" className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]">
          <label>
            <span className="text-xs font-bold uppercase text-slate-500">Search</span>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input name="search" defaultValue={filters.search ?? ""} placeholder="Player or goal" className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </div>
          </label>
          <Select name="status" label="Status" value={filters.status} options={developmentGoalStatuses} emptyLabel="All statuses" />
          <Select name="category" label="Category" value={filters.category} options={developmentGoalCategories} emptyLabel="All categories" />
          <Select name="priority" label="Priority" value={filters.priority} options={developmentGoalPriorities} emptyLabel="All priorities" />
          <label>
            <span className="text-xs font-bold uppercase text-slate-500">Review</span>
            <select name="review" defaultValue={filters.review ?? ""} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
              <option value="">Any review date</option>
              <option value="overdue">Review overdue</option>
              <option value="month">Review this month</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-board-navy px-4 text-sm font-bold text-white hover:bg-slate-800">Apply</button>
            <Link href="/squad/development" className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200">Reset</Link>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        {goals.length ? goals.map((item) => (
          <article key={item.goal.id} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <Link href={`/squad/players/${item.goal.playerId}`} className="text-lg font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
                  {item.playerName || "Player"}
                </Link>
                <p className="mt-1 text-sm text-slate-600">{item.playerPosition ?? "No position"} · {item.playerType === "trial" ? "Trial player" : "Roster"}</p>
                <h2 className="mt-3 font-bold text-board-navy">{item.goal.title}</h2>
                {item.goal.description ? <p className="mt-1 text-sm text-slate-600">{item.goal.description}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold md:justify-end">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{developmentCategoryLabel(item.goal.category)}</span>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{developmentPriorityLabel(item.goal.priority)}</span>
                <span className="rounded-full bg-green-50 px-2 py-1 text-green-700">{developmentStatusLabel(item.goal.status)}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-4">
              <Mini label="Progress" value={developmentProgressLabel(item.goal.progress)} />
              <Mini label="Started" value={formatEventDate(item.goal.startDate)} />
              <Mini label="Review" value={item.goal.reviewDate ? formatEventDate(item.goal.reviewDate) : "Not set"} />
              <Mini label="Target" value={item.goal.targetDate ? formatEventDate(item.goal.targetDate) : "Not set"} />
            </div>
          </article>
        )) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <Target className="mx-auto h-8 w-8 text-board-green" />
            <h2 className="mt-3 text-lg font-bold text-board-navy">No development goals found.</h2>
            <p className="mt-2 text-sm text-slate-600">Open a player profile and create the first development goal.</p>
            <ButtonLink href="/squad" className="mt-5">Open players</ButtonLink>
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><ClipboardCheck className="h-4 w-4" />{label}</p>
      <p className="mt-2 text-2xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-board-navy">{value}</p>
    </div>
  );
}

function Select<T extends string>({ name, label, value, options, emptyLabel }: { name: string; label: string; value?: string; options: Array<{ value: T; label: string }>; emptyLabel: string }) {
  return (
    <label>
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
        <option value="">{emptyLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
