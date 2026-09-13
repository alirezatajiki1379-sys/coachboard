import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { PageContainer, PageHeader, PageTabs } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { TrainingBulkManager } from "@/components/squad/training-bulk-manager";
import { createClient } from "@/lib/supabase/server";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";
import { listTrainingSessionReviewSummaries } from "@/lib/squad/session-review";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { filterTrainings, parseTrainingFilter, sortTrainings, type TrainingFilter } from "@/lib/trainings/utils";
import { getUserLocale } from "@/lib/i18n/server";

type TrainingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TrainingsPage({ searchParams }: TrainingsPageProps) {
  const params = await searchParams;
  const filter = parseTrainingFilter(params.view);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [locale, activeTeam] = await Promise.all([
    getUserLocale(supabase, user.id),
    ensureActiveSquad(supabase, user.id)
  ]);
  const copy = trainingsCopy[locale];
  const filters = trainingFilterLabels[locale];
  const allEvents = await listTrainingEventDetails(supabase, user.id, {
    squadId: activeTeam.id,
    onlyDeleted: filter === "trash"
  });
  const reviewSummaries = await listTrainingSessionReviewSummaries(supabase, user.id, allEvents.map((event) => event.id));
  const events = sortTrainings(filterTrainings(allEvents, filter));
  const upcomingCount = filterTrainings(allEvents, "upcoming").length;
  const pastCount = filterTrainings(allEvents, "past").length;
  const completedCount = filterTrainings(allEvents, "completed").length;
  const needsRatingsCount = filterTrainings(allEvents, "rating_open").length;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={`${copy.teamLabel}: ${activeTeam.name}. ${copy.description}`}
        actions={(
          <ButtonLink href="/trainings/new" className="justify-center">
          <CalendarPlus className="h-4 w-4" />
          {copy.create}
          </ButtonLink>
        )}
      />

      {filter !== "trash" ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={copy.metrics.upcoming} value={upcomingCount} />
          <Metric label={copy.metrics.past} value={pastCount} />
          <Metric label={copy.metrics.completed} value={completedCount} />
          <Metric label={copy.metrics.needsRatings} value={needsRatingsCount} />
        </section>
      ) : null}

      <PageTabs label={copy.filtersLabel}>
        {filters.map((item) => (
          <ButtonLink
            key={item.id}
            href={item.id === "all" ? "/trainings" : `/trainings?view=${item.id}`}
            variant={filter === item.id ? "primary" : "ghost"}
            className="h-9 shrink-0 justify-center px-3"
          >
            {item.label}
          </ButtonLink>
        ))}
      </PageTabs>

      <section className={events.length ? "space-y-4" : ""}>
        <TrainingBulkManager
          initialEvents={events}
          activeTeamId={activeTeam.id}
          activeTeamName={activeTeam.name}
          filterLabel={filters.find((item) => item.id === filter)?.label ?? copy.currentFilter}
          isTrash={filter === "trash"}
          reviewedEventIds={Array.from(reviewSummaries.keys())}
          locale={locale}
        />
      </section>
    </PageContainer>
  );
}

const trainingsCopy = {
  en: {
    eyebrow: "Trainings",
    title: "Training calendar",
    teamLabel: "Team",
    description: "Concrete training appointments with availability, check-in, ratings, trial players, and an optional training plan.",
    create: "Create training",
    filtersLabel: "Training filters",
    currentFilter: "Current filter",
    metrics: {
      upcoming: "Upcoming",
      past: "Past",
      completed: "Completed",
      needsRatings: "Needs ratings"
    }
  },
  de: {
    eyebrow: "Trainingseinheiten",
    title: "Trainingskalender",
    teamLabel: "Mannschaft",
    description: "Konkrete Trainingstermine mit Verfügbarkeit, Check-in, Bewertungen, Probespielern und optionalem Trainingsplan.",
    create: "Training erstellen",
    filtersLabel: "Trainingsfilter",
    currentFilter: "Aktueller Filter",
    metrics: {
      upcoming: "Anstehend",
      past: "Vergangen",
      completed: "Abgeschlossen",
      needsRatings: "Bewertungen offen"
    }
  }
} as const;

const trainingFilterLabels = {
  en: [
    { id: "all", label: "All" },
    { id: "upcoming", label: "Upcoming" },
    { id: "past", label: "Past" },
    { id: "rating_open", label: "Rating open" },
    { id: "completed", label: "Completed" },
    { id: "draft", label: "Draft" },
    { id: "trash", label: "Trash" }
  ],
  de: [
    { id: "all", label: "Alle" },
    { id: "upcoming", label: "Anstehend" },
    { id: "past", label: "Vergangen" },
    { id: "rating_open", label: "Bewertung offen" },
    { id: "completed", label: "Abgeschlossen" },
    { id: "draft", label: "Entwurf" },
    { id: "trash", label: "Papierkorb" }
  ]
} satisfies Record<string, Array<{ id: TrainingFilter; label: string }>>;

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-board-navy">{value}</p>
    </div>
  );
}
