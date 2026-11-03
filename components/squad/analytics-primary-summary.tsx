import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, UserCheck, Users } from "lucide-react";
import { AnalyticsMetricHelp } from "@/components/squad/analytics/analytics-methodology";
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
  showMetrics?: boolean;
};

export function AnalyticsPrimarySummary({
  locale,
  analytics,
  filteredPlayerCount,
  playerType,
  position,
  periodLabel,
  singleTraining,
  showMetrics = true
}: AnalyticsPrimarySummaryProps) {
  const participated = analytics.present + analytics.late + analytics.leftEarly;
  const missingAttendance = analytics.notRecorded;
  const hasParticipantData = analytics.participantRecordCount > 0;
  const attendanceComplete = hasParticipantData && missingAttendance === 0;

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
          complete={attendanceComplete}
          hasData={hasParticipantData}
          missingAttendance={missingAttendance}
          attendanceCoverage={analytics.dataCoverageRate}
        />
      </section>

      {showMetrics ? <section className={`grid min-w-0 items-stretch gap-3 md:grid-cols-2 ${analytics.totalRatedPerformances > 0 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`} data-primary-kpis>
        <PrimaryMetric icon={<CalendarDays className="h-4 w-4" />}
          label={locale === "de" ? "Trainingseinheiten" : "Training sessions"}
          value={String(analytics.trainingSessions)}
          hint={analytics.totalTrainingMinutes == null ? periodLabel : `${formatNumber(analytics.totalTrainingMinutes, locale)} min`} />
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
          help={<AnalyticsMetricHelp metric="expected" locale={locale} />}
        />
        {analytics.totalRatedPerformances > 0 ? <PrimaryMetric
          icon={<BarChart3 className="h-4 w-4" />}
          label={locale === "de" ? "Ø Leistungsbewertung" : "Avg. performance rating"}
          value={analytics.teamAverageOverallRating === null ? noRatings(locale) : `${formatRating(analytics.teamAverageOverallRating, locale)} / 5`}
          hint={analytics.totalRatedPerformances
            ? locale === "de"
              ? `${analytics.totalRatedPerformances} Bewertungen`
              : `${analytics.totalRatedPerformances} ratings`
            : noRatings(locale)}
          help={<AnalyticsMetricHelp metric="rating" locale={locale} />}
        /> : null}
      </section> : null}
    </div>
  );
}

export function AttendanceAnalyticsSummary({ analytics, locale }: { analytics: TeamAnalyticsOverview; locale: Locale }) {
  const single = analytics.trainingSessions === 1;
  return (
    <div className="mt-4 grid border-y border-slate-100 md:grid-cols-3" data-attendance-summary>
      <AttendanceMetric label={single ? locale === "de" ? "Eingeplant" : "Expected" : locale === "de" ? "Ø Eingeplant / Training" : "Avg. expected / Training"} value={single ? String(analytics.plannedExpectedCount) : formatAverage(analytics.averageExpectedPerTraining, locale)} />
      <AttendanceMetric label={single ? locale === "de" ? "Teilgenommen" : "Participated" : locale === "de" ? "Ø Teilgenommen / Training" : "Avg. participated / Training"} value={single ? String(analytics.present + analytics.late + analytics.leftEarly) : formatAverage(analytics.averageParticipantsPerTraining, locale)} />
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
  attendanceCoverage
}: {
  locale: Locale;
  complete: boolean;
  hasData: boolean;
  missingAttendance: number;
  attendanceCoverage: number | null;
}) {
  if (!hasData) {
    return <span className="text-xs font-semibold text-slate-500">{noData(locale)}</span>;
  }

  if (complete) {
    const details = locale === "de"
      ? `Anwesenheit ${formatPercent(attendanceCoverage, locale)}`
      : `Attendance ${formatPercent(attendanceCoverage, locale)}`;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600" title={details} data-data-status="complete">
        <CheckCircle2 className="h-4 w-4" />
        {locale === "de" ? "Anwesenheit vollständig erfasst" : "Attendance fully recorded"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700" data-data-status="incomplete">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{locale === "de" ? `${missingAttendance} Anwesenheiten nicht erfasst` : `${missingAttendance} attendance outcomes not recorded`}</span>
    </span>
  );
}

function PrimaryMetric({ icon, label, value, hint, help }: { icon: ReactNode; label: string; value: string; hint: string; help?: ReactNode }) {
  return (
    <article className="h-full min-w-0 overflow-hidden rounded-lg border border-board-line bg-white p-4 shadow-soft" data-primary-kpi>
      <p className="flex min-w-0 items-start gap-2 text-xs font-bold uppercase leading-4 tracking-wide text-slate-500"><span className="mt-px shrink-0">{icon}</span><span className="min-w-0 break-words [overflow-wrap:anywhere]">{label}</span></p>
      <p className="mt-2 min-w-0 break-words text-2xl font-bold leading-tight text-board-navy tabular-nums [overflow-wrap:anywhere]">{value}</p>
      <p className="mt-1 min-w-0 break-words text-xs font-semibold leading-4 text-slate-500 [overflow-wrap:anywhere]">{hint}</p>
      {help}
    </article>
  );
}

function AttendanceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 overflow-hidden py-3 md:border-l md:border-slate-100 md:px-4 md:first:border-l-0 md:first:pl-0 md:last:pr-0" data-attendance-metric>
      <p className="min-w-0 break-words text-xs font-bold uppercase leading-4 tracking-wide text-slate-500 [overflow-wrap:anywhere]">{label}</p>
      <p className="mt-1 min-w-0 break-words text-xl font-bold leading-tight text-board-navy tabular-nums [overflow-wrap:anywhere]">{value}</p>
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
