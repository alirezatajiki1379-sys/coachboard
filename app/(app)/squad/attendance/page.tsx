import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SquadNav } from "@/components/squad/squad-nav";
import { TrainingEventCard } from "@/components/squad/training-event-card";
import { createClient } from "@/lib/supabase/server";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";

export default async function AttendancePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const events = await listTrainingEventDetails(supabase, user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Trainings</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Plan actual training appointments, prepare availability, and run quick mobile check-in.
          </p>
        </div>
        <ButtonLink href="/trainings/new" className="justify-center">
          <Plus className="h-4 w-4" />
          New training event
        </ButtonLink>
      </div>

      <SquadNav />

      <section className={events.length ? "space-y-4" : ""}>
        {events.length ? (
          events.map((event) => <TrainingEventCard key={event.id} event={event} attendance={event.attendance} hrefBase="/trainings" />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No training events yet</h2>
            <p className="mt-2 text-sm text-slate-600">Create your first real training appointment, then add players for availability and check-in.</p>
            <ButtonLink href="/trainings/new" className="mt-5">
              Create training event
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  );
}
