import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getActiveLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { formatDate, formatNumber, type Locale } from "@/lib/i18n";
import { coachAssessmentLabels, formatPercent, formatRating, playerName, type PlayerAnalyticsSummary, type AnalyticsSortKey } from "@/lib/squad/analytics";
import type { AnalyticsFilters } from "@/lib/squad/analytics-queries";
import { ReliabilityValue } from "@/components/squad/reliability-value";
import { STICKY_TABLE_HEADER_CLASS } from "@/components/squad/player-table-layers";
import { cn } from "@/lib/utils";
import { analyticsCopy } from "./analytics-copy";
import { hrefFor, nextSortDirection } from "./analytics-links";
import { AnalyticsSort } from "./analytics-sort";
import { AnalyticsMetricHelp } from "./analytics-methodology";

export async function AttendanceAnalyticsTable({ summaries, filters }: { summaries: PlayerAnalyticsSummary[]; filters: AnalyticsFilters }) {
  const locale = await getActiveLocale();
  const de = locale === "de";
  return <section className="min-w-0 border-t border-board-line py-5" data-attendance-players>
    <h2 className="mb-3 text-lg font-bold text-board-navy">{de ? "Spielervergleich" : "Player comparison"}</h2>
    <AnalyticsSort filters={filters} locale={locale} />
    <div className="hidden overflow-x-auto lg:block"><table className="w-full table-fixed border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-xs text-slate-600"><tr>
        <SortableHeader label={de ? "Spieler" : "Player"} sortKey="name" filters={filters} locale={locale} />
        <Header>{de ? "Teilnahme" : "Participation"}<AnalyticsMetricHelp metric="participation" locale={locale} /></Header>
        <Header>{de ? "Anwesenheit bei Einplanung" : "Attendance when expected"}<AnalyticsMetricHelp metric="expected" locale={locale} /></Header>
        <SortableHeader label={de ? "Anwesenheit" : "Attendance"} sortKey="attendance" filters={filters} locale={locale} />
        <SortableHeader label={de ? "Zuverlässigkeit" : "Reliability"} sortKey="reliability" filters={filters} locale={locale} />
        <Header>{de ? "Datenbasis" : "Evidence"}</Header>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{summaries.map((summary) => <tr key={summary.player.id} className="align-top hover:bg-slate-50/70">
        <td className="p-3"><PlayerIdentity summary={summary} locale={locale} /></td>
        <Cell><Value value={formatPercent(summary.participationRate, locale)} detail={`${summary.attended} / ${summary.trainings}`} /></Cell>
        <Cell><Value value={formatPercent(summary.attendanceWhenExpectedRate, locale)} detail={`${summary.attendedWhenExpected} / ${summary.attendanceWhenExpectedRecorded}`} /></Cell>
        <Cell><Value value={formatPercent(summary.attendanceRate, locale)} detail={`${summary.attendanceCount} / ${summary.attendanceOpportunityCount}`} /><AnalyticsMetricHelp metric="attendance" locale={locale} /></Cell>
        <Cell><ReliabilityValue summary={summary} locale={locale} align="left" /></Cell>
        <Cell><AttendanceEvidence summary={summary} locale={locale} /></Cell>
      </tr>)}</tbody>
    </table></div>
    <div className="space-y-3 lg:hidden">{summaries.map((summary) => <article key={summary.player.id} className="min-w-0 rounded-lg border border-board-line bg-white p-4 [overflow-wrap:anywhere]">
      <PlayerIdentity summary={summary} locale={locale} />
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <Data label={de ? "Teilnahme" : "Participation"}><Value value={formatPercent(summary.participationRate, locale)} detail={`${summary.attended} / ${summary.trainings}`} /><AnalyticsMetricHelp metric="participation" locale={locale} /></Data>
        <Data label={de ? "Anwesenheit bei Einplanung" : "Attendance when expected"}><Value value={formatPercent(summary.attendanceWhenExpectedRate, locale)} detail={`${summary.attendedWhenExpected} / ${summary.attendanceWhenExpectedRecorded}`} /><AnalyticsMetricHelp metric="expected" locale={locale} /></Data>
      </dl>
      <div className="mt-4 border-t border-board-line pt-3"><ReliabilityValue summary={summary} locale={locale} align="left" /></div>
      <AttendanceEvidence summary={summary} locale={locale} />
    </article>)}</div>
  </section>;
}

export async function PerformanceAnalyticsTable({ summaries, filters }: { summaries: PlayerAnalyticsSummary[]; filters: AnalyticsFilters }) {
  const locale = await getActiveLocale();
  const h = analyticsCopy[locale].headers;
  return <section className="min-w-0 border-t border-board-line py-5" data-performance-players>
    <h2 className="mb-3 text-lg font-bold text-board-navy">{locale === "de" ? "Spielervergleich" : "Player comparison"}</h2>
    <AnalyticsSort filters={filters} locale={locale} />
    <div className="hidden overflow-x-auto lg:block"><table className="w-full table-fixed border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-xs text-slate-600"><tr>
        <SortableHeader label={h.player} sortKey="name" filters={filters} locale={locale} />
        <SortableHeader label={h.position} sortKey="position" filters={filters} locale={locale} />
        <SortableHeader label={h.trainings} sortKey="trainings" filters={filters} locale={locale} />
        <SortableHeader label={h.average} sortKey="average" filters={filters} locale={locale} />
        <SortableHeader label={h.latestFive} sortKey="latestFive" filters={filters} locale={locale} />
        <SortableHeader label={h.trend} sortKey="trend" filters={filters} locale={locale} />
        <Header>{locale === "de" ? "Details" : "Details"}</Header>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{summaries.map((summary) => <tr key={summary.player.id} className="align-top hover:bg-slate-50/70">
        <td className="p-3"><PlayerIdentity summary={summary} locale={locale} showPosition={false} /></td>
        <Cell>{summary.player.position || "-"}</Cell>
        <Cell><Value value={String(summary.trainings)} detail={`${summary.rated} ${locale === "de" ? "Bewertungen" : "ratings"}`} /></Cell>
        <Cell><Value value={formatRating(summary.averageRating, locale)} detail={summary.rated ? `${summary.rated} ${locale === "de" ? "Bewertungen" : "ratings"}` : locale === "de" ? "Noch keine Bewertungen" : "No ratings yet"} /></Cell>
        <Cell><RecentRatings summary={summary} locale={locale} /></Cell>
        <Cell><TrendLabel summary={summary} locale={locale} /></Cell>
        <Cell><PerformanceEvidence summary={summary} locale={locale} /></Cell>
      </tr>)}</tbody>
    </table></div>
    <div className="space-y-3 lg:hidden">{summaries.map((summary) => <article key={summary.player.id} className="min-w-0 rounded-lg border border-board-line bg-white p-4 [overflow-wrap:anywhere]">
      <PlayerIdentity summary={summary} locale={locale} />
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <Data label={h.average}><Value value={formatRating(summary.averageRating, locale)} detail={`${summary.rated} ${locale === "de" ? "Bewertungen" : "ratings"}`} /></Data>
        <Data label={h.trainings}>{summary.trainings}</Data>
        <Data label={h.latestFive}><RecentRatings summary={summary} locale={locale} /></Data>
        <Data label={h.trend}><TrendLabel summary={summary} locale={locale} /></Data>
      </dl>
      <PerformanceEvidence summary={summary} locale={locale} />
    </article>)}</div>
  </section>;
}

function AttendanceEvidence({ summary: s, locale }: { summary: PlayerAnalyticsSummary; locale: Locale }) {
  const de = locale === "de";
  return <details className="mt-2 min-w-0 text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-700">{s.recordedTrainings} / {s.trainings} {de ? "erfasst" : "recorded"}</summary>
    <dl className="space-y-3 py-2 text-xs">
      <Data label={de ? "Anwesenheit (Teilnahmegelegenheiten)" : "Attendance (opportunities)"}>{formatPercent(s.attendanceRate, locale)} · {s.attendanceCount} / {s.attendanceOpportunityCount}<AnalyticsMetricHelp metric="attendance" locale={locale} /></Data>
      <Data label={de ? "Eingeplant / Nicht eingeplant" : "Expected / Not expected"}>{s.expectedTrainings} / {s.notExpectedTrainings}</Data>
      <Data label={de ? "Abwesend bei Einplanung" : "Absent when expected"}>{s.absentWhenExpected}</Data>
      <Data label={de ? "Verspätet / Abgebrochen" : "Late / Left early"}>{s.late} / {s.leftEarly}</Data>
      <Data label={de ? "Nicht erfasst" : "Not recorded"}>{s.notRecordedTrainings}</Data>
    </dl>
  </details>;
}

function PerformanceEvidence({ summary: s, locale }: { summary: PlayerAnalyticsSummary; locale: Locale }) {
  const de = locale === "de";
  const ui = createSystemTranslator(locale);
  return <details className="mt-2 min-w-0 text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-700">{de ? "Datenbasis & Kontext" : "Evidence & context"}</summary>
    <dl className="space-y-3 py-2 text-xs">
      <Data label={de ? "Datenbasis" : "Evidence"}>{ui(s.evidenceBase.label)}<AnalyticsMetricHelp metric="evidence" locale={locale} /></Data>
      <Data label={de ? "Bewertungsabdeckung" : "Rating coverage"}>{formatPercent(s.ratingCoverageRate, locale)} · {s.ratingCompletedExpectedCount} / {s.ratingEligibleCount}<AnalyticsMetricHelp metric="ratingCoverage" locale={locale} /></Data>
      <Data label={de ? "Teilnahme" : "Participation"}>{formatPercent(s.participationRate, locale)} · {s.attended} / {s.trainings}</Data>
      <Data label={de ? "Anwesenheit bei Einplanung" : "Attendance when expected"}>{formatPercent(s.attendanceWhenExpectedRate, locale)} · {s.attendedWhenExpected} / {s.attendanceWhenExpectedRecorded}</Data>
      <Data label={de ? "Zuverlässigkeit" : "Reliability"}><ReliabilityValue summary={s} locale={locale} align="left" /></Data>
      <Data label={de ? "Trainereinschätzung" : "Coach assessment"}>{ui(s.assessment ? coachAssessmentLabels[s.assessment.assessment] : "Decision open")}</Data>
      <Data label={de ? "Letztes Training" : "Last training"}>{s.latestTraining?.event ? formatDate(s.latestTraining.event.date, locale) : "-"}</Data>
    </dl>
  </details>;
}

function RecentRatings({ summary, locale }: { summary: PlayerAnalyticsSummary; locale: Locale }) {
  // The canonical summary already orders records newest first; show only stored ratings.
  const ratings = summary.records.map((record) => record.overallRating).filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5).slice(0, 5);
  return <div><p className="tabular-nums">{ratings.length ? ratings.join(" · ") : "—"}</p>{ratings.length ? <p className="mt-1 text-xs text-slate-500">Ø {formatRating(summary.latestFiveAverage, locale)}</p> : null}</div>;
}

function PlayerIdentity({ summary, locale, showPosition = true }: { summary: PlayerAnalyticsSummary; locale: Locale; showPosition?: boolean }) {
  const de = locale === "de";
  return <div className="min-w-0 [overflow-wrap:anywhere]"><Link translate="no" href={`/squad/players/${summary.player.id}`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">{playerName(summary.player)}</Link>
    <p className="mt-1 text-xs text-slate-500">{showPosition ? `${summary.player.position || "-"} · ` : ""}{summary.player.playerType === "trial" ? de ? "Probespieler" : "Trial" : de ? "Kader" : "Roster"}</p>
    <Link href={`/squad/players/${summary.player.id}/report`} className="mt-1 inline-block py-1 text-xs text-slate-600 underline">{de ? "Spielerbericht" : "Player report"}</Link>
  </div>;
}

function TrendLabel({ summary, locale }: { summary: PlayerAnalyticsSummary; locale: Locale }) {
  const ui = createSystemTranslator(locale);
  if (summary.trend.value === null) return <span className="text-slate-500">{ui("No trend yet")}</span>;
  const Icon = summary.trend.value >= 0.3 ? TrendingUp : summary.trend.value <= -0.3 ? TrendingDown : Minus;
  return <details className="text-slate-700"><summary className="min-h-11 cursor-pointer list-none py-1"><span className="flex flex-wrap items-center gap-1 font-semibold"><Icon className="h-4 w-4 shrink-0" />{formatNumber(summary.trend.value, locale, { minimumFractionDigits: 1, signDisplay: "exceptZero" })}</span><span className="text-xs">{ui(summary.trend.label)}</span></summary>
    {summary.trend.latestAverage !== undefined && summary.trend.previousAverage !== undefined ? <p className="mt-1 text-xs">{locale === "de" ? "Letzte 5 / Vorherige 5" : "Latest 5 / Previous 5"}: {formatRating(summary.trend.latestAverage, locale)} / {formatRating(summary.trend.previousAverage, locale)}</p> : null}
    <AnalyticsMetricHelp metric="trend" locale={locale} />
  </details>;
}

function SortableHeader({ label, sortKey, filters, locale }: { label: string; sortKey: AnalyticsSortKey; filters: AnalyticsFilters; locale: Locale }) {
  const active = sortKey === filters.sort;
  return <th aria-sort={active ? (filters.direction === "asc" ? "ascending" : "descending") : "none"} className={cn(STICKY_TABLE_HEADER_CLASS, "p-0 align-top font-semibold [overflow-wrap:anywhere]", active && "bg-green-50 text-board-green")}>
    <Link href={hrefFor({ ...filters, sort: sortKey, direction: nextSortDirection(filters.sort, filters.direction, sortKey) })} className="flex min-h-11 items-start gap-1 p-3 focus-visible:outline focus-visible:outline-2" title={locale === "de" ? `Sortieren nach ${label}` : `Sort by ${label}`}>
      <span className="min-w-0">{label}</span><ArrowUpDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    </Link>
  </th>;
}

function Header({ children }: { children: ReactNode }) { return <th className={cn(STICKY_TABLE_HEADER_CLASS, "p-3 align-top font-semibold [overflow-wrap:anywhere]")}>{children}</th>; }
function Cell({ children }: { children: ReactNode }) { return <td className="p-3 text-slate-700 tabular-nums [overflow-wrap:anywhere]">{children}</td>; }
function Value({ value, detail }: { value: string; detail: string }) { return <div><span className="font-bold text-board-navy tabular-nums">{value}</span><p className="mt-1 text-xs text-slate-500">{detail}</p></div>; }
function Data({ label, children }: { label: string; children: ReactNode }) { return <div className="min-w-0 [overflow-wrap:anywhere]"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 text-slate-800">{children}</dd></div>; }
