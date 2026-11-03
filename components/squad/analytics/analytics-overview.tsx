import Link from "next/link";
import { formatNumber, type Locale } from "@/lib/i18n";
import { trainingFocusLabel } from "@/lib/i18n/training-labels";
import { formatPercent, formatRating, type TeamAnalyticsOverview } from "@/lib/squad/analytics";
import type { AnalyticsFilters } from "@/lib/squad/analytics-queries";
import { hrefFor } from "./analytics-links";
import { AnalyticsMetricHelp } from "./analytics-methodology";

export function AttendanceBreakdown({ analytics: a, locale }: { analytics: TeamAnalyticsOverview; locale: Locale }) {
  const de = locale === "de";
  return <div className="mt-4 grid gap-4 sm:grid-cols-2" data-attendance-breakdown>
    <div><h3 className="text-xs font-bold uppercase text-slate-500">{de ? "Tatsächliches Ergebnis" : "Actual outcome"}</h3>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">{[
        [de ? "Anwesend" : "Present", a.present], [de ? "Verspätet" : "Late", a.late],
        [de ? "Training abgebrochen" : "Left early", a.leftEarly], [de ? "Abwesend" : "Absent", a.absent],
        [de ? "Nicht erfasst" : "Not recorded", a.notRecorded]
      ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-600">{label}</dt><dd className="font-bold tabular-nums text-board-navy">{value}</dd></div>)}</dl>
    </div>
    <div><h3 className="text-xs font-bold uppercase text-slate-500">{de ? "Planung" : "Planning"}</h3>
      <dl className="mt-2 flex flex-wrap gap-5 text-sm"><div><dt>{de ? "Eingeplant" : "Expected"}</dt><dd className="font-bold tabular-nums">{a.plannedExpectedCount}</dd></div><div><dt>{de ? "Nicht eingeplant" : "Not expected"}</dt><dd className="font-bold tabular-nums">{a.notExpected}</dd></div></dl>
    </div>
  </div>;
}

export function AnalyticsOverview({ analytics: a, filters, locale }: { analytics: TeamAnalyticsOverview; filters: AnalyticsFilters; locale: Locale }) {
  const de = locale === "de";
  const filtered = filters.playerType !== "all" || filters.position || filters.trainingId || filters.ratedOnly;
  if (!a.trainingSessions) return <section className="border-y border-board-line py-8" data-analytics-empty>
    <h2 className="text-lg font-bold">{de ? "Noch keine Analysedaten für diesen Zeitraum." : "No analytics data for this period yet."}</h2>
    <Link className="mt-3 inline-flex min-h-11 items-center font-bold text-board-green" href={filtered ? hrefFor({ ...filters, playerType: "all", position: undefined, trainingId: undefined, ratedOnly: false }) : "/trainings"}>
      {filtered ? de ? "Filter zurücksetzen" : "Reset filters" : de ? "Trainings öffnen" : "Open trainings"}
    </Link>
  </section>;
  return <div className="divide-y divide-board-line" data-analytics-overview>
    {filtered && !a.participantRecordCount ? <div className="py-4 text-sm text-slate-600">
      <p>{de ? "Keine Teilnehmerdaten für diese Filter." : "No participant data for these filters."}</p>
      <Link className="inline-flex min-h-11 items-center font-semibold text-board-green" href={hrefFor({ ...filters, playerType: "all", position: undefined, trainingId: undefined, ratedOnly: false })}>{de ? "Filter zurücksetzen" : "Reset filters"}</Link>
    </div> : null}
    <section className="py-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{de ? "Teilnahme im Überblick" : "Participation overview"}</h2><Link className="inline-flex min-h-11 items-center text-sm font-bold text-board-green" href={hrefFor({ ...filters, section: "attendance" })}>{de ? "Anwesenheit ansehen" : "Inspect attendance"}</Link></div>
      <AttendanceBreakdown analytics={a} locale={locale} />
      <p className="mt-3 text-sm text-slate-600">{de ? "Anwesenheitsdaten erfasst" : "Attendance recorded"}: {formatPercent(a.dataCoverageRate, locale)} · {a.attendanceRecordCount}/{a.participantRecordCount}</p>
      <AnalyticsMetricHelp metric="coverage" locale={locale} />
    </section>
    <section className="py-5" data-performance-evidence>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{de ? "Leistungsbewertungen" : "Performance evidence"}</h2><Link className="inline-flex min-h-11 items-center text-sm font-bold text-board-green" href={hrefFor({ ...filters, section: "players" })}>{de ? "Spieler vergleichen" : "Compare players"}</Link></div>
      <p className="text-sm text-slate-600">{a.totalRatedPerformances ? (de ? `${a.totalRatedPerformances} gespeicherte Bewertungen · Ø ${formatRating(a.teamAverageOverallRating, locale)} / 5` : `${a.totalRatedPerformances} saved ratings · Avg. ${formatRating(a.teamAverageOverallRating, locale)} / 5`) : de ? "Noch keine Leistungsbewertungen in diesem Zeitraum." : "No performance ratings in this period yet."}</p>
      <p className="mt-2 text-sm text-slate-600">{de ? "Bewertungsabdeckung" : "Rating coverage"}: {a.ratingCompletedCount}/{a.ratingEligibleCount} · {formatPercent(a.ratingCoverageRate, locale)}</p>
      <AnalyticsMetricHelp metric="ratingCoverage" locale={locale} />
    </section>
    <section className="py-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{de ? "Trainingsprofil" : "Training snapshot"}</h2><Link className="inline-flex min-h-11 items-center text-sm font-bold text-board-green" href={hrefFor({ ...filters, section: "training" })}>{de ? "Trainings ansehen" : "Inspect training"}</Link></div>
      <p className="text-sm text-slate-600">{a.reviewedSessions}/{a.trainingSessions} {de ? "Trainings mit Reflexion" : "trainings with reviews"} · {a.planCoverage.planned}/{a.planCoverage.total} {de ? "mit Plan" : "with a plan"}{a.averageTrainingMinutes !== null ? ` · Ø ${formatNumber(a.averageTrainingMinutes, locale, { maximumFractionDigits: 1 })} min` : ""}</p>
      {a.focusDistribution.length ? <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">{a.focusDistribution.slice(0, 3).map((focus) => <li key={focus.label}><span>{trainingFocusLabel(focus.label, locale)}</span> <span className="font-bold tabular-nums">{focus.count}×</span></li>)}</ul> : null}
    </section>
  </div>;
}
