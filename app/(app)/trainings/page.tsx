import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { PageContainer, PageHeader, PageTabs } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { TrainingEventCard } from "@/components/squad/training-event-card";
import { createClient } from "@/lib/supabase/server";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";
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
  { id: "draft", label: "Draft" }
];

export default async function TrainingsPage({ searchParams }: TrainingsPageProps) {
  const params = await searchParams;
  const filter = parseTrainingFilter(params.view);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const events = sortTrainings(filterTrainings(await listTrainingEventDetails(supabase, user.id), filter));

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Trainings"
        title="Training calendar"
        description="Concrete training appointments with availability, check-in, ratings, trial players, and an optional training plan."
        actions={(
          <ButtonLink href="/trainings/new" className="justify-center">
          <CalendarPlus className="h-4 w-4" />
          Create training
          </ButtonLink>
        )}
      />

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
        {events.length ? (
          events.map((event) => <TrainingEventCard key={event.id} event={event} attendance={event.attendance} hrefBase="/trainings" />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No trainings found</h2>
            <p className="mt-2 text-sm text-slate-600">Create a single training or plan a weekly series to start your calendar.</p>
            <ButtonLink href="/trainings/new" className="mt-5">
              Create training
            </ButtonLink>
          </div>
        )}
      </section>
    </PageContainer>
  );
}
