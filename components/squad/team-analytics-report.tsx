import type { ReactNode } from "react";
import { formatDate, formatNumber, type Locale } from "@/lib/i18n";
import { formatPercent, formatRating, playerName, type PlayerAnalyticsSummary, type TeamAnalyticsOverview } from "@/lib/squad/analytics";

export type TeamAnalyticsReportMode = "attendance" | "performance" | "combined";

type TeamAnalyticsReportProps = {
  locale: Locale;
  mode: TeamAnalyticsReportMode;
  summaries: PlayerAnalyticsSummary[];
  teamAnalytics: TeamAnalyticsOverview;
  periodLabel: string;
  filterLabel: string;
  generatedAt: string;
};

export function TeamAnalyticsReport({ locale, mode, summaries, teamAnalytics, periodLabel, filterLabel, generatedAt }: TeamAnalyticsReportProps) {
  const copy = reportCopy[locale];
  return <article className="analytics-report-sheet print-page w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-6">
    <header className="analytics-report-header border-b-2 border-board-navy pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div><p className="text-xs font-bold uppercase tracking-wide text-board-green">CoachBoard · {teamAnalytics.activeSquad.name}</p><h1 className="mt-1 text-3xl font-bold text-board-navy">{copy.mode[mode]}</h1><p className="mt-2 text-sm text-slate-600">{periodLabel}</p></div>
        <div className="text-right text-xs text-slate-500"><p>{copy.generated}: {formatDate(generatedAt, locale)}</p><p className="mt-1">{filterLabel}</p></div>
      </div>
    </header>

    <section className="analytics-report-summary mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {mode === "attendance" ? <>
        <ReportStat label={copy.trainings} value={String(teamAnalytics.trainingSessions)} />
        <ReportStat label={copy.players} value={String(summaries.length)} />
        <ReportStat label={copy.attendanceExpected} value={formatPercent(teamAnalytics.teamAttendanceWhenExpectedRate, locale)} detail={`${teamAnalytics.attendedWhenExpectedCount} / ${teamAnalytics.expectedRecordedCount}`} />
        <ReportStat label={copy.absenceExpected} value={formatPercent(teamAnalytics.absenceWhenExpectedRate, locale)} detail={`${teamAnalytics.absentWhenExpectedCount} / ${teamAnalytics.expectedRecordedCount}`} />
        <ReportStat label={copy.dataCoverage} value={formatPercent(teamAnalytics.dataCoverageRate, locale)} detail={`${teamAnalytics.attendanceRecordCount} / ${teamAnalytics.participantRecordCount}`} />
      </> : <>
        <ReportStat label={copy.players} value={String(summaries.length)} />
        <ReportStat label={copy.trainings} value={String(teamAnalytics.trainingSessions)} />
        <ReportStat label={copy.ratingCoverage} value={formatPercent(teamAnalytics.ratingCoverageRate, locale)} detail={`${teamAnalytics.ratingCompletedCount} / ${teamAnalytics.ratingEligibleCount}`} />
        <ReportStat label={copy.averageRating} value={teamAnalytics.teamAverageOverallRating === null ? formatRating(null, locale) : `${formatRating(teamAnalytics.teamAverageOverallRating, locale)} / 5`} />
        <ReportStat label={copy.realRatings} value={String(teamAnalytics.totalRatedPerformances)} />
      </>}
    </section>

    <section className="mt-5 min-w-0">
      <h2 className="mb-2 text-lg font-bold text-board-navy">{copy.playerOverview}</h2>
      <div className="analytics-report-table-wrap w-full min-w-0 max-w-full overflow-x-auto">
        <table className="analytics-report-table w-full min-w-[850px] border-collapse text-left text-xs">
          {mode === "attendance" ? <AttendanceHead copy={copy} /> : mode === "performance" ? <PerformanceHead copy={copy} /> : <CombinedHead copy={copy} />}
          <tbody>{summaries.map((summary) => mode === "attendance" ? <AttendanceRow key={summary.player.id} summary={summary} locale={locale} /> : mode === "performance" ? <PerformanceRow key={summary.player.id} summary={summary} locale={locale} /> : <CombinedRow key={summary.player.id} summary={summary} locale={locale} />)}</tbody>
        </table>
      </div>
    </section>

    {mode !== "attendance" && teamAnalytics.events.length ? <section className="analytics-training-overview mt-5 min-w-0"><h2 className="mb-2 text-lg font-bold text-board-navy">{copy.trainingOverview}</h2><div className="analytics-report-table-wrap w-full min-w-0 max-w-full overflow-x-auto"><table className="analytics-report-table w-full min-w-[720px] border-collapse text-left text-xs"><thead><tr><Header>{copy.date}</Header><Header>{copy.training}</Header><Header align="right">{copy.attendanceExpected}</Header><Header align="right">{copy.ratingCoverage}</Header><Header align="right">{copy.averageRating}</Header><Header>{copy.review}</Header></tr></thead><tbody>{teamAnalytics.events.map((item) => <tr key={item.event.id}><Cell>{formatDate(item.event.date, locale)}</Cell><Cell strong>{item.event.label || copy.training}</Cell><Cell align="right">{formatPercent(item.attendance.attendanceWhenExpectedRate, locale)} · {item.attendance.attendedWhenExpected}/{item.attendance.expectedRecorded}</Cell><Cell align="right">{formatPercent(item.attendance.ratingCoverageRate, locale)} · {item.attendance.ratingCompletedCount}/{item.attendance.ratingEligibleCount}</Cell><Cell align="right">{formatRating(item.attendance.averageOverallRating, locale)}</Cell><Cell>{item.review ? copy.saved : copy.missing}</Cell></tr>)}</tbody></table></div></section> : null}
  </article>;
}

function AttendanceHead({ copy }: { copy: ReportCopy }) { return <thead><tr><Header>{copy.player}</Header><Header>{copy.position}</Header><Header align="right">{copy.expected}</Header><Header align="right">{copy.participated}</Header><Header align="right">{copy.attendance}</Header><Header align="right">{copy.notExpected}</Header><Header align="right">{copy.absentExpected}</Header><Header align="right">{copy.late}</Header><Header align="right">{copy.leftEarly}</Header></tr></thead>; }
function PerformanceHead({ copy }: { copy: ReportCopy }) { return <thead><tr><Header>{copy.player}</Header><Header>{copy.position}</Header><Header align="right">{copy.ratings}</Header><Header align="right">{copy.ratingCoverage}</Header><Header align="right">{copy.averageRating}</Header><Header align="right">{copy.latestFive}</Header><Header align="right">{copy.trend}</Header><Header>{copy.evidence}</Header><Header align="right">{copy.reliability}</Header></tr></thead>; }
function CombinedHead({ copy }: { copy: ReportCopy }) { return <thead><tr><Header>{copy.player}</Header><Header>{copy.position}</Header><Header align="right">{copy.participatedExpected}</Header><Header align="right">{copy.attendance}</Header><Header align="right">{copy.ratedExpected}</Header><Header align="right">{copy.averageRating}</Header><Header align="right">{copy.latestFive}</Header><Header align="right">{copy.trend}</Header><Header align="right">{copy.reliability}</Header></tr></thead>; }

function AttendanceRow({ summary, locale }: { summary: PlayerAnalyticsSummary; locale: Locale }) { return <tr data-analytics-player={summary.player.id}><PlayerCells summary={summary} /><Cell align="right">{summary.expectedTrainings}</Cell><Cell align="right">{summary.attended}</Cell><Cell align="right">{formatPercent(summary.attendanceWhenExpectedRate, locale)}<Small>{summary.attendedWhenExpected} / {summary.attendanceWhenExpectedRecorded}</Small></Cell><Cell align="right">{summary.notExpectedTrainings}</Cell><Cell align="right">{summary.absentWhenExpected}</Cell><Cell align="right">{summary.late}</Cell><Cell align="right">{summary.leftEarly}</Cell></tr>; }
function PerformanceRow({ summary, locale }: { summary: PlayerAnalyticsSummary; locale: Locale }) { return <tr data-analytics-player={summary.player.id}><PlayerCells summary={summary} /><Cell align="right">{summary.ratingCompletedExpectedCount} / {summary.ratingEligibleCount}</Cell><Cell align="right">{formatPercent(summary.ratingCoverageRate, locale)}</Cell><Cell align="right">{formatRating(summary.averageRating, locale)}</Cell><Cell align="right">{formatRating(summary.latestFiveAverage, locale)}</Cell><Cell align="right">{trendValue(summary, locale)}</Cell><Cell>{summary.rated} {locale === "de" ? "bewertet" : "rated"}</Cell><Cell align="right">{formatNumber(summary.reliabilityPenalty, locale, { minimumFractionDigits: 1 })}</Cell></tr>; }
function CombinedRow({ summary, locale }: { summary: PlayerAnalyticsSummary; locale: Locale }) { return <tr data-analytics-player={summary.player.id}><PlayerCells summary={summary} /><Cell align="right">{summary.attendedWhenExpected} / {summary.expectedTrainings}</Cell><Cell align="right">{formatPercent(summary.attendanceWhenExpectedRate, locale)}</Cell><Cell align="right">{summary.ratingCompletedExpectedCount} / {summary.ratingEligibleCount}</Cell><Cell align="right">{formatRating(summary.averageRating, locale)}</Cell><Cell align="right">{formatRating(summary.latestFiveAverage, locale)}</Cell><Cell align="right">{trendValue(summary, locale)}</Cell><Cell align="right">{formatNumber(summary.reliabilityPenalty, locale, { minimumFractionDigits: 1 })}</Cell></tr>; }

function PlayerCells({ summary }: { summary: PlayerAnalyticsSummary }) { return <><Cell strong>{playerName(summary.player)}</Cell><Cell>{summary.player.position || "-"}</Cell></>; }
function trendValue(summary: PlayerAnalyticsSummary, locale: Locale) { return summary.trend.value === null ? "-" : formatNumber(summary.trend.value, locale, { minimumFractionDigits: 1, signDisplay: "exceptZero" }); }
function Header({ children, align }: { children: ReactNode; align?: "right" }) { return <th className={`border-b border-slate-300 bg-slate-50 px-2 py-2 font-bold uppercase text-slate-500 ${align === "right" ? "text-right" : ""}`}>{children}</th>; }
function Cell({ children, align, strong }: { children: ReactNode; align?: "right"; strong?: boolean }) { return <td className={`border-b border-slate-100 px-2 py-2 align-top ${align === "right" ? "text-right tabular-nums" : ""} ${strong ? "font-bold text-board-navy" : "text-slate-700"}`}>{children}</td>; }
function Small({ children }: { children: ReactNode }) { return <span className="mt-0.5 block text-[10px] text-slate-500">{children}</span>; }
function ReportStat({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="rounded-md border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-board-navy">{value}</p>{detail ? <p className="text-xs text-slate-500">{detail}</p> : null}</div>; }

const reportCopy = {
  en: { mode: { attendance: "Attendance analysis", performance: "Performance analysis", combined: "Squad analytics overview" }, generated: "Generated", trainings: "Trainings", players: "Players", attendanceExpected: "Attendance when expected", absenceExpected: "Absence when expected", dataCoverage: "Data coverage", ratingCoverage: "Rating coverage", averageRating: "Average rating", realRatings: "Real ratings", playerOverview: "Player overview", trainingOverview: "Training overview", player: "Player", position: "Position", expected: "Expected", participated: "Participated", attendance: "Attendance", notExpected: "Not expected", absentExpected: "Absent when expected", late: "Late", leftEarly: "Left early", ratings: "Ratings", latestFive: "Latest 5", trend: "Trend", evidence: "Evidence", reliability: "Reliability", participatedExpected: "Participated / expected", ratedExpected: "Rated / expected", date: "Date", training: "Training", review: "Session review", saved: "Saved", missing: "Missing" },
  de: { mode: { attendance: "Anwesenheitsanalyse", performance: "Leistungsanalyse", combined: "Mannschaftsanalyse" }, generated: "Erstellt", trainings: "Trainingseinheiten", players: "Spieler", attendanceExpected: "Anwesenheit bei Einplanung", absenceExpected: "Fehlquote bei Einplanung", dataCoverage: "Datenvollständigkeit", ratingCoverage: "Bewertungsabdeckung", averageRating: "Ø Bewertung", realRatings: "Echte Bewertungen", playerOverview: "Spielerübersicht", trainingOverview: "Trainingsübersicht", player: "Spieler", position: "Position", expected: "Eingeplant", participated: "Teilgenommen", attendance: "Anwesenheit", notExpected: "Nicht eingeplant", absentExpected: "Abwesend bei Einplanung", late: "Verspätet", leftEarly: "Abgebrochen", ratings: "Bewertungen", latestFive: "Letzte 5", trend: "Trend", evidence: "Belege", reliability: "Zuverlässigkeit", participatedExpected: "Teilgenommen / eingeplant", ratedExpected: "Bewertet / erwartet", date: "Datum", training: "Training", review: "Session Review", saved: "Gespeichert", missing: "Fehlt" }
} as const;

type ReportCopy = (typeof reportCopy)[Locale];
