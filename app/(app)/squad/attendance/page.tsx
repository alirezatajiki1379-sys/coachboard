import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
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
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Squad"
        title="Trainings"
        description="Plan actual training appointments, prepare availability, and run quick mobile check-in."
        actions={(
          <ButtonLink href="/trainings/new" className="justify-center">
          <Plus className="h-4 w-4" />
          New training
          </ButtonLink>
        )}
      />

      <SquadNav />

      <section className={events.length ? "space-y-4" : ""}>
        {events.length ? (
          events.map((event) => <TrainingEventCard key={event.id} event={event} attendance={event.attendance} hrefBase="/trainings" />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No trainings yet</h2>
            <p className="mt-2 text-sm text-slate-600">Create your first real training appointment, then add players for availability and check-in.</p>
            <ButtonLink href="/trainings/new" className="mt-5">
              Create training
            </ButtonLink>
          </div>
        )}
      </section>
    </PageContainer>
  );
}
