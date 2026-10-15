import { getActiveLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { formatDate, formatNumber, type Locale } from "@/lib/i18n";
import { trainingFocusLabel } from "@/lib/i18n/training-labels";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowUpDown, CalendarCheck, Dumbbell, Filter, Info, Minus, Printer, Target, TrendingDown, TrendingUp, UserCheck } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { AnalyticsPrimarySummary, AttendanceAnalyticsSummary } from "@/components/squad/analytics-primary-summary";
import { ReliabilityValue } from "@/components/squad/reliability-value";
import { STICKY_TABLE_HEADER_CLASS } from "@/components/squad/player-table-layers";
import { ButtonLink } from "@/components/ui/button";
import { SquadNav } from "@/components/squad/squad-nav";
import {
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
  type PlayerAnalyticsSummary,
  type TeamAnalyticsEvent,
  type TeamAnalyticsOverview
} from "@/lib/squad/analytics";
import { getSquadAnalyticsOverview, parseAnalyticsFilters, type AnalyticsFilters } from "@/lib/squad/analytics-queries";
import { createClient } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

type AnalysisPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const analyticsPlayerTypeOptions: Record<"en" | "de", Array<{ id: AnalyticsPlayerTypeFilter; label: string; compact: string }>> = {
  en: [
    { id: "all", label: "All players", compact: "All" },
    { id: "roster", label: "Roster players", compact: "Roster" },
    { id: "trial", label: "Trial players", compact: "Trial" }
  ],
  de: [
    { id: "all", label: "Alle Spieler", compact: "Alle Spieler" },
    { id: "roster", label: "Kaderspieler", compact: "Kader" },
    { id: "trial", label: "Probespieler", compact: "Probe" }
  ]
};

const analyticsSortOptions: Record<"en" | "de", Array<{ id: AnalyticsSortKey; label: string }>> = {
  en: [
    { id: "name", label: "Name" },
    { id: "position", label: "Position" },
    { id: "status", label: "Status" },
    { id: "trainings", label: "Trainings" },
    { id: "ratingCoverage", label: "Rating coverage" },
    { id: "attendance", label: "Attendance when expected" },
    { id: "average", label: "Average rating" },
    { id: "latestFive", label: "Latest 5" },
    { id: "trend", label: "Trend" },
    { id: "reliability", label: "Reliability" },
    { id: "lastTraining", label: "Last training" },
    { id: "evidence", label: "Evidence" },
    { id: "coachAssessment", label: "Coach assessment" }
  ],
  de: [
    { id: "name", label: "Name" },
    { id: "position", label: "Position" },
    { id: "status", label: "Status" },
    { id: "trainings", label: "Trainingseinheiten" },
    { id: "ratingCoverage", label: "Bewertungsabdeckung" },
    { id: "attendance", label: "Anwesenheit bei Einplanung" },
    { id: "average", label: "Durchschnittsbewertung" },
    { id: "latestFive", label: "Letzte 5" },
    { id: "trend", label: "Trend" },
    { id: "reliability", label: "Zuverlässigkeit" },
    { id: "lastTraining", label: "Letztes Training" },
    { id: "evidence", label: "Belege" },
    { id: "coachAssessment", label: "Trainereinschätzung" }
  ]
};

const analyticsCopy = {
  en: {
    eyebrow: "Squad",
    title: "Analytics",
    description: "Compare player availability, performance ratings, reliability and manual coach assessments without mixing observations with automatic decisions.",
    helpTitle: "How analytics are calculated",
    filters: "Filters",
    players: "Players",
    position: "Position",
    allPositions: "All positions",
    period: "Period",
    training: "Training session",
    allTrainings: "All trainings in period",
    applyTraining: "Apply training",
    unnamedTraining: "Training",
    customFrom: "Custom period from date",
    customTo: "Custom period to date",
    datePlaceholder: "dd.mm.yyyy",
    apply: "Apply",
    showing: "Showing",
    all: "All",
    sortedBy: (label: string, direction: AnalyticsSortDirection) => `Sorted by ${label} ${direction === "asc" ? "ascending" : "descending"}`,
    resetFilters: "Reset filters",
    activeTeam: "Active team",
    attended: (count: number) => `${count} participated`,
    noDataTitle: "No analytics data for this view.",
    noDataDescription: "Adjust the filters or complete trainings with attendance and ratings.",
    createTraining: "Create training",
    noTrainingData: "No training data in this period",
    availableTrainings: (count: number) => `${count} training${count === 1 ? "" : "s"} available`,
    periods: {
      last5: "Last 5 trainings",
      last10: "Last 10 trainings",
      "30d": "Last 30 days",
      "90d": "Last 90 days",
      season: "This season",
      all: "All time",
      custom: "Custom range"
    },
    sections: {
      overview: "Overview",
      training: "Training",
      attendance: "Attendance",
      development: "Development",
      drills: "Drill Usage",
      players: "Players"
    },
    metrics: {
      players: "Players",
      trainings: "Trainings",
      attendanceWhenExpected: "Attendance when expected",
      ratingCoverage: "Rating coverage",
      averageRating: "Average performance rating"
    },
    headers: {
      player: "Player",
      position: "Position",
      status: "Status",
      trainings: "Trainings",
      attendance: "Participation",
      average: "Average",
      latestFive: "Latest 5",
      trend: "Trend",
      reliability: "Reliability",
      evidence: "Evidence",
      coachAssessment: "Coach assessment"
    },
    helpItems: [
      { title: "Average rating", text: "only final overall ratings intentionally entered by the coach. Unrated trainings are not counted as 3." },
      { title: "Trend", text: "latest five rated trainings compared with the five rated trainings before them, inside the selected period." },
      { title: "Attendance when expected", text: "Present, Late and Left early divided by expected trainings with a recorded actual outcome. Not expected trainings are excluded." },
      { title: "Rating coverage", text: "saved overall ratings for expected Players who were Present or Late, divided by all ratings expected for those Players." },
      { title: "Data coverage", text: "recorded actual attendance divided by all Player-training combinations in the selected view." },
      { title: "Planning and actual outcome", text: "Expected and Not expected describe planning. Participated and Absent describe what actually happened." },
      { title: "Reliability", text: "existing malus rules; late only counts when the penalty is active." },
      { title: "Evidence", text: "shows how many rated trainings support the performance view." },
      { title: "Coach assessment", text: "manual coach marker, separate from automatic summaries." },
      { title: "Drill usage", text: "scoped to the active team and selected historical training period." }
    ]
  },
  de: {
    eyebrow: "Kader",
    title: "Analysen",
    description: "Vergleiche Verfügbarkeit, Leistungsbewertungen, Zuverlässigkeit und manuelle Trainereinschätzungen, ohne Beobachtungen mit automatischen Hinweisen zu vermischen.",
    helpTitle: "So werden die Analysen berechnet",
    filters: "Filter",
    players: "Spieler",
    position: "Position",
    allPositions: "Alle Positionen",
    period: "Zeitraum",
    training: "Trainingseinheit",
    allTrainings: "Alle Trainings im Zeitraum",
    applyTraining: "Training anwenden",
    unnamedTraining: "Training",
    customFrom: "Zeitraum von Datum",
    customTo: "Zeitraum bis Datum",
    datePlaceholder: "TT.MM.JJJJ",
    apply: "Anwenden",
    showing: "Anzeige",
    all: "Alle Spieler",
    sortedBy: (label: string, direction: AnalyticsSortDirection) => `Nach ${label} ${direction === "asc" ? "aufsteigend" : "absteigend"} sortiert`,
    resetFilters: "Filter zurücksetzen",
    activeTeam: "Aktive Mannschaft",
    attended: (count: number) => `${count} teilgenommen`,
    noDataTitle: "Keine Analysedaten für diese Ansicht.",
    noDataDescription: "Passe die Filter an oder schließe Trainingseinheiten mit Anwesenheit und Bewertungen ab.",
    createTraining: "Training erstellen",
    noTrainingData: "Keine Trainingsdaten in diesem Zeitraum",
    availableTrainings: (count: number) => `${count} Trainingseinheit${count === 1 ? "" : "en"} verfügbar`,
    periods: {
      last5: "Letzte 5 Trainingseinheiten",
      last10: "Letzte 10 Trainingseinheiten",
      "30d": "Letzte 30 Tage",
      "90d": "Letzte 90 Tage",
      season: "Diese Saison",
      all: "Gesamter Zeitraum",
      custom: "Benutzerdefinierter Zeitraum"
    },
    sections: {
      overview: "Übersicht",
      training: "Training",
      attendance: "Anwesenheit",
      development: "Entwicklung",
      drills: "Übungsnutzung",
      players: "Spieler"
    },
    metrics: {
      players: "Spieler",
      trainings: "Trainingseinheiten",
      attendanceWhenExpected: "Anwesenheit bei Einplanung",
      ratingCoverage: "Bewertungsabdeckung",
      averageRating: "Ø Leistungsbewertung"
    },
    headers: {
      player: "Spieler",
      position: "Position",
      status: "Status",
      trainings: "Trainingseinheiten",
      attendance: "Teilnahmequote",
      average: "Durchschnitt",
      latestFive: "Letzte 5",
      trend: "Trend",
      reliability: "Zuverlässigkeit",
      evidence: "Belege",
      coachAssessment: "Trainereinschätzung"
    },
    helpItems: [
      { title: "Durchschnittsbewertung", text: "nur abschließende Gesamtbewertungen, die der Trainer bewusst eingetragen hat. Nicht bewertete Trainings zählen nicht als 3." },
      { title: "Trend", text: "die letzten fünf bewerteten Trainings im Vergleich zu den fünf bewerteten Trainings davor, innerhalb des gewählten Zeitraums." },
      { title: "Anwesenheit bei Einplanung", text: "Anwesend, Verspätet und Training abgebrochen geteilt durch eingeplante Trainings mit erfasstem tatsächlichem Ergebnis. Nicht eingeplante Trainings sind ausgeschlossen." },
      { title: "Bewertungsabdeckung", text: "gespeicherte Gesamtbewertungen für eingeplante Spieler, die anwesend oder verspätet waren, geteilt durch alle für diese Spieler erwarteten Bewertungen." },
      { title: "Datenvollständigkeit", text: "erfasste tatsächliche Anwesenheiten geteilt durch alle Spieler-Training-Kombinationen der gewählten Ansicht." },
      { title: "Planung und tatsächliches Ergebnis", text: "Eingeplant und Nicht eingeplant beschreiben die Planung. Teilgenommen und Abwesend beschreiben das tatsächliche Ergebnis." },
      { title: "Zuverlässigkeit", text: "bestehende Malus-Regeln; Verspätung zählt nur, wenn der Abzug aktiv ist." },
      { title: "Belege", text: "zeigt, wie viele bewertete Trainings die Leistungsansicht stützen." },
      { title: "Trainereinschätzung", text: "manuelle Einschätzung des Trainers, getrennt von automatischen Zusammenfassungen." },
      { title: "Übungsnutzung", text: "bezogen auf die aktive Mannschaft und den gewählten historischen Trainingszeitraum." }
    ]
  }
} as const;

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getUserLocale(supabase, user.id);
  const copy = analyticsCopy[locale];
  const playerTypeOptions = analyticsPlayerTypeOptions[locale];
  const sortOptions = analyticsSortOptions[locale];
  const { summaries, positions, seasonSettings, teamAnalytics, availableEvents } = await getSquadAnalyticsOverview(supabase, user.id, filters);
  const periodDefinition = getPeriodDefinition(filters, teamAnalytics.events.map((item) => item.event), seasonSettings, locale);
  const activeFilters = countActiveFilters(filters);

  return (
    <PageContainer width="wide" translate="no">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={(
          <>
            <ButtonLink href={reportHrefFor(filters)} variant="secondary" className="justify-center">
              <Printer className="h-4 w-4" />
              {locale === "de" ? "Bericht erstellen" : "Create report"}
            </ButtonLink>
            <ButtonLink href="#analytics-help" variant="secondary" className="justify-center">
              <Info className="h-4 w-4" />
              {copy.helpTitle}
            </ButtonLink>
          </>
        )}
      />

      <SquadNav />

      <section className="flex flex-wrap gap-2 rounded-lg border border-board-line bg-white p-3 shadow-soft">
        {(Object.keys(copy.sections) as AnalyticsSection[]).map((section) => (
          <FilterLink key={section} href={hrefFor({ ...filters, section })} active={filters.section === section}>
            {copy.sections[section]}
          </FilterLink>
        ))}
      </section>

      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 md:hidden">
          <Filter className="h-4 w-4" />
          {copy.filters}{activeFilters ? ` (${activeFilters})` : ""}
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[0.8fr_0.8fr_1.25fr_1.15fr] md:mt-0">
          <ControlField label={copy.players}>
            <div className="flex flex-wrap gap-2">
              {playerTypeOptions.map((option) => (
                <FilterLink key={option.id} href={hrefFor({ ...filters, playerType: option.id })} active={filters.playerType === option.id}>
                  {option.label}
                </FilterLink>
              ))}
            </div>
          </ControlField>
          <ControlField label={copy.position}>
            <div className="flex flex-wrap gap-2">
              <FilterLink href={hrefFor({ ...filters, position: undefined })} active={!filters.position}>{copy.allPositions}</FilterLink>
              {positions.map((position) => (
                <FilterLink key={position} href={hrefFor({ ...filters, position })} active={filters.position === position}>
                  {position}
                </FilterLink>
              ))}
            </div>
          </ControlField>
          <ControlField label={copy.period}>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(copy.periods) as AnalyticsPeriod[]).map((period) => (
                <FilterLink key={period} href={hrefFor({ ...filters, period, trainingId: undefined })} active={filters.period === period}>
                  {copy.periods[period]}
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
                <span className="sr-only">{copy.customFrom}</span>
                <input
                  name="from"
                  placeholder={copy.datePlaceholder}
                  defaultValue={formatGermanDate(filters.customFrom)}
                  className="h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm font-semibold text-board-navy outline-none placeholder:text-slate-400 focus:border-board-green focus:ring-4 focus:ring-green-100"
                />
              </label>
              <label>
                <span className="sr-only">{copy.customTo}</span>
                <input
                  name="to"
                  placeholder={copy.datePlaceholder}
                  defaultValue={formatGermanDate(filters.customTo)}
                  className="h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm font-semibold text-board-navy outline-none placeholder:text-slate-400 focus:border-board-green focus:ring-4 focus:ring-green-100"
                />
              </label>
              <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-board-navy px-3 text-sm font-bold text-white hover:bg-slate-800">
                {copy.apply}
              </button>
            </form>
            <p className="mt-2 text-sm font-semibold text-board-navy">{periodDefinition.rangeLabel}</p>
            {periodDefinition.note ? <p className="mt-1 text-xs text-slate-500">{periodDefinition.note}</p> : null}
          </ControlField>
          <ControlField label={copy.training}>
            <form action="/squad/analysis" className="grid gap-2">
              <input type="hidden" name="period" value={filters.period} />
              {filters.section !== "overview" ? <input type="hidden" name="section" value={filters.section} /> : null}
              {filters.playerType !== "all" ? <input type="hidden" name="playerType" value={filters.playerType} /> : null}
              {filters.position ? <input type="hidden" name="position" value={filters.position} /> : null}
              {filters.ratedOnly ? <input type="hidden" name="ratedOnly" value="true" /> : null}
              {filters.sort !== "name" ? <input type="hidden" name="sort" value={filters.sort} /> : null}
              {filters.direction !== defaultSortDirection(filters.sort) ? <input type="hidden" name="direction" value={filters.direction} /> : null}
              {filters.period === "custom" && filters.customFrom ? <input type="hidden" name="from" value={formatGermanDate(filters.customFrom)} /> : null}
              {filters.period === "custom" && filters.customTo ? <input type="hidden" name="to" value={formatGermanDate(filters.customTo)} /> : null}
              <select
                name="training"
                defaultValue={filters.trainingId ?? ""}
                disabled={!availableEvents.length}
                className="h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm font-semibold text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">{copy.allTrainings}</option>
                {availableEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {formatDate(event.date, locale)} · {event.startTime} · {event.label || copy.unnamedTraining}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={!availableEvents.length} className="inline-flex h-10 items-center justify-center rounded-md bg-board-navy px-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                {copy.applyTraining}
              </button>
            </form>
          </ControlField>
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <p>{copy.sortedBy(sortOptions.find((option) => option.id === filters.sort)?.label ?? "Name", filters.direction)}</p>
          {activeFilters ? (
            <Link href="/squad/analysis" className="text-sm font-bold text-board-green underline-offset-4 hover:underline">
              {copy.resetFilters}
            </Link>
          ) : null}
        </div>
      </section>

      <AnalyticsPrimarySummary
        locale={locale}
        analytics={teamAnalytics}
        filteredPlayerCount={summaries.length}
        playerType={filters.playerType}
        position={filters.position}
        periodLabel={periodDefinition.rangeLabel}
        singleTraining={Boolean(filters.trainingId) && teamAnalytics.trainingSessions === 1}
      />

      <AnalyticsSectionPanel section={filters.section} teamAnalytics={teamAnalytics} />

      {(filters.section === "players" || filters.section === "attendance") && summaries.length ? (
        <>
          {filters.section === "attendance"
            ? <AttendanceAnalyticsTable summaries={summaries} filters={filters} />
            : <PerformanceAnalyticsTable summaries={summaries} filters={filters} />}
        </>
      ) : filters.section === "players" || filters.section === "attendance" ? (
        <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">{copy.noDataTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{copy.noDataDescription}</p>
          <ButtonLink href="/trainings/new" className="mt-5">{copy.createTraining}</ButtonLink>
        </div>
      ) : null}

      <section id="analytics-help" className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <details>
          <summary className="flex cursor-pointer items-center gap-2 text-lg font-bold text-board-navy">
            <Info className="h-5 w-5" />
            {copy.helpTitle}
          </summary>
          <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-600 md:grid-cols-2">
            {copy.helpItems.map((item) => (
              <p key={item.title}><strong className="text-board-navy">{item.title}:</strong> {item.text}</p>
            ))}
          </div>
        </details>
      </section>
    </PageContainer>
  );
}

async function AnalyticsSectionPanel({
  section,
  teamAnalytics
}: {
  section: AnalyticsSection;
  teamAnalytics: TeamAnalyticsOverview;
}) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  if (section === "training" || section === "overview") {
    return (
      <div className="space-y-4">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title={ui("Training Sessions")} icon={<CalendarCheck className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label={ui("Sessions")} value={teamAnalytics.trainingSessions} />
            <MiniStat label={ui("Reviewed")} value={`${teamAnalytics.reviewedSessions}/${teamAnalytics.trainingSessions}`} />
            <MiniStat label={ui("Review coverage")} value={formatPercent(teamAnalytics.reviewCoverage, locale)} />
            <MiniStat label={ui("Quality")} value={formatRating(teamAnalytics.averageSessionQuality, locale)} />
            <MiniStat label={ui("Intensity")} value={formatRating(teamAnalytics.averageSessionIntensity, locale)} />
            <MiniStat label={ui("Player Response")} value={formatRating(teamAnalytics.averagePlayerResponse, locale)} />
            <MiniStat label={ui("Planned sessions")} value={formatPercent(teamAnalytics.planCoverage.rate, locale)} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <OutcomeBadge label={ui("Achieved")} value={teamAnalytics.objectiveOutcomes.achieved} />
            <OutcomeBadge label={ui("Partly")} value={teamAnalytics.objectiveOutcomes.partly_achieved} />
            <OutcomeBadge label={ui("Not achieved")} value={teamAnalytics.objectiveOutcomes.not_achieved} />
          </div>
          </Panel>
          <Panel title={ui("Training Focus")} icon={<Target className="h-5 w-5" />}>
          {teamAnalytics.focusDistribution.length ? (
            <div className="space-y-3">
              {teamAnalytics.focusDistribution.slice(0, 6).map((item) => (
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
      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2 text-lg font-bold text-board-navy">
          <UserCheck className="h-5 w-5 text-board-green" />
          {locale === "de" ? "Anwesenheit" : "Attendance"}
        </div>
        <AttendanceAnalyticsSummary analytics={teamAnalytics} locale={locale} />
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
            <MiniStat label={ui("Due for review")} value={teamAnalytics.goalsDueForReview} />
            <MiniStat label={ui("Achieved in period")} value={teamAnalytics.goalsAchievedInPeriod} />
          </div>
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
                {teamAnalytics.drillUsage.slice(0, 12).map((drill) => (
                  <tr key={`${drill.drillId ?? drill.title}-${drill.lastUsedAt ?? "never"}`}>
                    <td translate="no" className="py-3 pr-3 font-bold text-board-navy">{drill.title}</td>
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

async function AttendanceAnalyticsTable({ summaries, filters }: { summaries: PlayerAnalyticsSummary[]; filters: AnalyticsFilters }) {
  const locale = await getActiveLocale();
  const labels = locale === "de"
    ? { expected: "Eingeplant", participated: "Teilgenommen", attendance: "Anwesenheit", unavailable: "Nicht eingeplant", absent: "Abwesend bei Einplanung", late: "Verspätet", leftEarly: "Abgebrochen", reliability: "Zuverlässigkeit" }
    : { expected: "Expected", participated: "Participated", attendance: "Attendance", unavailable: "Not expected", absent: "Absent when expected", late: "Late", leftEarly: "Left early", reliability: "Reliability" };
  return <>
    <section className="hidden overflow-x-auto rounded-lg border border-board-line bg-white shadow-soft lg:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
          <SortableHeader label={analyticsCopy[locale].headers.player} sortKey="name" filters={filters} />
          <SortableHeader label={analyticsCopy[locale].headers.position} sortKey="position" filters={filters} />
          <SortableHeader label={labels.expected} sortKey="trainings" filters={filters} align="right" />
          <th className={cn(STICKY_TABLE_HEADER_CLASS, "px-3 py-3 text-right")}>{labels.participated}</th>
          <SortableHeader label={labels.attendance} sortKey="attendance" filters={filters} align="right" />
          <th className={cn(STICKY_TABLE_HEADER_CLASS, "px-3 py-3 text-right")}>{labels.unavailable}</th>
          <th className={cn(STICKY_TABLE_HEADER_CLASS, "px-3 py-3 text-right")}>{labels.absent}</th>
          <th className={cn(STICKY_TABLE_HEADER_CLASS, "px-3 py-3 text-right")}>{labels.late}</th>
          <th className={cn(STICKY_TABLE_HEADER_CLASS, "px-3 py-3 text-right")}>{labels.leftEarly}</th>
          <SortableHeader label={labels.reliability} sortKey="reliability" filters={filters} align="right" />
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{summaries.map((summary) => <tr key={summary.player.id} className="hover:bg-slate-50/70">
          <PlayerNameCell summary={summary} />
          <PositionCell summary={summary} active={filters.sort === "position"} />
          <MetricCell active={filters.sort === "trainings"} align="right">{summary.expectedTrainings}</MetricCell>
          <MetricCell active={false} align="right">{summary.attended}</MetricCell>
          <MetricCell active={filters.sort === "attendance"} align="right"><MetricStack value={formatPercent(summary.attendanceRate, locale)} detail={`${summary.attendanceCount} / ${summary.attendanceOpportunityCount}`} /></MetricCell>
          <MetricCell active={false} align="right">{summary.notExpectedTrainings}</MetricCell>
          <MetricCell active={false} align="right">{summary.absentWhenExpected}</MetricCell>
          <MetricCell active={false} align="right">{summary.late}</MetricCell>
          <MetricCell active={false} align="right">{summary.leftEarly}</MetricCell>
          <MetricCell active={filters.sort === "reliability"} align="right"><ReliabilityValue summary={summary} locale={locale} /></MetricCell>
        </tr>)}</tbody>
      </table>
    </section>
    <section className="space-y-3 lg:hidden">{summaries.map((summary) => <article key={summary.player.id} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <MobilePlayerHeader summary={summary} />
      <div className="mt-4 rounded-md bg-green-50 p-3"><p className="text-xs font-bold uppercase text-green-800">{labels.attendance}</p><p className="mt-1 text-2xl font-bold text-board-navy">{formatPercent(summary.attendanceRate, locale)}</p><p className="text-sm text-slate-600">{summary.attendanceCount} / {summary.attendanceOpportunityCount}</p></div>
      <div className="mt-3 grid grid-cols-2 gap-2"><CompactMetric label={labels.participated} value={String(summary.attended)} /><CompactMetric label={labels.absent} value={String(summary.absentWhenExpected)} /><CompactMetric label={labels.unavailable} value={String(summary.notExpectedTrainings)} /><CompactMetric label={`${labels.late} / ${labels.leftEarly}`} value={`${summary.late} / ${summary.leftEarly}`} /></div>
      <div className="mt-3 rounded-md bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{labels.reliability}</p><ReliabilityValue summary={summary} locale={locale} align="left" className="mt-1" /></div>
    </article>)}</section>
  </>;
}

async function PerformanceAnalyticsTable({ summaries, filters }: { summaries: PlayerAnalyticsSummary[]; filters: AnalyticsFilters }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  const headers = analyticsCopy[locale].headers;
  const ratings = locale === "de" ? "Bewertungen" : "Ratings";
  const coverage = locale === "de" ? "Bewertungsabdeckung" : "Rating coverage";
  return <>
    <section className="hidden overflow-x-auto rounded-lg border border-board-line bg-white shadow-soft lg:block"><table className="w-full border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
        <SortableHeader label={headers.player} sortKey="name" filters={filters} />
        <SortableHeader label={headers.position} sortKey="position" filters={filters} />
        <SortableHeader label={headers.status} sortKey="status" filters={filters} />
        <SortableHeader label={headers.trainings} sortKey="trainings" filters={filters} align="right" />
        <SortableHeader label={ratings} sortKey="rated" filters={filters} align="right" />
        <SortableHeader label={coverage} sortKey="ratingCoverage" filters={filters} align="right" />
        <SortableHeader label={headers.average} sortKey="average" filters={filters} align="right" />
        <SortableHeader label={headers.latestFive} sortKey="latestFive" filters={filters} align="right" />
        <SortableHeader label={headers.trend} sortKey="trend" filters={filters} align="right" />
        <SortableHeader label={headers.evidence} sortKey="evidence" filters={filters} />
        <SortableHeader label={headers.coachAssessment} sortKey="coachAssessment" filters={filters} />
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{summaries.map((summary) => <tr key={summary.player.id} className="hover:bg-slate-50/70">
        <PlayerNameCell summary={summary} /><PositionCell summary={summary} active={filters.sort === "position"} />
        <MetricCell active={filters.sort === "status"}>{ui(summary.player.playerType === "trial" ? "Trial" : "Roster")}</MetricCell>
        <MetricCell active={filters.sort === "trainings"} align="right">{summary.trainings}</MetricCell>
        <MetricCell active={filters.sort === "rated"} align="right">{summary.ratingCompletedExpectedCount} / {summary.ratingEligibleCount}</MetricCell>
        <MetricCell active={filters.sort === "ratingCoverage"} align="right"><MetricStack value={formatPercent(summary.ratingCoverageRate, locale)} detail={`${summary.ratingCompletedExpectedCount} / ${summary.ratingEligibleCount}`} /></MetricCell>
        <MetricCell active={filters.sort === "average"} align="right">{formatRating(summary.averageRating, locale)}</MetricCell>
        <MetricCell active={filters.sort === "latestFive"} align="right">{formatRating(summary.latestFiveAverage, locale)}</MetricCell>
        <MetricCell active={filters.sort === "trend"} align="right"><TrendLabel summary={summary} /></MetricCell>
        <MetricCell active={filters.sort === "evidence"}><span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-bold", evidenceBadgeTone(summary.evidenceBase.label))}>{ui(summary.evidenceBase.label)}</span><p className="mt-1 text-xs text-slate-500">{summary.rated} {locale === "de" ? "bewertet" : "rated"}</p></MetricCell>
        <MetricCell active={filters.sort === "coachAssessment"}>{ui(summary.assessment ? coachAssessmentLabels[summary.assessment.assessment] : "Decision open")}</MetricCell>
      </tr>)}</tbody>
    </table></section>
    <section className="space-y-3 lg:hidden">{summaries.map((summary) => <article key={summary.player.id} className="rounded-lg border border-board-line bg-white p-4 shadow-soft"><MobilePlayerHeader summary={summary} /><div className="mt-4 rounded-md bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{locale === "de" ? "Ø Leistungsbewertung" : "Average rating"}</p><p className="mt-1 text-2xl font-bold text-board-navy">{formatRating(summary.averageRating, locale)}</p><p className="text-sm text-slate-600">{summary.rated} {locale === "de" ? "Bewertungen" : "ratings"}</p></div><div className="mt-3 grid grid-cols-2 gap-2"><CompactMetric label={coverage} value={`${formatPercent(summary.ratingCoverageRate, locale)} · ${summary.ratingCompletedExpectedCount}/${summary.ratingEligibleCount}`} /><CompactMetric label={headers.latestFive} value={formatRating(summary.latestFiveAverage, locale)} /><CompactMetric label={headers.trend} value={summary.trend.value === null ? ui(summary.trend.label) : formatNumber(summary.trend.value, locale, { minimumFractionDigits: 1, signDisplay: "exceptZero" })} /><CompactMetric label={headers.evidence} value={`${summary.rated} ${locale === "de" ? "bewertet" : "rated"}`} /></div></article>)}</section>
  </>;
}

function PlayerNameCell({ summary }: { summary: PlayerAnalyticsSummary }) {
  return <td className="px-3 py-3"><Link translate="no" href={`/squad/players/${summary.player.id}`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">{playerName(summary.player)}</Link></td>;
}

function PositionCell({ summary, active }: { summary: PlayerAnalyticsSummary; active: boolean }) {
  return <MetricCell active={active}><span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{summary.player.position || "-"}</span></MetricCell>;
}

function MobilePlayerHeader({ summary }: { summary: PlayerAnalyticsSummary }) {
  return <div className="flex items-start justify-between gap-3"><div><Link translate="no" href={`/squad/players/${summary.player.id}`} className="text-lg font-bold text-board-navy hover:text-board-green">{playerName(summary.player)}</Link><p className="mt-1 text-sm text-slate-600">{summary.player.position || "-"}</p></div><ButtonLink href={`/squad/players/${summary.player.id}/report`} variant="ghost" className="h-9 px-3"><Printer className="h-4 w-4" /><span className="sr-only">Report</span></ButtonLink></div>;
}

async function TrendLabel({ summary }: { summary: PlayerAnalyticsSummary }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  if (summary.trend.value === null) return <span className="text-slate-500">{ui("No trend yet")}</span>;
  const Icon = summary.trend.value >= 0.3 ? TrendingUp : summary.trend.value <= -0.3 ? TrendingDown : Minus;
  const tone = summary.trend.value >= 0.3 ? "text-green-700" : summary.trend.value <= -0.3 ? "text-red-700" : "text-slate-600";
  return (
    <span className={cn("inline-flex flex-col items-end gap-0.5", tone)}>
      <span className="inline-flex items-center gap-1 font-bold">
        <Icon className="h-3.5 w-3.5" />
        {formatNumber(summary.trend.value, locale, { minimumFractionDigits: 1, signDisplay: "exceptZero" })} · {ui(summary.trend.label)}
      </span>
      {summary.trend.latestAverage !== undefined && summary.trend.previousAverage !== undefined ? (
        <span className="text-xs font-semibold text-slate-500">{ui("Latest 5 ")}{formatRating(summary.trend.latestAverage, locale)} {ui(" · Prev ")}{formatRating(summary.trend.previousAverage, locale)}</span>
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

function TrainingAnalyticsTable({ events, locale }: { events: TeamAnalyticsEvent[]; locale: Locale }) {
  const copy = locale === "de"
    ? { title: "Trainingseinheiten im Vergleich", date: "Datum", training: "Training", expected: "Eingeplante Spieler", attendance: "Anwesenheit bei Einplanung", coverage: "Bewertungsabdeckung", average: "Ø Bewertung", review: "Trainingsreflexion", plan: "Trainingsplan", open: "Bewertungen öffnen", saved: "Gespeichert", missing: "Fehlt", available: "Vorhanden" }
    : { title: "Training comparison", date: "Date", training: "Training", expected: "Expected players", attendance: "Attendance when expected", coverage: "Rating coverage", average: "Average rating", review: "Session review", plan: "Training plan", open: "Open ratings", saved: "Saved", missing: "Missing", available: "Available" };
  if (!events.length) return null;
  return <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft"><h2 className="text-lg font-bold text-board-navy">{copy.title}</h2>
    <div className="mt-4 hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">{copy.date}</th><th className="px-3 py-3">{copy.training}</th><th className="px-3 py-3 text-right">{copy.expected}</th><th className="px-3 py-3 text-right">{copy.attendance}</th><th className="px-3 py-3 text-right">{copy.coverage}</th><th className="px-3 py-3 text-right">{copy.average}</th><th className="px-3 py-3">{copy.review}</th><th className="px-3 py-3">{copy.plan}</th></tr></thead><tbody className="divide-y divide-slate-100">{events.map((item) => {
      const missingRatings = item.attendance.ratingEligibleCount - item.attendance.ratingCompletedCount;
      return <tr key={item.event.id}><td className="px-3 py-3 tabular-nums">{formatDate(item.event.date, locale)}</td><td className="px-3 py-3 font-bold text-board-navy">{item.event.label || (locale === "de" ? "Training" : "Training")}</td><td className="px-3 py-3 text-right">{item.attendance.expected}</td><td className="px-3 py-3 text-right"><MetricStack value={formatPercent(item.attendance.attendanceWhenExpectedRate, locale)} detail={`${item.attendance.attendedWhenExpected} / ${item.attendance.expectedRecorded}`} /></td><td className="px-3 py-3 text-right"><MetricStack value={formatPercent(item.attendance.ratingCoverageRate, locale)} detail={`${item.attendance.ratingCompletedCount} / ${item.attendance.ratingEligibleCount}`} />{missingRatings > 0 ? <Link href={`/trainings/${item.event.id}/ratings`} className="mt-1 inline-block text-xs font-bold text-amber-700 hover:underline">{missingRatings} {locale === "de" ? "offen" : "missing"} · {copy.open}</Link> : null}</td><td className="px-3 py-3 text-right">{formatRating(item.attendance.averageOverallRating, locale)}</td><td className="px-3 py-3">{item.review ? copy.saved : copy.missing}</td><td className="px-3 py-3">{item.planDrillCount > 0 ? copy.available : copy.missing}</td></tr>;
    })}</tbody></table></div>
    <div className="mt-4 space-y-3 lg:hidden">{events.map((item) => { const missingRatings = item.attendance.ratingEligibleCount - item.attendance.ratingCompletedCount; return <article key={item.event.id} className="rounded-md border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-board-navy">{item.event.label || "Training"}</p><p className="text-sm text-slate-500">{formatDate(item.event.date, locale)}</p></div>{missingRatings > 0 ? <ButtonLink href={`/trainings/${item.event.id}/ratings`} variant="ghost" className="h-9 px-2">{copy.open}</ButtonLink> : null}</div><div className="mt-3 grid grid-cols-2 gap-2"><CompactMetric label={copy.attendance} value={`${formatPercent(item.attendance.attendanceWhenExpectedRate, locale)} · ${item.attendance.attendedWhenExpected}/${item.attendance.expectedRecorded}`} /><CompactMetric label={copy.coverage} value={`${formatPercent(item.attendance.ratingCoverageRate, locale)} · ${item.attendance.ratingCompletedCount}/${item.attendance.ratingEligibleCount}`} /><CompactMetric label={copy.review} value={item.review ? copy.saved : copy.missing} /><CompactMetric label={copy.plan} value={item.planDrillCount > 0 ? copy.available : copy.missing} /></div></article>; })}</div>
  </section>;
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

async function SortableHeader({
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
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  const active = sortKey === filters.sort;
  return (
    <th aria-sort={active ? (filters.direction === "asc" ? "ascending" : "descending") : "none"} className={cn(STICKY_TABLE_HEADER_CLASS, "px-0 py-0 font-bold", active && "bg-green-50 text-board-green")}>
      <Link
        href={hrefFor({ ...filters, sort: sortKey, direction: nextSortDirection(filters.sort, filters.direction, sortKey) })}
        className={cn(
          "flex min-h-11 items-center gap-1 px-3 py-3 underline-offset-4 hover:text-board-green hover:underline focus:outline-none focus:ring-4 focus:ring-green-100",
          align === "right" && "justify-end text-right"
        )}
        title={ui("Sort by {label}", { label })}
      >
        {label}
        <ArrowUpDown className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-35")} />
        {active ? <span className="sr-only">{ui(filters.direction === "asc" ? "Sorted ascending" : "Sorted descending")}</span> : null}
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
    note: filters.period === "last5" || filters.period === "last10" ? copy.availableTrainings(dates.length) : undefined
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

function formatShortDate(date: string, locale: Locale = "en") {
  return formatDate(date, locale, { day: "2-digit", month: "short" });
}

function developmentCategoryLabel(category: string, locale: Locale = "en") {
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
  trainingId?: string;
}) {
  return (
    Number(filters.period !== "last10") +
    Number(filters.section !== "overview") +
    Number(filters.playerType !== "all") +
    Number(Boolean(filters.position)) +
    Number(Boolean(filters.trainingId)) +
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
  trainingId?: string;
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
  if (filters.trainingId) params.set("training", filters.trainingId);
  if (filters.ratedOnly) params.set("ratedOnly", "true");
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.direction !== defaultSortDirection(filters.sort)) params.set("direction", filters.direction);
  const query = params.toString();
  return query ? `/squad/analysis?${query}` : "/squad/analysis";
}

function reportHrefFor(filters: AnalyticsFilters) {
  const source = hrefFor(filters);
  const query = source.includes("?") ? source.slice(source.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  params.set("mode", filters.section === "attendance" ? "attendance" : filters.section === "players" ? "performance" : "combined");
  return `/squad/analysis/report?${params.toString()}`;
}

function nextSortDirection(currentSort: AnalyticsSortKey, currentDirection: AnalyticsSortDirection, nextSort: AnalyticsSortKey): AnalyticsSortDirection {
  if (currentSort !== nextSort) return defaultSortDirection(nextSort);
  return currentDirection === "asc" ? "desc" : "asc";
}
