import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/sessions/print-button";
import { TeamAnalyticsReport, type TeamAnalyticsReportMode } from "@/components/squad/team-analytics-report";
import { ButtonLink } from "@/components/ui/button";
import { formatDate, type Locale } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { getSquadAnalyticsOverview, parseAnalyticsFilters, type AnalyticsFilters } from "@/lib/squad/analytics-queries";
import { createClient } from "@/lib/supabase/server";

type AnalyticsReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnalyticsReportPage({ searchParams }: AnalyticsReportPageProps) {
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const mode = reportMode(one(params.mode));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [locale, overview] = await Promise.all([
    getUserLocale(supabase, user.id),
    getSquadAnalyticsOverview(supabase, user.id, filters)
  ]);
  const copy = reportPageCopy[locale];
  const filterLabel = describeFilters(filters, overview.positions, overview.availableEvents, locale);

  return (
    <div className="analytics-report-root mx-auto max-w-[1500px] space-y-4 py-6 print:max-w-none print:py-0">
      <nav className="no-print flex flex-col gap-3 rounded-lg border border-board-line bg-white p-4 shadow-soft lg:flex-row lg:items-center lg:justify-between" aria-label={copy.reportControls}>
        <Link href={analysisHref(filters)} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-navy">
          <ArrowLeft className="h-4 w-4" />
          {copy.back}
        </Link>
        <div className="flex flex-wrap gap-2">
          {(["attendance", "performance", "combined"] as const).map((option) => (
            <ButtonLink key={option} href={modeHref(filters, option)} variant={mode === option ? "primary" : "secondary"} className="flex-1 justify-center sm:flex-none">
              {copy.mode[option]}
            </ButtonLink>
          ))}
          <PrintButton locale={locale} className="flex-1 justify-center sm:flex-none" />
        </div>
      </nav>

      <TeamAnalyticsReport
        locale={locale}
        mode={mode}
        summaries={overview.summaries}
        teamAnalytics={overview.teamAnalytics}
        periodLabel={overview.teamAnalytics.periodRangeLabel}
        filterLabel={filterLabel}
        generatedAt={new Date().toISOString()}
      />
    </div>
  );
}

function reportMode(value?: string): TeamAnalyticsReportMode {
  return value === "attendance" || value === "performance" ? value : "combined";
}

function analysisHref(filters: AnalyticsFilters) {
  const params = filterParams(filters);
  const query = params.toString();
  return `/squad/analysis${query ? `?${query}` : ""}`;
}

function modeHref(filters: AnalyticsFilters, mode: TeamAnalyticsReportMode) {
  const params = filterParams(filters);
  params.set("mode", mode);
  return `/squad/analysis/report?${params.toString()}`;
}

function filterParams(filters: AnalyticsFilters) {
  const params = new URLSearchParams();
  if (filters.section !== "overview") params.set("section", filters.section);
  if (filters.period !== "last10") params.set("period", filters.period);
  if (filters.customFrom) params.set("from", filters.customFrom);
  if (filters.customTo) params.set("to", filters.customTo);
  if (filters.trainingId) params.set("training", filters.trainingId);
  if (filters.playerType !== "all") params.set("playerType", filters.playerType);
  if (filters.position) params.set("position", filters.position);
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.direction !== "asc") params.set("direction", filters.direction);
  if (filters.ratedOnly) params.set("ratedOnly", "true");
  return params;
}

function describeFilters(
  filters: AnalyticsFilters,
  positions: string[],
  events: Array<{ id: string; date: string; label?: string }>,
  locale: Locale
) {
  const values: string[] = [];
  const selectedEvent = filters.trainingId ? events.find((event) => event.id === filters.trainingId) : undefined;
  if (selectedEvent) values.push(`${selectedEvent.label || (locale === "de" ? "Training" : "Training")} · ${formatDate(selectedEvent.date, locale)}`);
  if (filters.playerType !== "all") values.push(filters.playerType === "trial" ? (locale === "de" ? "Probetraining-Spieler" : "Trial players") : (locale === "de" ? "Kaderspieler" : "Roster players"));
  if (filters.position && positions.includes(filters.position)) values.push(filters.position);
  if (filters.ratedOnly) values.push(locale === "de" ? "Nur bewertete Spieler" : "Rated players only");
  return values.length ? values.join(" · ") : (locale === "de" ? "Alle Spieler der aktiven Mannschaft" : "All players in the active squad");
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const reportPageCopy = {
  en: {
    reportControls: "Report controls",
    back: "Back to Analytics",
    mode: { attendance: "Attendance", performance: "Performance", combined: "Combined" }
  },
  de: {
    reportControls: "Berichtssteuerung",
    back: "Zurück zur Analyse",
    mode: { attendance: "Anwesenheit", performance: "Leistung", combined: "Gesamtübersicht" }
  }
} as const;
