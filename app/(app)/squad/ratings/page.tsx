import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { SquadNav } from "@/components/squad/squad-nav";
import { eventTimeRange, eventTitle, formatEventDate } from "@/lib/squad/attendance-format";
import { listTrainingEvents } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";

export default async function RatingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const events = await listTrainingEvents(supabase, user.id);

  return (
    <PageContainer width="wide">
      <PageHeader eyebrow="Squad" title="Ratings" description="Choose a training to add optional performance ratings and notes." />
      <SquadNav />
      <section className="space-y-3">
        {events.length ? (
          events.map((event) => (
            <article key={event.id} className="flex flex-col gap-3 rounded-lg border border-board-line bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-board-navy">{eventTitle(event)}</p>
                <p className="text-sm text-slate-600">{formatEventDate(event.date)} · {eventTimeRange(event)}</p>
              </div>
              <ButtonLink href={`/squad/attendance/${event.id}/ratings`} variant="secondary" className="h-9 px-3">
                Open ratings
              </ButtonLink>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No trainings yet</h2>
            <p className="mt-2 text-sm text-slate-600">Create a training first, then ratings can be added after check-in.</p>
            <ButtonLink href="/trainings/new" className="mt-5">Create training</ButtonLink>
          </div>
        )}
      </section>
    </PageContainer>
  );
}
