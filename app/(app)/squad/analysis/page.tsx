import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { SquadNav } from "@/components/squad/squad-nav";
import { AnalyticsPrimarySummary } from "@/components/squad/analytics-primary-summary";
import { AnalyticsControls } from "@/components/squad/analytics/analytics-controls";
import { AnalyticsOverview } from "@/components/squad/analytics/analytics-overview";
import { AnalyticsSectionPanel } from "@/components/squad/analytics/analytics-detail-sections";
import { AttendanceAnalyticsTable, PerformanceAnalyticsTable } from "@/components/squad/analytics/analytics-players";
import { AnalyticsMethodology } from "@/components/squad/analytics/analytics-methodology";
import { analyticsCopy } from "@/components/squad/analytics/analytics-copy";
import { hrefFor } from "@/components/squad/analytics/analytics-links";
import { getSquadAnalyticsOverview, parseAnalyticsFilters } from "@/lib/squad/analytics-queries";
import type { AnalyticsPeriod } from "@/lib/squad/analytics";
import { createClient } from "@/lib/supabase/server";

type AnalysisPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const methodology = params.view === "methodology";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const locale = await getUserLocale(supabase, user.id);
  const copy = analyticsCopy[locale];
  const { summaries, positions, seasonSettings, teamAnalytics, availableEvents } = await getSquadAnalyticsOverview(supabase, user.id, filters);
  const periodDefinition = getPeriodDefinition(filters, teamAnalytics.events.map((item) => item.event), seasonSettings, locale);
  const filtered = filters.playerType !== "all" || Boolean(filters.position || filters.trainingId || filters.ratedOnly);
  const resetHref = hrefFor({ ...filters, playerType: "all", position: undefined, trainingId: undefined, ratedOnly: false });
  return (
    <PageContainer width="wide" translate="no">
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} />
      <SquadNav />
      <AnalyticsControls filters={filters} methodology={methodology} positions={positions}
        events={availableEvents.map(({ id, date, startTime, label }) => ({ id, date, startTime, label }))}
        periodLabel={periodDefinition.rangeLabel} periodNote={periodDefinition.note} locale={locale} />
      {methodology ? <AnalyticsMethodology locale={locale} /> : <>
        <AnalyticsPrimarySummary locale={locale} analytics={teamAnalytics} filteredPlayerCount={summaries.length}
          playerType={filters.playerType} position={filters.position} periodLabel={periodDefinition.rangeLabel}
          singleTraining={Boolean(filters.trainingId) && teamAnalytics.trainingSessions === 1}
          showMetrics={filters.section === "overview"} />
        {filters.section === "overview"
          ? <AnalyticsOverview analytics={teamAnalytics} filters={filters} locale={locale} />
          : <AnalyticsSectionPanel section={filters.section} teamAnalytics={teamAnalytics} />}
        {(filters.section === "players" || filters.section === "attendance") && (summaries.length ? (
          filters.section === "attendance"
            ? <AttendanceAnalyticsTable summaries={summaries} filters={filters} />
            : <PerformanceAnalyticsTable summaries={summaries} filters={filters} />
        ) : (
          <section className="border-y border-board-line py-8">
            <h2 className="text-lg font-bold text-board-navy">{locale === "de" ? "Keine Daten für diese Filter." : "No data for these filters."}</h2>
            <Link href={filtered ? resetHref : "/trainings"} className="mt-3 inline-flex min-h-11 items-center font-bold text-board-green">
              {filtered ? copy.resetFilters : locale === "de" ? "Trainings öffnen" : "Open trainings"}
            </Link>
          </section>
        ))}
      </>}
    </PageContainer>
  );
}

function getPeriodDefinition(
  filters: {
    period: AnalyticsPeriod;
    customFrom?: string;
    customTo?: string;
  },
  events: Array<{ date: string }>,
  seasonSettings: { seasonStartMonth: number; seasonStartDay: number },
  locale: "en" | "de"
) {
  const copy = analyticsCopy[locale];
  const today = new Date();
  if (filters.period === "custom") {
    if (!filters.customFrom || !filters.customTo) return { shortLabel: copy.periods.custom, rangeLabel: locale === "de" ? "Von- und Bis-Datum wählen" : "Choose from and to dates", note: locale === "de" ? "Nutze TT.MM.JJJJ, zum Beispiel 01.07.2026." : "Use dd.mm.yyyy, for example 01.07.2026." };
    if (filters.customFrom > filters.customTo) return { shortLabel: copy.periods.custom, rangeLabel: locale === "de" ? "Ungültiger Zeitraum" : "Invalid custom range", note: locale === "de" ? "Das Von-Datum muss vor dem Bis-Datum liegen." : "The from date must be before the to date." };
    return { shortLabel: copy.periods.custom, rangeLabel: `${formatDate(filters.customFrom, locale)} – ${formatDate(filters.customTo, locale)}` };
  }
  if (filters.period === "season") {
    const range = seasonDateRange(today, seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay);
    return { shortLabel: copy.periods.season, rangeLabel: `${formatDate(range.from, locale)} – ${formatDate(range.to, locale)}` };
  }
  if (filters.period === "30d" || filters.period === "90d") {
    const days = filters.period === "30d" ? 30 : 90;
    const to = dateOnly(today);
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - days + 1);
    return { shortLabel: copy.periods[filters.period], rangeLabel: `${formatDate(dateOnly(fromDate), locale)} – ${formatDate(to, locale)}` };
  }

  const dates = Array.from(new Set(events.map((event) => event.date).filter(Boolean))).sort();
  if (!dates.length) return { shortLabel: copy.periods[filters.period], rangeLabel: copy.noTrainingData };
  return {
    shortLabel: copy.periods[filters.period],
    rangeLabel: `${formatDate(dates[0], locale)} – ${formatDate(dates[dates.length - 1], locale)}`,
    note: filters.period === "last5" || filters.period === "last10" ? copy.availableTrainings(events.length) : undefined
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
