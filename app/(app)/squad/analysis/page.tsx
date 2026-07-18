import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Info, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SquadNav } from "@/components/squad/squad-nav";
import {
  analyticsPeriodLabels,
  coachAssessmentLabels,
  evidenceBadgeTone,
  formatPercent,
  formatRating,
  playerName,
  type AnalyticsPeriod,
  type AnalyticsPlayerTypeFilter,
  type AnalyticsSortKey,
  type PlayerAnalyticsSummary
} from "@/lib/squad/analytics";
import { getSquadAnalyticsOverview, parseAnalyticsFilters } from "@/lib/squad/analytics-queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type AnalysisPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const playerTypeOptions: Array<{ id: AnalyticsPlayerTypeFilter; label: string }> = [
  { id: "all", label: "All players" },
  { id: "roster", label: "Roster players" },
  { id: "trial", label: "Trial players" }
];

const sortOptions: Array<{ id: AnalyticsSortKey; label: string }> = [
  { id: "name", label: "Name" },
  { id: "position", label: "Position" },
  { id: "trainings", label: "Trainings" },
  { id: "rated", label: "Rated" },
  { id: "average", label: "Average" },
  { id: "trend", label: "Trend" },
  { id: "attendance", label: "Attendance" },
  { id: "reliability", label: "Reliability" },
  { id: "lastTraining", label: "Last training" }
];

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { summaries, positions } = await getSquadAnalyticsOverview(supabase, user.id, filters);
  const totalTrainings = summaries.reduce((sum, summary) => sum + summary.trainings, 0);
  const totalRated = summaries.reduce((sum, summary) => sum + summary.rated, 0);
  const averageAttendance = summaries.length
    ? summaries.reduce((sum, summary) => sum + (summary.attendanceRate ?? 0), 0) / summaries.filter((summary) => summary.attendanceRate !== null).length
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Analytics</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Review attendance, ratings, reliability and coach assessments. CoachBoard summarizes available data without making squad decisions for you.
          </p>
        </div>
        <ButtonLink href="#analytics-help" variant="secondary" className="justify-center">
          <Info className="h-4 w-4" />
          How analytics are calculated
        </ButtonLink>
      </div>

      <SquadNav />

      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <FilterGroup label="Period">
            {(Object.keys(analyticsPeriodLabels) as AnalyticsPeriod[]).map((period) => (
              <FilterLink key={period} href={hrefFor({ ...filters, period })} active={filters.period === period}>
                {analyticsPeriodLabels[period]}
              </FilterLink>
            ))}
          </FilterGroup>
          <FilterGroup label="Players">
            {playerTypeOptions.map((option) => (
              <FilterLink key={option.id} href={hrefFor({ ...filters, playerType: option.id })} active={filters.playerType === option.id}>
                {option.label}
              </FilterLink>
            ))}
            <FilterLink href={hrefFor({ ...filters, ratedOnly: !filters.ratedOnly })} active={filters.ratedOnly}>
              Rated only
            </FilterLink>
          </FilterGroup>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <FilterGroup label="Position">
            <FilterLink href={hrefFor({ ...filters, position: undefined })} active={!filters.position}>All positions</FilterLink>
            {positions.map((position) => (
              <FilterLink key={position} href={hrefFor({ ...filters, position })} active={filters.position === position}>
                {position}
              </FilterLink>
            ))}
          </FilterGroup>
          <FilterGroup label="Sort">
            {sortOptions.map((option) => (
              <FilterLink key={option.id} href={hrefFor({ ...filters, sort: option.id })} active={filters.sort === option.id}>
                {option.label}
              </FilterLink>
            ))}
          </FilterGroup>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Players shown" value={String(summaries.length)} />
        <Metric label="Training records" value={String(totalTrainings)} />
        <Metric label="Rated trainings" value={String(totalRated)} />
        <Metric label="Avg attendance" value={formatPercent(Number.isFinite(averageAttendance ?? Number.NaN) ? averageAttendance : null)} />
      </section>

      <section className="space-y-4">
        {summaries.length ? (
          summaries.map((summary) => <PlayerAnalyticsCard key={summary.player.id} summary={summary} />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No training data yet.</h2>
            <p className="mt-2 text-sm text-slate-600">Create or complete trainings to build the player overview.</p>
            <ButtonLink href="/trainings/new" className="mt-5">Create training</ButtonLink>
          </div>
        )}
      </section>

      <section id="analytics-help" className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Info className="h-5 w-5" />How analytics are calculated</h2>
        <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-600 md:grid-cols-2">
          <p><strong className="text-board-navy">Average rating:</strong> only final overall ratings intentionally entered by the coach. Unrated trainings are not counted as 3.</p>
          <p><strong className="text-board-navy">Trend:</strong> latest five rated trainings compared with the five rated trainings before them, inside the selected period.</p>
          <p><strong className="text-board-navy">Attendance rate:</strong> Present and Late count as attended. Absence reasons do not count as attended.</p>
          <p><strong className="text-board-navy">Reliability:</strong> uses the existing malus rules. Injured, Sick and Excused are 0; Private reason -0.5; Late cancellation -1; Unexcused -2; Late -0.5 only when the penalty is active.</p>
          <p><strong className="text-board-navy">Data basis:</strong> shows how many rated trainings support the performance view.</p>
          <p><strong className="text-board-navy">Categories:</strong> Technique, game understanding, intensity and behavior are optional, so they can have less data than the overall rating.</p>
        </div>
      </section>
    </div>
  );
}

function PlayerAnalyticsCard({ summary }: { summary: PlayerAnalyticsSummary }) {
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_2fr_auto] xl:items-start">
        <div>
          <Link href={`/squad/players/${summary.player.id}`} className="text-xl font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
            {playerName(summary.player)}
          </Link>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {summary.player.position || "No position"} · {summary.player.playerType === "trial" ? "Trial player" : "Roster"}
          </p>
          {summary.assessment ? (
            <p className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
              Coach assessment: {coachAssessmentLabels[summary.assessment.assessment]}
            </p>
          ) : (
            <p className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">Coach assessment: Decision open</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Trainings" value={String(summary.trainings)} />
          <MiniMetric label="Present" value={String(summary.attended)} />
          <MiniMetric label="Rated" value={String(summary.rated)} />
          <MiniMetric label="Avg rating" value={formatRating(summary.averageRating)} />
          <MiniMetric label="Latest 5 avg" value={formatRating(summary.latestFiveAverage)} />
          <MiniMetric label="Trend" value={<TrendLabel summary={summary} />} />
          <MiniMetric label="Attendance" value={formatPercent(summary.attendanceRate)} />
          <MiniMetric label="Reliability" value={summary.reliabilityPenalty.toFixed(1)} />
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <ButtonLink href={`/squad/players/${summary.player.id}`} variant="secondary" className="h-9 px-3">Profile</ButtonLink>
          <ButtonLink href={`/squad/players/${summary.player.id}/report`} variant="ghost" className="h-9 px-3">
            <Printer className="h-4 w-4" />
            Report
          </ButtonLink>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <div>
          <p className={cn("inline-flex rounded-full px-2 py-1 text-xs font-bold", evidenceBadgeTone(summary.evidenceBase.label))}>
            {summary.evidenceBase.label}
          </p>
          <p className="mt-2 text-sm text-slate-600">{summary.dataSummary}</p>
        </div>
        <RatingDistribution distribution={summary.ratingDistribution} />
        <div className="text-sm text-slate-600">
          <p className="font-bold text-board-navy">Last training</p>
          <p className="mt-1">{summary.latestTraining?.event?.date ?? "No training data"}{summary.latestTraining?.event?.label ? ` · ${summary.latestTraining.event.label}` : ""}</p>
          <p className="mt-1">Last rating: {summary.latestRating ? summary.latestRating : "No rating"}</p>
          <p className="mt-1">Late: {summary.late} · Unexcused: {summary.unexcused}</p>
        </div>
      </div>
    </article>
  );
}

function RatingDistribution({ distribution }: { distribution: PlayerAnalyticsSummary["ratingDistribution"] }) {
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  return (
    <div>
      <p className="text-sm font-bold text-board-navy">Rating distribution</p>
      <div className="mt-2 space-y-1">
        {([1, 2, 3, 4, 5] as const).map((rating) => (
          <div key={rating} className="grid grid-cols-[1.5rem_1fr_2rem] items-center gap-2 text-xs font-semibold text-slate-600">
            <span>{rating}</span>
            <span className="h-2 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-board-green" style={{ width: total ? `${(distribution[rating] / total) * 100}%` : "0%" }} />
            </span>
            <span className="text-right">{distribution[rating]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendLabel({ summary }: { summary: PlayerAnalyticsSummary }) {
  if (summary.trend.value === null) return <span>{summary.trend.label}</span>;
  const Icon = summary.trend.value >= 0.3 ? TrendingUp : summary.trend.value <= -0.3 ? TrendingDown : BarChart3;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" />
      {summary.trend.value > 0 ? "+" : ""}{summary.trend.value.toFixed(1)} · {summary.trend.label}
    </span>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-semibold transition",
        active ? "bg-board-green text-white" : "bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-board-green"
      )}
    >
      {children}
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-board-navy">{value}</p>
    </div>
  );
}

function hrefFor(filters: {
  period: AnalyticsPeriod;
  playerType: AnalyticsPlayerTypeFilter;
  position?: string;
  ratedOnly: boolean;
  sort: AnalyticsSortKey;
}) {
  const params = new URLSearchParams();
  if (filters.period !== "season") params.set("period", filters.period);
  if (filters.playerType !== "all") params.set("playerType", filters.playerType);
  if (filters.position) params.set("position", filters.position);
  if (filters.ratedOnly) params.set("ratedOnly", "true");
  if (filters.sort !== "name") params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `/squad/analysis?${query}` : "/squad/analysis";
}
