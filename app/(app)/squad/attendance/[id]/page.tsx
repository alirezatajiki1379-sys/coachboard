import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, UserPlus, UsersRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { AttendanceStatusButtons, CompleteEventButton } from "@/components/squad/attendance-controls";
import { addSquadPlayersToEvent, addTrialPlayerToEvent, convertTrialPlayerToSquadPlayer } from "@/lib/squad/attendance-actions";
import { attendanceCounts, attendanceDisplayName, eventTimeRange, eventTitle, formatEventDate } from "@/lib/squad/attendance-format";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";

type EventPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrainingEventPage({ params }: EventPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event) notFound();
  const counts = attendanceCounts(event.attendance);

  return (
    <div className="space-y-6">
      <Link href="/squad/attendance" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to attendance
      </Link>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-board-green">{formatEventDate(event.date)} · {eventTimeRange(event)}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{eventTitle(event)}</h1>
            {event.linkedTrainingSessionTitle ? <p className="mt-2 text-slate-600">Linked plan: {event.linkedTrainingSessionTitle}</p> : null}
            {event.generalNotes ? <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{event.generalNotes}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/squad/attendance/${event.id}/check-in`} className="justify-center">Quick check-in</ButtonLink>
            <ButtonLink href={`/squad/attendance/${event.id}/ratings`} variant="secondary" className="justify-center">Ratings</ButtonLink>
            {event.status !== "completed" ? <CompleteEventButton eventId={event.id} /> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Expected" value={String(counts.expected)} />
        <Metric label="Present" value={String(counts.present)} />
        <Metric label="Absent" value={String(counts.absent)} />
        <Metric label="Unavailable" value={String(counts.unavailable)} />
        <Metric label="Unclear" value={String(counts.unclear)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form action={addSquadPlayersToEvent} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><UsersRound className="h-5 w-5" /> Squad players</h2>
          <p className="mt-1 text-sm text-slate-600">Add all active squad players who are not already on this event.</p>
          <Button type="submit" className="mt-4 h-9 px-3">Add active squad</Button>
        </form>

        <form action={addTrialPlayerToEvent} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><UserPlus className="h-5 w-5" /> Trial player</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="displayName" required placeholder="Name" className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            <input name="contact" placeholder="Contact optional" className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            <input name="notes" placeholder="Notes optional" className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 sm:col-span-2" />
          </div>
          <Button type="submit" variant="secondary" className="mt-4 h-9 px-3">Add trial player</Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-board-navy">Availability and attendance</h2>
        {event.attendance.length ? (
          event.attendance.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-bold text-board-navy">{attendanceDisplayName(entry)}</p>
                  <p className="mt-1 text-sm text-slate-500">Current status: {entry.status}</p>
                </div>
                <AttendanceStatusButtons entry={entry} eventId={event.id} returnTo={`/squad/attendance/${event.id}`} />
                {entry.trialPlayer && !entry.trialPlayer.convertedPlayerId ? (
                  <form action={convertTrialPlayerToSquadPlayer}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="trialPlayerId" value={entry.trialPlayer.id} />
                    <Button type="submit" variant="secondary" className="h-10">Convert to player</Button>
                  </form>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h3 className="font-bold text-board-navy">No players added yet</h3>
            <p className="mt-2 text-sm text-slate-600">Add active squad players or a trial player to start planning attendance.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-board-navy">{value}</p>
    </div>
  );
}
