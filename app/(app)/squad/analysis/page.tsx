import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowUpDown, CalendarCheck, Filter, Info, Minus, Printer, Star, TrendingDown, TrendingUp, UserCheck, Users } from "lucide-react";
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
  type PlayerAnalyticsRecord,
  type PlayerAnalyticsSummary
} from "@/lib/squad/analytics";
import { getSquadAnalyticsOverview, parseAnalyticsFilters } from "@/lib/squad/analytics-queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type AnalysisPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const playerTypeOptions: Array<{ id: AnalyticsPlayerTypeFilter; label: string; compact: string }> = [
  { id: "all", label: "All players", compact: "All" },
  { id: "roster", label: "Roster players", compact: "Roster" },
  { id: "trial", label: "Trial players", compact: "Trial" }
];

const sortOptions: Array<{ id: AnalyticsSortKey; label: string }> = [
  { id: "name", label: "Name" },
  { id: "position", label: "Position" },
  { id: "trainings", label: "Trainings" },
  { id: "attendance", label: "Attendance" },
  { id: "average", label: "Average rating" },
  { id: "latestFive", label: "Latest 5" },
  { id: "trend", label: "Trend" },
  { id: "reliability", label: "Reliability" },
  { id: "lastTraining", label: "Last training" },
  { id: "coachAssessment", label: "Coach assessment" }
];

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { summaries, positions, seasonSettings } = await getSquadAnalyticsOverview(supabase, user.id, filters);
  const allFilteredRecords = summaries.flatMap((summary) => summary.records);
  const periodDefinition = getPeriodDefinition(filters.period, allFilteredRecords, seasonSettings);
  const totalTrainings = summaries.reduce((sum, summary) => sum + summary.trainings, 0);
  const totalRated = summaries.reduce((sum, summary) => sum + summary.rated, 0);
  const playersWithAttendance = summaries.filter((summary) => summary.attendanceRate !== null);
  const averageAttendance = playersWithAttendance.length ? playersWithAttendance.reduce((sum, summary) => sum + (summary.attendanceRate ?? 0), 0) / playersWithAttendance.length : null;
  const openAssessments = summaries.filter((summary) => !summary.assessment || summary.assessment.assessment === "decision_open").length;
  const activeFilters = countActiveFilters(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Analytics</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Compare player availability, performance ratings, reliability and manual coach assessments without mixing observations with automatic decisions.
          </p>
        </div>
        <ButtonLink href="#analytics-help" variant="secondary" className="justify-center">
          <Info className="h-4 w-4" />
          How analytics are calculated
        </ButtonLink>
      </div>

      <SquadNav />

      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 md:hidden">
          <Filter className="h-4 w-4" />
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1fr_1.35fr_1fr] md:mt-0">
          <ControlField label="Players">
            <div className="flex flex-wrap gap-2">
              {playerTypeOptions.map((option) => (
                <FilterLink key={option.id} href={hrefFor({ ...filters, playerType: option.id })} active={filters.playerType === option.id}>
                  {option.label}
                </FilterLink>
              ))}
            </div>
          </ControlField>
          <ControlField label="Position">
            <div className="flex flex-wrap gap-2">
              <FilterLink href={hrefFor({ ...filters, position: undefined })} active={!filters.position}>All positions</FilterLink>
              {positions.map((position) => (
                <FilterLink key={position} href={hrefFor({ ...filters, position })} active={filters.position === position}>
                  {position}
                </FilterLink>
              ))}
            </div>
          </ControlField>
          <ControlField label="Period">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(analyticsPeriodLabels) as AnalyticsPeriod[]).map((period) => (
                <FilterLink key={period} href={hrefFor({ ...filters, period })} active={filters.period === period}>
                  {analyticsPeriodLabels[period]}
                </FilterLink>
              ))}
            </div>
            <p className="mt-2 text-sm font-semibold text-board-navy">{periodDefinition.rangeLabel}</p>
            {periodDefinition.note ? <p className="mt-1 text-xs text-slate-500">{periodDefinition.note}</p> : null}
          </ControlField>
          <ControlField label="Sort by">
            <div className="flex flex-wrap gap-2">
              {sortOptions.map((option) => (
                <FilterLink key={option.id} href={hrefFor({ ...filters, sort: option.id })} active={filters.sort === option.id}>
                  {option.label}
                </FilterLink>
              ))}
            </div>
          </ControlField>
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <p>
            <span className="font-bold text-board-navy">Showing:</span> {playerTypeOptions.find((option) => option.id === filters.playerType)?.compact ?? "All"}
            {" · "}
            {filters.position || "All positions"}
            {" · "}
            {analyticsPeriodLabels[filters.period]}
            {" · "}
            Sorted by {sortOptions.find((option) => option.id === filters.sort)?.label ?? "Name"}
          </p>
          {activeFilters ? (
            <Link href="/squad/analysis" className="text-sm font-bold text-board-green underline-offset-4 hover:underline">
              Reset filters
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryMetric icon={<Users className="h-4 w-4" />} label="Players" value={String(summaries.length)} hint="Current filter" />
        <SummaryMetric icon={<CalendarCheck className="h-4 w-4" />} label="Training records" value={String(totalTrainings)} hint={periodDefinition.shortLabel} />
        <SummaryMetric icon={<UserCheck className="h-4 w-4" />} label="Average attendance" value={formatPercent(averageAttendance)} hint={playersWithAttendance.length ? `Across ${playersWithAttendance.length} players` : "No attendance data"} />
        <SummaryMetric icon={<Star className="h-4 w-4" />} label="Rated performances" value={String(totalRated)} hint="Final overall ratings only" />
        <SummaryMetric icon={<Info className="h-4 w-4" />} label="Open assessments" value={String(openAssessments)} hint="Manual coach status" />
      </section>

      {summaries.length ? (
        <>
          <section className="hidden overflow-hidden rounded-lg border border-board-line bg-white shadow-soft lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortableHeader label="Player" sortKey="name" activeSort={filters.sort} />
                  <SortableHeader label="Position" sortKey="position" activeSort={filters.sort} />
                  <th className="px-3 py-3 font-bold">Status</th>
                  <SortableHeader label="Trainings" sortKey="trainings" activeSort={filters.sort} align="right" />
                  <SortableHeader label="Attendance" sortKey="attendance" activeSort={filters.sort} align="right" />
                  <SortableHeader label="Average" sortKey="average" activeSort={filters.sort} align="right" />
                  <SortableHeader label="Latest 5" sortKey="latestFive" activeSort={filters.sort} align="right" />
                  <SortableHeader label="Trend" sortKey="trend" activeSort={filters.sort} align="right" />
                  <SortableHeader label="Reliability" sortKey="reliability" activeSort={filters.sort} align="right" />
                  <th className="px-3 py-3 font-bold">Evidence</th>
                  <SortableHeader label="Coach assessment" sortKey="coachAssessment" activeSort={filters.sort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((summary) => (
                  <PlayerAnalyticsRow key={summary.player.id} summary={summary} activeSort={filters.sort} />
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-y-3 lg:hidden">
            {summaries.map((summary) => (
              <PlayerAnalyticsMobileCard key={summary.player.id} summary={summary} activeSort={filters.sort} />
            ))}
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">No analytics data for this view.</h2>
          <p className="mt-2 text-sm text-slate-600">Adjust the filters or complete trainings with attendance and ratings.</p>
          <ButtonLink href="/trainings/new" className="mt-5">Create training</ButtonLink>
        </div>
      )}

      <section id="analytics-help" className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Info className="h-5 w-5" />How analytics are calculated</h2>
        <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-600 md:grid-cols-2">
          <p><strong className="text-board-navy">Average rating:</strong> only final overall ratings intentionally entered by the coach. Unrated trainings are not counted as 3.</p>
          <p><strong className="text-board-navy">Trend:</strong> latest five rated trainings compared with the five rated trainings before them, inside the selected period.</p>
          <p><strong className="text-board-navy">Attendance rate:</strong> Present and Late count as attended. Absence reasons do not count as attended.</p>
          <p><strong className="text-board-navy">Reliability:</strong> Injured, Sick and Excused are 0; Private reason -0.5; Late cancellation -1; Unexcused -2; Late -0.5 only when the penalty is active.</p>
          <p><strong className="text-board-navy">Data basis:</strong> shows how many rated trainings support the performance view, so one high rating does not look like a confirmed trend.</p>
          <p><strong className="text-board-navy">Coach assessment:</strong> a manual coach decision marker. It is intentionally separate from automatic summaries.</p>
        </div>
      </section>
    </div>
  );
}

function PlayerAnalyticsRow({ summary, activeSort }: { summary: PlayerAnalyticsSummary; activeSort: AnalyticsSortKey }) {
  return (
    <tr className="align-top hover:bg-slate-50/70">
      <td className="px-3 py-3">
        <Link href={`/squad/players/${summary.player.id}`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
          {playerName(summary.player)}
        </Link>
        <p className="mt-1 text-xs text-slate-500">{summary.latestTraining?.event?.label || "No latest training"}</p>
      </td>
      <MetricCell active={activeSort === "position"}>
        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{summary.player.position || "No position"}</span>
      </MetricCell>
      <td className="px-3 py-3 text-slate-600">{summary.player.playerType === "trial" ? "Trial" : "Roster"}</td>
      <MetricCell active={activeSort === "trainings"} align="right">{summary.trainings}</MetricCell>
      <MetricCell active={activeSort === "attendance"} align="right">
        <MetricStack value={formatPercent(summary.attendanceRate)} detail={`${summary.attended} of ${summary.trainings}`} />
      </MetricCell>
      <MetricCell active={activeSort === "average"} align="right">
        <MetricStack value={formatRating(summary.averageRating)} detail={`${summary.rated} ratings`} />
      </MetricCell>
      <MetricCell active={activeSort === "latestFive"} align="right">{formatRating(summary.latestFiveAverage)}</MetricCell>
      <MetricCell active={activeSort === "trend"} align="right">
        <TrendLabel summary={summary} />
      </MetricCell>
      <MetricCell active={activeSort === "reliability"} align="right">
        <MetricStack value={summary.reliabilityPenalty.toFixed(1)} detail={`${summary.late} late · ${summary.unexcused} unexcused`} />
      </MetricCell>
      <td className="px-3 py-3">
        <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-bold", evidenceBadgeTone(summary.evidenceBase.label))}>{summary.evidenceBase.label}</span>
        <p className="mt-1 text-xs text-slate-500">{summary.rated} rated</p>
      </td>
      <MetricCell active={activeSort === "coachAssessment"}>
        <span className="line-clamp-2 text-sm font-semibold text-board-navy">
          {summary.assessment ? coachAssessmentLabels[summary.assessment.assessment] : "Decision open"}
        </span>
      </MetricCell>
    </tr>
  );
}

function PlayerAnalyticsMobileCard({ summary, activeSort }: { summary: PlayerAnalyticsSummary; activeSort: AnalyticsSortKey }) {
  const primary = mobilePrimaryMetric(summary, activeSort);
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/squad/players/${summary.player.id}`} className="text-lg font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
            {playerName(summary.player)}
          </Link>
          <p className="mt-1 text-sm text-slate-600">
            <span className={cn(activeSort === "position" && "font-bold text-board-navy")}>{summary.player.position || "No position"}</span>
            {" · "}
            {summary.player.playerType === "trial" ? "Trial" : "Roster"}
          </p>
        </div>
        <ButtonLink href={`/squad/players/${summary.player.id}/report`} variant="ghost" className="h-9 px-3">
          <Printer className="h-4 w-4" />
          Report
        </ButtonLink>
      </div>
      <div className="mt-4 rounded-md bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{primary.label}</p>
        <p className="mt-1 text-2xl font-bold text-board-navy">{primary.value}</p>
        <p className="mt-1 text-sm text-slate-600">{primary.detail}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <CompactMetric label="Average" value={formatRating(summary.averageRating)} muted={activeSort === "average"} />
        <CompactMetric label="Attendance" value={formatPercent(summary.attendanceRate)} muted={activeSort === "attendance"} />
        <CompactMetric label="Trend" value={summary.trend.value === null ? summary.trend.label : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`} muted={activeSort === "trend"} />
        <CompactMetric label="Evidence" value={summary.evidenceBase.label} />
      </div>
    </article>
  );
}

function TrendLabel({ summary }: { summary: PlayerAnalyticsSummary }) {
  if (summary.trend.value === null) return <span className="text-slate-500">No trend yet</span>;
  const Icon = summary.trend.value >= 0.3 ? TrendingUp : summary.trend.value <= -0.3 ? TrendingDown : Minus;
  const tone = summary.trend.value >= 0.3 ? "text-green-700" : summary.trend.value <= -0.3 ? "text-red-700" : "text-slate-600";
  return (
    <span className={cn("inline-flex flex-col items-end gap-0.5", tone)}>
      <span className="inline-flex items-center gap-1 font-bold">
        <Icon className="h-3.5 w-3.5" />
        {summary.trend.value > 0 ? "+" : ""}{summary.trend.value.toFixed(1)} · {summary.trend.label}
      </span>
      {summary.trend.latestAverage !== undefined && summary.trend.previousAverage !== undefined ? (
        <span className="text-xs font-semibold text-slate-500">Latest 5 {formatRating(summary.trend.latestAverage)} · Prev {formatRating(summary.trend.previousAverage)}</span>
      ) : null}
    </span>
  );
}

function ControlField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-green-100",
        active ? "bg-board-green text-white" : "bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-board-green"
      )}
    >
      {children}
    </Link>
  );
}

function SummaryMetric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{icon}{label}</p>
      <p className="mt-2 text-2xl font-bold text-board-navy">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p>
    </div>
  );
}

function SortableHeader({ label, sortKey, activeSort, align }: { label: string; sortKey: AnalyticsSortKey; activeSort: AnalyticsSortKey; align?: "right" }) {
  const active = sortKey === activeSort;
  return (
    <th aria-sort={active ? "descending" : "none"} className={cn("px-3 py-3 font-bold", align === "right" && "text-right", active && "bg-green-50 text-board-green")}>
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {label}
        {active ? <ArrowUpDown className="h-3.5 w-3.5" /> : null}
      </span>
    </th>
  );
}

function MetricCell({ active, align, children }: { active: boolean; align?: "right"; children: ReactNode }) {
  return <td className={cn("px-3 py-3", align === "right" && "text-right", active && "bg-green-50/60 font-bold text-board-navy")}>{children}</td>;
}

function MetricStack({ value, detail }: { value: string; detail: string }) {
  return (
    <span className="inline-flex flex-col">
      <span className="font-bold text-board-navy">{value}</span>
      <span className="text-xs font-semibold text-slate-500">{detail}</span>
    </span>
  );
}

function CompactMetric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("rounded-md border border-slate-100 p-2", muted && "bg-green-50")}>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-board-navy">{value}</p>
    </div>
  );
}

function mobilePrimaryMetric(summary: PlayerAnalyticsSummary, sort: AnalyticsSortKey) {
  if (sort === "position") return { label: "Position", value: summary.player.position || "No position", detail: `${summary.player.playerType === "trial" ? "Trial player" : "Roster player"}` };
  if (sort === "average") return { label: "Average rating", value: formatRating(summary.averageRating), detail: `${summary.rated} rated trainings` };
  if (sort === "latestFive") return { label: "Latest 5", value: formatRating(summary.latestFiveAverage), detail: "Average of latest five rated trainings" };
  if (sort === "attendance") return { label: "Attendance", value: formatPercent(summary.attendanceRate), detail: `${summary.attended} of ${summary.trainings} trainings` };
  if (sort === "trend") return { label: "Trend", value: summary.trend.value === null ? "No trend yet" : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`, detail: summary.trend.label };
  if (sort === "reliability") return { label: "Reliability malus", value: summary.reliabilityPenalty.toFixed(1), detail: `${summary.late} late · ${summary.unexcused} unexcused` };
  if (sort === "lastTraining") return { label: "Last training", value: summary.latestTraining?.event?.date ? formatShortDate(summary.latestTraining.event.date) : "No data", detail: summary.latestTraining?.event?.label || "No latest training" };
  if (sort === "coachAssessment") return { label: "Coach assessment", value: summary.assessment ? coachAssessmentLabels[summary.assessment.assessment] : "Decision open", detail: "Manual coach marker" };
  return { label: "Trainings", value: String(summary.trainings), detail: `${summary.rated} rated · ${summary.attended} present` };
}

function getPeriodDefinition(
  period: AnalyticsPeriod,
  records: PlayerAnalyticsRecord[],
  seasonSettings: { seasonStartMonth: number; seasonStartDay: number }
) {
  const today = new Date();
  if (period === "season") {
    const range = seasonDateRange(today, seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay);
    return { shortLabel: "This season", rangeLabel: `${formatDisplayDate(range.from)} – ${formatDisplayDate(range.to)}` };
  }
  if (period === "30d" || period === "90d") {
    const days = period === "30d" ? 30 : 90;
    const to = dateOnly(today);
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - days + 1);
    return { shortLabel: analyticsPeriodLabels[period], rangeLabel: `${formatDisplayDate(dateOnly(fromDate))} – ${formatDisplayDate(to)}` };
  }

  const dates = Array.from(new Set(records.map((record) => record.event?.date).filter((date): date is string => Boolean(date)))).sort();
  if (!dates.length) return { shortLabel: analyticsPeriodLabels[period], rangeLabel: "No training data in this period" };
  return {
    shortLabel: analyticsPeriodLabels[period],
    rangeLabel: `${formatDisplayDate(dates[0])} – ${formatDisplayDate(dates[dates.length - 1])}`,
    note: period === "last5" || period === "last10" ? `${dates.length} training${dates.length === 1 ? "" : "s"} available` : undefined
  };
}

function seasonDateRange(today: Date, startMonth: number, startDay: number) {
  const currentYear = today.getFullYear();
  const startThisYear = new Date(currentYear, startMonth - 1, startDay);
  const from = today >= startThisYear ? startThisYear : new Date(currentYear - 1, startMonth - 1, startDay);
  const to = new Date(from.getFullYear() + 1, startMonth - 1, startDay - 1);
  return { from: dateOnly(from), to: dateOnly(to) };
}

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatShortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function countActiveFilters(filters: {
  period: AnalyticsPeriod;
  playerType: AnalyticsPlayerTypeFilter;
  position?: string;
  ratedOnly: boolean;
  sort: AnalyticsSortKey;
}) {
  return Number(filters.period !== "season") + Number(filters.playerType !== "all") + Number(Boolean(filters.position)) + Number(filters.ratedOnly) + Number(filters.sort !== "name");
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
