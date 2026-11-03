import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarCheck, Target, TrendingUp, Dumbbell, UserCheck } from "lucide-react";
import { getActiveLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { formatDate, type Locale } from "@/lib/i18n";
import { trainingFocusLabel } from "@/lib/i18n/training-labels";
import { formatPercent, formatRating, type AnalyticsSection, type TeamAnalyticsOverview, type TeamAnalyticsEvent } from "@/lib/squad/analytics";
import { AttendanceAnalyticsSummary } from "@/components/squad/analytics-primary-summary";
import { cn } from "@/lib/utils";
import { AttendanceBreakdown } from "./analytics-overview";
import { AnalyticsMetricHelp } from "./analytics-methodology";

export async function AnalyticsSectionPanel({
  section,
  teamAnalytics
}: {
  section: AnalyticsSection;
  teamAnalytics: TeamAnalyticsOverview;
}) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  if (section === "training") {
    return (
      <div className="space-y-4">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title={ui("Training Sessions")} icon={<CalendarCheck className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label={ui("Sessions")} value={teamAnalytics.trainingSessions} />
            <MiniStat label={locale === "de" ? "Gesamtminuten" : "Total minutes"} value={teamAnalytics.totalTrainingMinutes ?? "—"} />
            <MiniStat label={locale === "de" ? "Ø Dauer" : "Average duration"} value={teamAnalytics.averageTrainingMinutes === null ? "—" : `${Math.round(teamAnalytics.averageTrainingMinutes)} min`} />
            <MiniStat label={ui("Planned sessions")} value={`${teamAnalytics.planCoverage.planned}/${teamAnalytics.planCoverage.total}`} />
          </div>
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer text-sm font-bold text-board-navy">{locale === "de" ? "Reflexionsbasis" : "Review evidence"} · {teamAnalytics.reviewedSessions}/{teamAnalytics.trainingSessions}</summary>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label={ui("Quality")} value={formatRating(teamAnalytics.averageSessionQuality, locale)} />
            <MiniStat label={ui("Intensity")} value={formatRating(teamAnalytics.averageSessionIntensity, locale)} />
            <MiniStat label={ui("Player Response")} value={formatRating(teamAnalytics.averagePlayerResponse, locale)} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <OutcomeBadge label={ui("Achieved")} value={teamAnalytics.objectiveOutcomes.achieved} />
            <OutcomeBadge label={ui("Partly")} value={teamAnalytics.objectiveOutcomes.partly_achieved} />
            <OutcomeBadge label={ui("Not achieved")} value={teamAnalytics.objectiveOutcomes.not_achieved} />
          </div>
          </details>
          </Panel>
          <Panel title={ui("Training Focus")} icon={<Target className="h-5 w-5" />}>
          {teamAnalytics.focusDistribution.length ? (
            <div className="space-y-3">
              {teamAnalytics.focusDistribution.map((item) => (
                <ProgressRow key={item.label} label={trainingFocusLabel(item.label, locale)} value={`${item.count}x`} percent={item.percentage} />
              ))}
            </div>
          ) : (
            <EmptyPanelText>{ui("No structured focus has been saved for trainings in this period.")}</EmptyPanelText>
          )}
          </Panel>
        </section>
        <TrainingAnalyticsTable events={teamAnalytics.events} locale={locale} />
      </div>
    );
  }

  if (section === "attendance") {
    return (
      <section className="border-y border-board-line py-5">
        <div className="flex items-center gap-2 text-lg font-bold text-board-navy">
          <UserCheck className="h-5 w-5 text-board-green" />
          {locale === "de" ? "Anwesenheit" : "Attendance"}
        </div>
        <AttendanceAnalyticsSummary analytics={teamAnalytics} locale={locale} />
        <AttendanceBreakdown analytics={teamAnalytics} locale={locale} />
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer text-sm font-bold">{locale === "de" ? "Weitere Kennzahlen" : "More metrics"}</summary>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><MiniStat label={locale === "de" ? "Teilnahmequote" : "Participation rate"} value={formatPercent(teamAnalytics.teamParticipationRate, locale)} /><AnalyticsMetricHelp metric="participation" locale={locale} /></div>
            <div><MiniStat label={locale === "de" ? "Anwesenheit" : "Attendance"} value={formatPercent(teamAnalytics.teamAttendanceRate, locale)} /><AnalyticsMetricHelp metric="attendance" locale={locale} /></div>
            <div><MiniStat label={locale === "de" ? "Anwesenheitsdaten erfasst" : "Attendance recorded"} value={formatPercent(teamAnalytics.dataCoverageRate, locale)} /><AnalyticsMetricHelp metric="coverage" locale={locale} /></div>
          </div>
        </details>
      </section>
    );
  }

  if (section === "development") {
    return (
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title={ui("Development Goals")} icon={<Target className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label={ui("Active goals")} value={teamAnalytics.activeDevelopmentGoals} />
            <MiniStat label={ui("Players with goals")} value={teamAnalytics.playersWithActiveGoals} />
          </div>
          <p className="mt-3 text-sm text-slate-600">{ui("Due for review")}: {teamAnalytics.goalsDueForReview} · {ui("Achieved in period")}: {teamAnalytics.goalsAchievedInPeriod}</p>
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{ui("Active goals by category")}</p>
            <ChipList items={teamAnalytics.activeGoalCategoryDistribution.map((item) => `${ui(developmentCategoryLabel(item.category, locale))}: ${item.count}`)} empty={ui("No active goals yet.")} />
          </div>
        </Panel>
        <Panel title={ui("Progress Updates")} icon={<TrendingUp className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label={ui("Updates in period")} value={teamAnalytics.progressUpdatesInPeriod} />
            <MiniStat label={ui("Players updated")} value={teamAnalytics.progressPlayersInPeriod} />
          </div>
          <div className="mt-4 space-y-3">
            {teamAnalytics.latestProgressDistribution.length ? (
              teamAnalytics.latestProgressDistribution.map((item) => (
                <ProgressRow
                  key={item.progress}
                  label={ui(progressLabel(item.progress))}
                  value={String(item.count)}
                  percent={teamAnalytics.activeDevelopmentGoals ? item.count / teamAnalytics.activeDevelopmentGoals : 0}
                />
              ))
            ) : (
              <EmptyPanelText>{ui("No active goal progress to summarize yet.")}</EmptyPanelText>
            )}
          </div>
        </Panel>
      </section>
    );
  }

  if (section === "drills") {
    return (
      <Panel title={ui("Drill Usage")} icon={<Dumbbell className="h-5 w-5" />}>
        <div className="grid gap-3 sm:grid-cols-4">
          <MiniStat label={ui("Instances used")} value={teamAnalytics.drillInstancesUsed} />
          <MiniStat label={ui("Unique linked drills")} value={teamAnalytics.uniqueDrillsUsed} />
          <MiniStat label={ui("Reviewed")} value={teamAnalytics.reviewedDrillInstances} />
          <MiniStat label={ui("Effectiveness")} value={formatRating(teamAnalytics.averageDrillEffectiveness, locale)} />
        </div>
        {teamAnalytics.reviewedDrillInstances > 0 ? <details className="mt-4">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">{locale === "de" ? "Rückmeldungen" : "Feedback"}</summary>
          <dl className="flex flex-wrap gap-5 text-sm">{[
            [locale === "de" ? "Gut funktioniert" : "Worked well", teamAnalytics.drillFeedbackCounts.worked_well],
            [locale === "de" ? "Anpassung nötig" : "Needs adjustment", teamAnalytics.drillFeedbackCounts.needs_adjustment],
            [locale === "de" ? "Nicht effektiv" : "Not effective", teamAnalytics.drillFeedbackCounts.not_effective]
          ].map(([label, count]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="font-bold tabular-nums">{count}</dd></div>)}</dl>
        </details> : null}
        {teamAnalytics.drillUsage.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{ui("Drill")}</th>
                  <th className="py-2 pr-3 text-right">{ui("Uses")}</th>
                  <th className="py-2 pr-3 text-right">{ui("Reviewed")}</th>
                  <th className="py-2 pr-3 text-right">{ui("Effectiveness")}</th>
                  <th className="py-2 text-right">{ui("Last used")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamAnalytics.drillUsage.map((drill) => (
                  <tr key={`${drill.drillId ?? drill.title}-${drill.lastUsedAt ?? "never"}`}>
                    <td translate="no" className="py-3 pr-3 font-bold text-board-navy">{drill.drillId ? <Link className="hover:underline" href={`/drills/${drill.drillId}`}>{drill.title}</Link> : drill.title}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{drill.uses}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{drill.reviewed}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatRating(drill.averageEffectiveness, locale)}</td>
                    <td className="py-3 text-right tabular-nums">{drill.lastUsedAt ? formatShortDate(drill.lastUsedAt, locale) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanelText>{ui("No drill usage in this team and period yet.")}</EmptyPanelText>
        )}
      </Panel>
    );
  }

  return null;
}

export function TrainingAnalyticsTable({ events, locale }: { events: TeamAnalyticsEvent[]; locale: Locale }) {
  const de = locale === "de";
  if (!events.length) return <p className="py-5 text-sm text-slate-600">{de ? "Keine Trainingsdaten in diesem Zeitraum." : "No training data in this period."}</p>;
  return <section className="min-w-0 border-t border-board-line py-5">
    <h2 className="text-lg font-bold text-board-navy">{de ? "Trainingseinheiten im Vergleich" : "Training comparison"}</h2>
    <div className="mt-4 hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm">
      <thead className="text-xs uppercase text-slate-500"><tr>{[de ? "Training" : "Training", de ? "Teilnehmer" : "Participants", de ? "Anwesenheit bei Einplanung" : "Attendance when expected", de ? "Bewertungsbasis" : "Rating evidence", de ? "Reflexion / Plan" : "Review / Plan"].map(label => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{events.map(item => <tr key={item.event.id}>
        <td className="px-3 py-3"><Link href={`/trainings/${item.event.id}`} className="font-bold text-board-navy hover:underline"><span translate="no">{item.event.label || "Training"}</span></Link><p className="text-xs text-slate-500">{formatDate(item.event.date, locale)} · {item.event.startTime}</p></td>
        <td className="px-3 py-3 tabular-nums">{item.attendance.attended}</td>
        <td className="px-3 py-3"><MetricStack value={formatPercent(item.attendance.attendanceWhenExpectedRate, locale)} detail={`${item.attendance.attendedWhenExpected} / ${item.attendance.expectedRecorded}`} /></td>
        <td className="px-3 py-3"><p>{item.attendance.totalRated} {de ? "Bewertungen" : "ratings"}</p><details><summary className="min-h-8 cursor-pointer text-xs font-semibold text-slate-600">{de ? "Details" : "Details"}</summary><p>{formatRating(item.attendance.averageOverallRating, locale)} · {formatPercent(item.attendance.ratingCoverageRate, locale)}</p><p>{item.attendance.ratingCompletedCount}/{item.attendance.ratingEligibleCount}</p><Link className="inline-flex min-h-10 items-center text-board-green hover:underline" href={`/trainings/${item.event.id}/ratings`}>{de ? "Bewertungen öffnen" : "Open ratings"}</Link></details></td>
        <td className="px-3 py-3 text-slate-600"><TrainingEvidence item={item} locale={locale} /></td>
      </tr>)}</tbody>
    </table></div>
    <div className="mt-4 space-y-3 lg:hidden">{events.map(item => <article key={item.event.id} className="min-w-0 rounded-md border border-board-line p-3">
      <Link href={`/trainings/${item.event.id}`} className="inline-flex min-h-11 items-center break-words font-bold text-board-navy hover:underline"><span translate="no">{item.event.label || "Training"}</span></Link>
      <p className="text-sm text-slate-500">{formatDate(item.event.date, locale)} · {item.event.startTime}</p>
      <div className="mt-3 grid grid-cols-2 gap-2"><CompactMetric label={de ? "Teilnehmer" : "Participants"} value={String(item.attendance.attended)} /><CompactMetric label={de ? "Anwesenheit bei Einplanung" : "Attendance when expected"} value={`${formatPercent(item.attendance.attendanceWhenExpectedRate, locale)} · ${item.attendance.attendedWhenExpected}/${item.attendance.expectedRecorded}`} /></div>
      <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{de ? "Bewertungs- und Reflexionsbasis" : "Rating and review evidence"}</summary>
        <p className="text-sm">{item.attendance.totalRated} {de ? "Bewertungen" : "ratings"} · {formatRating(item.attendance.averageOverallRating, locale)}</p>
        <p className="mt-1 text-sm">{de ? "Bewertungsabdeckung" : "Rating coverage"}: {formatPercent(item.attendance.ratingCoverageRate, locale)} · {item.attendance.ratingCompletedCount}/{item.attendance.ratingEligibleCount}</p>
        <TrainingEvidence item={item} locale={locale} />
        <Link className="inline-flex min-h-11 items-center text-sm font-bold text-board-green" href={`/trainings/${item.event.id}/ratings`}>{de ? "Bewertungen öffnen" : "Open ratings"}</Link>
      </details>
    </article>)}</div>
  </section>;
}

function TrainingEvidence({ item, locale }: { item: TeamAnalyticsEvent; locale: Locale }) {
  const de = locale === "de";
  const review = item.review;
  return <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
    {item.event.focus ? <p className="mb-1">{trainingFocusLabel(item.event.focus, locale)}</p> : null}
    <p>{de ? "Plan" : "Plan"}: {item.planDrillCount > 0 ? <Link className="underline" href={`/trainings/${item.event.id}/plan`}>{de ? "Vorhanden" : "Available"}</Link> : "—"}</p>
    {review ? <details className="mt-1"><summary className="min-h-11 cursor-pointer py-2">{de ? "Gespeicherte Reflexion" : "Saved review"}</summary>
      <dl className="space-y-1 text-xs">
        <div><dt>{de ? "Qualität / Intensität / Spielerreaktion" : "Quality / Intensity / Player response"}</dt><dd>{formatRating(review.overallQuality, locale)} / {formatRating(review.intensity, locale)} / {formatRating(review.playerResponse, locale)}</dd></div>
        <div><dt>{de ? "Zielerreichung" : "Objective outcome"}</dt><dd>{createSystemTranslator(locale)(review.objectiveOutcome === "achieved" ? "Achieved" : review.objectiveOutcome === "partly_achieved" ? "Partly" : "Not achieved")}</dd></div>
      </dl>
      <Link className="inline-flex min-h-11 items-center text-board-green underline" href={`/trainings/${item.event.id}/review`}>{de ? "Reflexion öffnen" : "Open review"}</Link>
    </details> : <p className="mt-1">{de ? "Reflexion" : "Review"}: —</p>}
  </div>;
}

export function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 border-t border-board-line py-5">
      <div className="mb-4 flex min-w-0 items-start gap-2 text-lg font-bold leading-tight text-board-navy">
        <span className="shrink-0 text-board-green">{icon}</span>
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{title}</span>
      </div>
      {children}
    </section>
  );
}

export function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md bg-slate-50 p-3">
      <p className="min-w-0 break-words text-xs font-bold uppercase leading-4 tracking-wide text-slate-500 [overflow-wrap:anywhere]">{label}</p>
      <p className="mt-1 min-w-0 break-words text-xl font-bold leading-tight text-board-navy tabular-nums [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

export function OutcomeBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-100 px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="ml-2 text-sm font-bold text-board-navy">{value}</span>
    </div>
  );
}

export function ProgressRow({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 break-words font-semibold text-board-navy [overflow-wrap:anywhere]">{label}</span>
        <span className="shrink-0 font-bold tabular-nums text-slate-600">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-board-green" style={{ width: `${Math.max(0, Math.min(100, Math.round(percent * 100)))}%` }} />
      </div>
    </div>
  );
}

export function ChipList({ items, empty }: { items: string[]; empty: string }) {
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

export function EmptyPanelText({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">{children}</p>;
}

export function MetricStack({ value, detail }: { value: string; detail: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full flex-col">
      <span className="min-w-0 break-words font-bold leading-tight text-board-navy tabular-nums [overflow-wrap:anywhere]">{value}</span>
      <span className="min-w-0 break-words text-xs font-semibold leading-4 text-slate-500 [overflow-wrap:anywhere]">{detail}</span>
    </span>
  );
}

export function CompactMetric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-md border border-slate-100 p-2", muted && "bg-green-50")}>
      <p className="min-w-0 break-words text-xs font-bold uppercase leading-4 text-slate-500 [overflow-wrap:anywhere]">{label}</p>
      <p className="mt-1 min-w-0 break-words font-bold leading-tight text-board-navy tabular-nums [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

export function developmentCategoryLabel(category: string, locale: Locale = "en") {
  const labels: Record<string, string> = {
    technical: "Technical",
    tactical: "Tactical",
    physical: "Physical",
    mental: "Mental",
    other: "Other"
  };
  if (category === "physical" && locale === "de") return "Körperlich";
  return createSystemTranslator(locale)(labels[category] ?? category);
}

export function progressLabel(progress: string) {
  const labels: Record<string, string> = {
    needs_attention: "Needs attention",
    developing: "Developing",
    consistent: "Consistent",
    achieved: "Achieved",
    none: "No progress update"
  };
  return labels[progress] ?? progress;
}

export function formatShortDate(date: string, locale: Locale = "en") {
  return formatDate(date, locale, { day: "2-digit", month: "short" });
}
