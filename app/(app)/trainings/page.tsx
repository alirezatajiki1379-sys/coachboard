import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { PageContainer, PageHeader, PageTabs } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { TrainingBulkManager } from "@/components/squad/training-bulk-manager";
import { createClient } from "@/lib/supabase/server";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { filterTrainings, parseTrainingFilter, sortTrainings, type TrainingFilter } from "@/lib/trainings/utils";

type TrainingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const filters: Array<{ id: TrainingFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "rating_open", label: "Rating open" },
  { id: "completed", label: "Completed" },
  { id: "draft", label: "Draft" },
  { id: "trash", label: "Trash" }
];

export default async function TrainingsPage({ searchParams }: TrainingsPageProps) {
  const params = await searchParams;
  const filter = parseTrainingFilter(params.view);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const activeTeam = await ensureActiveSquad(supabase, user.id);
  const allEvents = await listTrainingEventDetails(supabase, user.id, {
    squadId: activeTeam.id,
    onlyDeleted: filter === "trash"
  });
  const events = sortTrainings(filterTrainings(allEvents, filter));
  const upcomingCount = filterTrainings(allEvents, "upcoming").length;
  const pastCount = filterTrainings(allEvents, "past").length;
  const completedCount = filterTrainings(allEvents, "completed").length;
  const needsRatingsCount = filterTrainings(allEvents, "rating_open").length;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Trainings"
        title="Training calendar"
        description={`Team: ${activeTeam.name}. Concrete training appointments with availability, check-in, ratings, trial players, and an optional training plan.`}
        actions={(
          <ButtonLink href="/trainings/new" className="justify-center">
          <CalendarPlus className="h-4 w-4" />
          Create training
          </ButtonLink>
        )}
      />

      {filter !== "trash" ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Upcoming" value={upcomingCount} />
          <Metric label="Past" value={pastCount} />
          <Metric label="Completed" value={completedCount} />
          <Metric label="Needs ratings" value={needsRatingsCount} />
        </section>
      ) : null}

      <PageTabs label="Training filters">
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
          filterLabel={filters.find((item) => item.id === filter)?.label ?? "Current filter"}
          isTrash={filter === "trash"}
        />
      </section>
    </PageContainer>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-board-navy">{value}</p>
    </div>
  );
}
