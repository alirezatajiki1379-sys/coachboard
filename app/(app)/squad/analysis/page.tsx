import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowUpDown, BarChart3, CalendarCheck, Dumbbell, Filter, Info, Minus, Printer, Star, Target, TrendingDown, TrendingUp, UserCheck, Users } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { STICKY_TABLE_HEADER_CLASS } from "@/components/squad/player-table-layers";
import { ButtonLink } from "@/components/ui/button";
import { SquadNav } from "@/components/squad/squad-nav";
import {
  analyticsPeriodLabels,
  analyticsSectionLabels,
  coachAssessmentLabels,
  defaultSortDirection,
  evidenceBadgeTone,
  formatPercent,
  formatRating,
  playerName,
  type AnalyticsPeriod,
  type AnalyticsPlayerTypeFilter,
  type AnalyticsSection,
  type AnalyticsSortDirection,
  type AnalyticsSortKey,
  type PlayerAnalyticsRecord,
  type PlayerAnalyticsSummary,
  type TeamAnalyticsOverview
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
  { id: "status", label: "Status" },
  { id: "trainings", label: "Trainings" },
  { id: "attendance", label: "Attendance" },
  { id: "average", label: "Average rating" },
  { id: "latestFive", label: "Latest 5" },
  { id: "trend", label: "Trend" },
  { id: "reliability", label: "Reliability" },
  { id: "lastTraining", label: "Last training" },
  { id: "evidence", label: "Evidence" },
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

  const { summaries, positions, seasonSettings, teamAnalytics } = await getSquadAnalyticsOverview(supabase, user.id, filters);
  const allFilteredRecords = summaries.flatMap((summary) => summary.records);
  const periodDefinition = getPeriodDefinition(filters, allFilteredRecords, seasonSettings);
  const totalRated = summaries.reduce((sum, summary) => sum + summary.rated, 0);
  const openAssessments = summaries.filter((summary) => !summary.assessment || summary.assessment.assessment === "decision_open").length;
  const activeFilters = countActiveFilters(filters);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Squad"
        title="Analytics"
        description="Compare player availability, performance ratings, reliability and manual coach assessments without mixing observations with automatic decisions."
        actions={(
        <ButtonLink href="#analytics-help" variant="secondary" className="justify-center">
          <Info className="h-4 w-4" />
          How analytics are calculated
        </ButtonLink>
        )}
      />

      <SquadNav />

      <section className="flex flex-wrap gap-2 rounded-lg border border-board-line bg-white p-3 shadow-soft">
        {(Object.keys(analyticsSectionLabels) as AnalyticsSection[]).map((section) => (
          <FilterLink key={section} href={hrefFor({ ...filters, section })} active={filters.section === section}>
            {analyticsSectionLabels[section]}
          </FilterLink>
        ))}
      </section>

      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 md:hidden">
          <Filter className="h-4 w-4" />
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1fr_1.35fr] md:mt-0">
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
            <form action="/squad/analysis" className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="period" value="custom" />
              {filters.section !== "overview" ? <input type="hidden" name="section" value={filters.section} /> : null}
              {filters.playerType !== "all" ? <input type="hidden" name="playerType" value={filters.playerType} /> : null}
              {filters.position ? <input type="hidden" name="position" value={filters.position} /> : null}
              {filters.ratedOnly ? <input type="hidden" name="ratedOnly" value="true" /> : null}
              {filters.sort !== "name" ? <input type="hidden" name="sort" value={filters.sort} /> : null}
              {filters.direction !== defaultSortDirection(filters.sort) ? <input type="hidden" name="direction" value={filters.direction} /> : null}
              <label>
                <span className="sr-only">Custom period from date</span>
                <input
                  name="from"
                  placeholder="dd.mm.yyyy"
                  defaultValue={formatGermanDate(filters.customFrom)}
                  className="h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm font-semibold text-board-navy outline-none placeholder:text-slate-400 focus:border-board-green focus:ring-4 focus:ring-green-100"
                />
              </label>
              <label>
                <span className="sr-only">Custom period to date</span>
                <input
                  name="to"
                  placeholder="dd.mm.yyyy"
                  defaultValue={formatGermanDate(filters.customTo)}
                  className="h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm font-semibold text-board-navy outline-none placeholder:text-slate-400 focus:border-board-green focus:ring-4 focus:ring-green-100"
                />
              </label>
              <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-board-navy px-3 text-sm font-bold text-white hover:bg-slate-800">
                Apply
              </button>
            </form>
            <p className="mt-2 text-sm font-semibold text-board-navy">{periodDefinition.rangeLabel}</p>
            {periodDefinition.note ? <p className="mt-1 text-xs text-slate-500">{periodDefinition.note}</p> : null}
          </ControlField>
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <p>
            <span className="font-bold text-board-navy">Showing:</span> {playerTypeOptions.find((option) => option.id === filters.playerType)?.compact ?? "All"}
            {" · "}
            {filters.position || "All positions"}
            {" · "}
            {analyticsPeriodLabels[filters.period]}
            {filters.period === "custom" && filters.customFrom && filters.customTo ? ` (${formatGermanDate(filters.customFrom)} – ${formatGermanDate(filters.customTo)})` : ""}
            {" · "}
            Sorted by {sortOptions.find((option) => option.id === filters.sort)?.label ?? "Name"} {filters.direction === "asc" ? "ascending" : "descending"}
          </p>
          {activeFilters ? (
            <Link href="/squad/analysis" className="text-sm font-bold text-board-green underline-offset-4 hover:underline">
              Reset filters
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryMetric icon={<Users className="h-4 w-4" />} label="Players" value={String(summaries.length)} hint={`Active team: ${teamAnalytics.activeSquad.name}`} />
        <SummaryMetric icon={<CalendarCheck className="h-4 w-4" />} label="Trainings" value={String(teamAnalytics.trainingSessions)} hint={periodDefinition.shortLabel} />
        <SummaryMetric icon={<UserCheck className="h-4 w-4" />} label="Team attendance" value={formatPercent(teamAnalytics.teamAttendanceRate)} hint={`${teamAnalytics.present + teamAnalytics.late} attended`} />
        <SummaryMetric icon={<Star className="h-4 w-4" />} label="Rated performances" value={String(totalRated)} hint="Final overall ratings only" />
        <SummaryMetric icon={<Info className="h-4 w-4" />} label="Open assessments" value={String(openAssessments)} hint="Manual coach status" />
      </section>

      <AnalyticsSectionPanel section={filters.section} teamAnalytics={teamAnalytics} summaries={summaries} />

      {(filters.section === "players" || filters.section === "attendance") && summaries.length ? (
        <>
          <section className="hidden overflow-x-auto rounded-lg border border-board-line bg-white shadow-soft lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortableHeader label="Player" sortKey="name" filters={filters} />
                  <SortableHeader label="Position" sortKey="position" filters={filters} />
                  <SortableHeader label="Status" sortKey="status" filters={filters} />
                  <SortableHeader label="Trainings" sortKey="trainings" filters={filters} align="right" />
                  <SortableHeader label="Attendance" sortKey="attendance" filters={filters} align="right" />
                  <SortableHeader label="Average" sortKey="average" filters={filters} align="right" />
                  <SortableHeader label="Latest 5" sortKey="latestFive" filters={filters} align="right" />
                  <SortableHeader label="Trend" sortKey="trend" filters={filters} align="right" />
                  <SortableHeader label="Reliability" sortKey="reliability" filters={filters} align="right" />
                  <SortableHeader label="Evidence" sortKey="evidence" filters={filters} />
                  <SortableHeader label="Coach assessment" sortKey="coachAssessment" filters={filters} />
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
      ) : filters.section === "players" || filters.section === "attendance" ? (
        <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">No analytics data for this view.</h2>
          <p className="mt-2 text-sm text-slate-600">Adjust the filters or complete trainings with attendance and ratings.</p>
          <ButtonLink href="/trainings/new" className="mt-5">Create training</ButtonLink>
        </div>
      ) : null}

      <section id="analytics-help" className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <details>
          <summary className="flex cursor-pointer items-center gap-2 text-lg font-bold text-board-navy">
            <Info className="h-5 w-5" />
            How analytics are calculated
          </summary>
          <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-600 md:grid-cols-2">
            <p><strong className="text-board-navy">Average rating:</strong> only final overall ratings intentionally entered by the coach. Unrated trainings are not counted as 3.</p>
            <p><strong className="text-board-navy">Trend:</strong> latest five rated trainings compared with the five rated trainings before them, inside the selected period.</p>
            <p><strong className="text-board-navy">Attendance rate:</strong> Present and Late count as attended. Not expected and not recorded are excluded from the denominator.</p>
            <p><strong className="text-board-navy">Reliability:</strong> existing malus rules; late only counts when the penalty is active.</p>
            <p><strong className="text-board-navy">Evidence:</strong> shows how many rated trainings support the performance view.</p>
            <p><strong className="text-board-navy">Coach assessment:</strong> manual coach marker, separate from automatic summaries.</p>
            <p><strong className="text-board-navy">Drill usage:</strong> scoped to the active team and selected historical training period.</p>
          </div>
        </details>
      </section>
    </PageContainer>
  );
}

function AnalyticsSectionPanel({
  section,
  teamAnalytics,
  summaries
}: {
  section: AnalyticsSection;
  teamAnalytics: TeamAnalyticsOverview;
  summaries: PlayerAnalyticsSummary[];
}) {
  if (section === "training" || section === "overview") {
    return (
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Training Sessions" icon={<CalendarCheck className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Sessions" value={teamAnalytics.trainingSessions} />
            <MiniStat label="Reviewed" value={`${teamAnalytics.reviewedSessions}/${teamAnalytics.trainingSessions}`} />
            <MiniStat label="Review coverage" value={formatPercent(teamAnalytics.reviewCoverage)} />
            <MiniStat label="Quality" value={formatRating(teamAnalytics.averageSessionQuality)} />
            <MiniStat label="Intensity" value={formatRating(teamAnalytics.averageSessionIntensity)} />
            <MiniStat label="Planned sessions" value={formatPercent(teamAnalytics.planCoverage.rate)} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <OutcomeBadge label="Achieved" value={teamAnalytics.objectiveOutcomes.achieved} />
            <OutcomeBadge label="Partly" value={teamAnalytics.objectiveOutcomes.partly_achieved} />
            <OutcomeBadge label="Not achieved" value={teamAnalytics.objectiveOutcomes.not_achieved} />
          </div>
        </Panel>
        <Panel title="Training Focus" icon={<Target className="h-5 w-5" />}>
          {teamAnalytics.focusDistribution.length ? (
            <div className="space-y-3">
              {teamAnalytics.focusDistribution.slice(0, 6).map((item) => (
                <ProgressRow key={item.label} label={item.label} value={`${item.count}x`} percent={item.percentage} />
              ))}
            </div>
          ) : (
            <EmptyPanelText>No structured focus has been saved for trainings in this period.</EmptyPanelText>
          )}
        </Panel>
      </section>
    );
  }

  if (section === "attendance") {
    return (
      <Panel title="Team Attendance" icon={<UserCheck className="h-5 w-5" />}>
        <div className="grid gap-3 sm:grid-cols-5">
          <MiniStat label="Present" value={teamAnalytics.present} />
          <MiniStat label="Late" value={teamAnalytics.late} />
          <MiniStat label="Absent" value={teamAnalytics.absent} />
          <MiniStat label="Not expected" value={teamAnalytics.notExpected} />
          <MiniStat label="Not recorded" value={teamAnalytics.notRecorded} />
        </div>
      </Panel>
    );
  }

  if (section === "development") {
    return (
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Development Goals" icon={<Target className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Active goals" value={teamAnalytics.activeDevelopmentGoals} />
            <MiniStat label="Players with goals" value={teamAnalytics.playersWithActiveGoals} />
            <MiniStat label="Due for review" value={teamAnalytics.goalsDueForReview} />
            <MiniStat label="Achieved in period" value={teamAnalytics.goalsAchievedInPeriod} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Active goals by category</p>
            <ChipList items={teamAnalytics.activeGoalCategoryDistribution.map((item) => `${developmentCategoryLabel(item.category)}: ${item.count}`)} empty="No active goals yet." />
          </div>
        </Panel>
        <Panel title="Progress Updates" icon={<TrendingUp className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Updates in period" value={teamAnalytics.progressUpdatesInPeriod} />
            <MiniStat label="Players updated" value={teamAnalytics.progressPlayersInPeriod} />
          </div>
          <div className="mt-4 space-y-3">
            {teamAnalytics.latestProgressDistribution.length ? (
              teamAnalytics.latestProgressDistribution.map((item) => (
                <ProgressRow
                  key={item.progress}
                  label={progressLabel(item.progress)}
                  value={String(item.count)}
                  percent={teamAnalytics.activeDevelopmentGoals ? item.count / teamAnalytics.activeDevelopmentGoals : 0}
                />
              ))
            ) : (
              <EmptyPanelText>No active goal progress to summarize yet.</EmptyPanelText>
            )}
          </div>
        </Panel>
      </section>
    );
  }

  if (section === "drills") {
    return (
      <Panel title="Drill Usage" icon={<Dumbbell className="h-5 w-5" />}>
        <div className="grid gap-3 sm:grid-cols-4">
          <MiniStat label="Instances used" value={teamAnalytics.drillInstancesUsed} />
          <MiniStat label="Unique linked drills" value={teamAnalytics.uniqueDrillsUsed} />
          <MiniStat label="Reviewed" value={teamAnalytics.reviewedDrillInstances} />
          <MiniStat label="Effectiveness" value={formatRating(teamAnalytics.averageDrillEffectiveness)} />
        </div>
        {teamAnalytics.drillUsage.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Drill</th>
                  <th className="py-2 pr-3 text-right">Uses</th>
                  <th className="py-2 pr-3 text-right">Reviewed</th>
                  <th className="py-2 pr-3 text-right">Effectiveness</th>
                  <th className="py-2 text-right">Last used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamAnalytics.drillUsage.slice(0, 12).map((drill) => (
                  <tr key={`${drill.drillId ?? drill.title}-${drill.lastUsedAt ?? "never"}`}>
                    <td className="py-3 pr-3 font-bold text-board-navy">{drill.title}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{drill.uses}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{drill.reviewed}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatRating(drill.averageEffectiveness)}</td>
                    <td className="py-3 text-right tabular-nums">{drill.lastUsedAt ? formatShortDate(drill.lastUsedAt) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanelText>No drill usage in this team and period yet.</EmptyPanelText>
        )}
      </Panel>
    );
  }

  return (
    <Panel title="Player Analytics" icon={<BarChart3 className="h-5 w-5" />}>
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label="Players shown" value={summaries.length} />
        <MiniStat label="Rated players" value={summaries.filter((summary) => summary.rated > 0).length} />
        <MiniStat label="Attendance data" value={summaries.filter((summary) => summary.attendanceRate !== null).length} />
        <MiniStat label="Open assessments" value={summaries.filter((summary) => !summary.assessment || summary.assessment.assessment === "decision_open").length} />
      </div>
    </Panel>
  );
}

function PlayerAnalyticsRow({ summary, activeSort }: { summary: PlayerAnalyticsSummary; activeSort: AnalyticsSortKey }) {
  return (
    <tr className="align-middle hover:bg-slate-50/70">
      <td className="px-3 py-3">
        <Link href={`/squad/players/${summary.player.id}`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
          {playerName(summary.player)}
        </Link>
        <p className="mt-1 text-xs text-slate-500">{summary.latestTraining?.event?.label || "No latest training"}</p>
      </td>
      <MetricCell active={activeSort === "position"}>
        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{summary.player.position || "No position"}</span>
      </MetricCell>
      <MetricCell active={activeSort === "status"}>{summary.player.playerType === "trial" ? "Trial" : "Roster"}</MetricCell>
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
      <MetricCell active={activeSort === "evidence"}>
        <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-bold", evidenceBadgeTone(summary.evidenceBase.label))}>{summary.evidenceBase.label}</span>
        <p className="mt-1 text-xs text-slate-500">{summary.rated} rated</p>
      </MetricCell>
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

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-lg font-bold text-board-navy">
        <span className="text-board-green">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

function OutcomeBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-100 px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="ml-2 text-sm font-bold text-board-navy">{value}</span>
    </div>
  );
}

function ProgressRow({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-board-navy">{label}</span>
        <span className="font-bold tabular-nums text-slate-600">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-board-green" style={{ width: `${Math.max(3, Math.min(100, Math.round(percent * 100)))}%` }} />
      </div>
    </div>
  );
}

function ChipList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <EmptyPanelText>{empty}</EmptyPanelText>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
          {item}
        </span>
      ))}
    </div>
  );
}

function EmptyPanelText({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">{children}</p>;
}

function SortableHeader({
  label,
  sortKey,
  filters,
  align
}: {
  label: string;
  sortKey: AnalyticsSortKey;
  filters: {
    period: AnalyticsPeriod;
    section: AnalyticsSection;
    playerType: AnalyticsPlayerTypeFilter;
    position?: string;
    ratedOnly: boolean;
    sort: AnalyticsSortKey;
    direction: AnalyticsSortDirection;
    customFrom?: string;
    customTo?: string;
  };
  align?: "right";
}) {
  const active = sortKey === filters.sort;
  return (
    <th aria-sort={active ? (filters.direction === "asc" ? "ascending" : "descending") : "none"} className={cn(STICKY_TABLE_HEADER_CLASS, "px-0 py-0 font-bold", active && "bg-green-50 text-board-green")}>
      <Link
        href={hrefFor({ ...filters, sort: sortKey, direction: nextSortDirection(filters.sort, filters.direction, sortKey) })}
        className={cn(
          "flex min-h-11 items-center gap-1 px-3 py-3 underline-offset-4 hover:text-board-green hover:underline focus:outline-none focus:ring-4 focus:ring-green-100",
          align === "right" && "justify-end text-right"
        )}
        title={`Sort by ${label}`}
      >
        {label}
        <ArrowUpDown className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-35")} />
        {active ? <span className="sr-only">Sorted {filters.direction === "asc" ? "ascending" : "descending"}</span> : null}
      </Link>
    </th>
  );
}

function MetricCell({ active, align, children }: { active: boolean; align?: "right"; children: ReactNode }) {
  return <td className={cn("px-3 py-3 text-slate-700", align === "right" && "text-right tabular-nums", active && "bg-green-50/60 font-bold text-board-navy")}>{children}</td>;
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
  if (sort === "status") return { label: "Status", value: summary.player.playerType === "trial" ? "Trial" : "Roster", detail: summary.player.position || "No position" };
  if (sort === "average") return { label: "Average rating", value: formatRating(summary.averageRating), detail: `${summary.rated} rated trainings` };
  if (sort === "latestFive") return { label: "Latest 5", value: formatRating(summary.latestFiveAverage), detail: "Average of latest five rated trainings" };
  if (sort === "attendance") return { label: "Attendance", value: formatPercent(summary.attendanceRate), detail: `${summary.attended} of ${summary.trainings} trainings` };
  if (sort === "trend") return { label: "Trend", value: summary.trend.value === null ? "No trend yet" : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`, detail: summary.trend.label };
  if (sort === "reliability") return { label: "Reliability malus", value: summary.reliabilityPenalty.toFixed(1), detail: `${summary.late} late · ${summary.unexcused} unexcused` };
  if (sort === "lastTraining") return { label: "Last training", value: summary.latestTraining?.event?.date ? formatShortDate(summary.latestTraining.event.date) : "No data", detail: summary.latestTraining?.event?.label || "No latest training" };
  if (sort === "evidence") return { label: "Evidence", value: summary.evidenceBase.label, detail: `${summary.rated} rated trainings` };
  if (sort === "coachAssessment") return { label: "Coach assessment", value: summary.assessment ? coachAssessmentLabels[summary.assessment.assessment] : "Decision open", detail: "Manual coach marker" };
  return { label: "Trainings", value: String(summary.trainings), detail: `${summary.rated} rated · ${summary.attended} present` };
}

function getPeriodDefinition(
  filters: {
    period: AnalyticsPeriod;
    customFrom?: string;
    customTo?: string;
  },
  records: PlayerAnalyticsRecord[],
  seasonSettings: { seasonStartMonth: number; seasonStartDay: number }
) {
  const today = new Date();
  if (filters.period === "custom") {
    if (!filters.customFrom || !filters.customTo) return { shortLabel: "Custom range", rangeLabel: "Choose from and to dates", note: "Use dd.mm.yyyy, for example 01.07.2026." };
    if (filters.customFrom > filters.customTo) return { shortLabel: "Custom range", rangeLabel: "Invalid custom range", note: "The from date must be before the to date." };
    return { shortLabel: "Custom range", rangeLabel: `${formatGermanDate(filters.customFrom)} – ${formatGermanDate(filters.customTo)}` };
  }
  if (filters.period === "season") {
    const range = seasonDateRange(today, seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay);
    return { shortLabel: "This season", rangeLabel: `${formatGermanDate(range.from)} – ${formatGermanDate(range.to)}` };
  }
  if (filters.period === "30d" || filters.period === "90d") {
    const days = filters.period === "30d" ? 30 : 90;
    const to = dateOnly(today);
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - days + 1);
    return { shortLabel: analyticsPeriodLabels[filters.period], rangeLabel: `${formatGermanDate(dateOnly(fromDate))} – ${formatGermanDate(to)}` };
  }

  const dates = Array.from(new Set(records.map((record) => record.event?.date).filter((date): date is string => Boolean(date)))).sort();
  if (!dates.length) return { shortLabel: analyticsPeriodLabels[filters.period], rangeLabel: "No training data in this period" };
  return {
    shortLabel: analyticsPeriodLabels[filters.period],
    rangeLabel: `${formatGermanDate(dates[0])} – ${formatGermanDate(dates[dates.length - 1])}`,
    note: filters.period === "last5" || filters.period === "last10" ? `${dates.length} training${dates.length === 1 ? "" : "s"} available` : undefined
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

function formatShortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function developmentCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    technical: "Technical",
    tactical: "Tactical",
    physical: "Physical",
    mental: "Mental",
    other: "Other"
  };
  return labels[category] ?? category;
}

function progressLabel(progress: string) {
  const labels: Record<string, string> = {
    needs_attention: "Needs attention",
    developing: "Developing",
    consistent: "Consistent",
    achieved: "Achieved",
    none: "No progress update"
  };
  return labels[progress] ?? progress;
}

function formatGermanDate(date?: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}

function countActiveFilters(filters: {
  period: AnalyticsPeriod;
  section: AnalyticsSection;
  playerType: AnalyticsPlayerTypeFilter;
  position?: string;
  ratedOnly: boolean;
  sort: AnalyticsSortKey;
  direction: AnalyticsSortDirection;
  customFrom?: string;
  customTo?: string;
}) {
  return (
    Number(filters.period !== "last10") +
    Number(filters.section !== "overview") +
    Number(filters.playerType !== "all") +
    Number(Boolean(filters.position)) +
    Number(filters.ratedOnly) +
    Number(filters.sort !== "name") +
    Number(filters.direction !== defaultSortDirection(filters.sort))
  );
}

function hrefFor(filters: {
  period: AnalyticsPeriod;
  section: AnalyticsSection;
  playerType: AnalyticsPlayerTypeFilter;
  position?: string;
  ratedOnly: boolean;
  sort: AnalyticsSortKey;
  direction: AnalyticsSortDirection;
  customFrom?: string;
  customTo?: string;
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
  if (filters.ratedOnly) params.set("ratedOnly", "true");
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.direction !== defaultSortDirection(filters.sort)) params.set("direction", filters.direction);
  const query = params.toString();
  return query ? `/squad/analysis?${query}` : "/squad/analysis";
}

function nextSortDirection(currentSort: AnalyticsSortKey, currentDirection: AnalyticsSortDirection, nextSort: AnalyticsSortKey): AnalyticsSortDirection {
  if (currentSort !== nextSort) return defaultSortDirection(nextSort);
  return currentDirection === "asc" ? "desc" : "asc";
}
