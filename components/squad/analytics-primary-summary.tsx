import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, UserCheck, Users } from "lucide-react";
import { formatNumber, type Locale } from "@/lib/i18n";
import { formatPercent, formatRating, type AnalyticsPlayerTypeFilter, type TeamAnalyticsOverview } from "@/lib/squad/analytics";

type AnalyticsPrimarySummaryProps = {
  locale: Locale;
  analytics: TeamAnalyticsOverview;
  filteredPlayerCount: number;
  playerType: AnalyticsPlayerTypeFilter;
  position?: string;
  periodLabel: string;
  singleTraining: boolean;
};

export function AnalyticsPrimarySummary({
  locale,
  analytics,
  filteredPlayerCount,
  playerType,
  position,
  periodLabel,
  singleTraining
}: AnalyticsPrimarySummaryProps) {
  const participated = analytics.present + analytics.late + analytics.leftEarly;
  const missingRatings = Math.max(0, analytics.ratingEligibleCount - analytics.ratingCompletedCount);
  const missingAttendance = analytics.notRecorded;
  const hasParticipantData = analytics.participantRecordCount > 0;
  const attendanceComplete = hasParticipantData && missingAttendance === 0;
  const ratingsComplete = analytics.ratingEligibleCount === 0 || missingRatings === 0;
  const complete = attendanceComplete && ratingsComplete;

  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-2 border-y border-board-line py-3 sm:flex-row sm:items-center sm:justify-between" data-analytics-context>
        <p className="text-sm font-bold text-board-navy">
          {playerCountLabel(filteredPlayerCount, playerType, locale)}
          <span className="px-2 text-slate-300">·</span>
          {trainingCountLabel(analytics.trainingSessions, locale)}
          <span className="px-2 text-slate-300">·</span>
          <span className="font-semibold text-slate-600">{periodLabel}</span>
          {position ? <><span className="px-2 text-slate-300">·</span><span className="font-semibold text-slate-600">{locale === "de" ? "Position" : "Position"}: {position}</span></> : null}
        </p>
        <DataCompletenessStatus
          locale={locale}
          complete={complete}
          hasData={hasParticipantData}
          missingAttendance={missingAttendance}
          missingRatings={missingRatings}
          attendanceCoverage={analytics.dataCoverageRate}
          ratingCoverage={analytics.ratingCoverageRate}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3" data-primary-kpis>
        <PrimaryMetric
          icon={<Users className="h-4 w-4" />}
          label={singleTraining ? (locale === "de" ? "Teilnehmer" : "Participants") : (locale === "de" ? "Ø Teilnehmer / Training" : "Avg. participants / Training")}
          value={singleTraining
            ? `${participated} ${locale === "de" ? "Teilnehmer" : participated === 1 ? "participant" : "participants"}`
            : formatAverage(analytics.averageParticipantsPerTraining, locale)}
          hint={analytics.trainingSessions === 0
            ? noData(locale)
            : singleTraining
              ? (locale === "de" ? "Tatsächliche Teilnahme in dieser Trainingseinheit" : "Actual participation in this training")
              : locale === "de"
                ? `${participated} Teilnahmen in ${analytics.trainingSessions} Trainings`
                : `${participated} participations across ${analytics.trainingSessions} trainings`}
        />
        <PrimaryMetric
          icon={<UserCheck className="h-4 w-4" />}
          label={locale === "de" ? "Anwesenheit bei Einplanung" : "Attendance when expected"}
          value={analytics.teamAttendanceWhenExpectedRate === null ? noData(locale) : formatPercent(analytics.teamAttendanceWhenExpectedRate, locale)}
          hint={analytics.expectedRecordedCount
            ? locale === "de"
              ? `${analytics.attendedWhenExpectedCount} von ${analytics.expectedRecordedCount} eingeplanten Teilnahmen`
              : `${analytics.attendedWhenExpectedCount} of ${analytics.expectedRecordedCount} expected attendances`
            : noData(locale)}
        />
        <PrimaryMetric
          icon={<BarChart3 className="h-4 w-4" />}
          label={locale === "de" ? "Ø Leistungsbewertung" : "Avg. performance rating"}
          value={analytics.teamAverageOverallRating === null ? noRatings(locale) : `${formatRating(analytics.teamAverageOverallRating, locale)} / 5`}
          hint={analytics.totalRatedPerformances
            ? locale === "de"
              ? `${analytics.totalRatedPerformances} Bewertungen`
              : `${analytics.totalRatedPerformances} ratings`
            : noRatings(locale)}
        />
      </section>
    </div>
  );
}

export function AttendanceAnalyticsSummary({ analytics, locale }: { analytics: TeamAnalyticsOverview; locale: Locale }) {
  return (
    <div className="mt-4 grid border-y border-slate-100 md:grid-cols-3" data-attendance-summary>
      <AttendanceMetric label={locale === "de" ? "Ø Eingeplant / Training" : "Avg. expected / Training"} value={formatAverage(analytics.averageExpectedPerTraining, locale)} />
      <AttendanceMetric label={locale === "de" ? "Ø Teilgenommen / Training" : "Avg. participated / Training"} value={formatAverage(analytics.averageParticipantsPerTraining, locale)} />
      <AttendanceMetric
        label={locale === "de" ? "Anwesenheit bei Einplanung" : "Attendance when expected"}
        value={analytics.teamAttendanceWhenExpectedRate === null ? noData(locale) : formatPercent(analytics.teamAttendanceWhenExpectedRate, locale)}
      />
    </div>
  );
}

function DataCompletenessStatus({
  locale,
  complete,
  hasData,
  missingAttendance,
  missingRatings,
  attendanceCoverage,
  ratingCoverage
}: {
  locale: Locale;
  complete: boolean;
  hasData: boolean;
  missingAttendance: number;
  missingRatings: number;
  attendanceCoverage: number | null;
  ratingCoverage: number | null;
}) {
  if (!hasData) {
    return <span className="text-xs font-semibold text-slate-500">{noData(locale)}</span>;
  }

  if (complete) {
    const details = locale === "de"
      ? `Anwesenheit ${formatPercent(attendanceCoverage, locale)} · Bewertungen ${formatPercent(ratingCoverage ?? 1, locale)}`
      : `Attendance ${formatPercent(attendanceCoverage, locale)} · Ratings ${formatPercent(ratingCoverage ?? 1, locale)}`;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700" title={details} data-data-status="complete">
        <CheckCircle2 className="h-4 w-4" />
        {locale === "de" ? "Daten vollständig" : "Data complete"}
      </span>
    );
  }

  const messages = [
    missingAttendance > 0 ? locale === "de" ? `${missingAttendance} Anwesenheiten fehlen` : `${missingAttendance} attendance records missing` : null,
    missingRatings > 0 ? locale === "de" ? `${missingRatings} Bewertungen offen` : `${missingRatings} ratings missing` : null
  ].filter((message): message is string => Boolean(message));

  return (
    <Link href="/actions" className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 underline-offset-4 hover:underline" data-data-status="incomplete">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{messages.join(" · ")}</span>
    </Link>
  );
}

function PrimaryMetric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft" data-primary-kpi>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{icon}{label}</p>
      <p className="mt-2 text-2xl font-bold text-board-navy">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p>
    </article>
  );
}

function AttendanceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 md:border-l md:border-slate-100 md:px-4 md:first:border-l-0 md:first:pl-0 md:last:pr-0" data-attendance-metric>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

function formatAverage(value: number | null, locale: Locale) {
  return value === null ? noData(locale) : formatNumber(value, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function playerCountLabel(count: number, playerType: AnalyticsPlayerTypeFilter, locale: Locale) {
  if (locale === "de") {
    if (playerType === "roster") return `${count} Kaderspieler`;
    if (playerType === "trial") return `${count} Probespieler`;
    return `${count} Spieler`;
  }
  if (playerType === "roster") return `${count} roster players`;
  if (playerType === "trial") return `${count} trial players`;
  return `${count} players`;
}

function trainingCountLabel(count: number, locale: Locale) {
  if (locale === "de") return `${count} Trainingseinheit${count === 1 ? "" : "en"}`;
  return `${count} training${count === 1 ? "" : "s"}`;
}

function noData(locale: Locale) {
  return locale === "de" ? "Keine Daten" : "No data";
}

function noRatings(locale: Locale) {
  return locale === "de" ? "Keine Bewertungen" : "No ratings";
}
