import { CalendarPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { SessionCard } from "@/components/sessions/session-card";
import { createClient } from "@/lib/supabase/server";
import { listUserSessions } from "@/lib/sessions/queries";

export default async function SessionsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const sessions = await listUserSessions(supabase, user.id);

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Training Sessions</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Session plans</h1>
          <p className="mt-2 text-slate-600">Build ordered timelines, calculate materials, and prepare complete training plans.</p>
        </div>
        <ButtonLink href="/sessions/new">
          <CalendarPlus className="h-4 w-4" />
          Create training session
        </ButtonLink>
      </section>

      <section className="space-y-4">
        {sessions.length ? (
          sessions.map((session) => <SessionCard key={session.id} session={session} />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No training sessions yet. Create your first session.</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Sessions combine saved drills into blocks, station sets, player groups, timelines, and a printable material list.
            </p>
            <ButtonLink href="/sessions/new" className="mt-5">
              <CalendarPlus className="h-4 w-4" />
              Create training session
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  );
}
