import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, UserPlus, UsersRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { CompleteEventButton, MarkAllExpectedButton, MissingStatusesNotice, PlannedAttendanceControls } from "@/components/squad/attendance-controls";
import { addExistingTrialPlayerToEvent, addSquadPlayersToEvent, addTrialPlayerToEvent, convertTrialPlayerToSquadPlayer, removePlayerFromEvent } from "@/lib/squad/attendance-actions";
import { attendanceCounts, attendanceDisplayName, eventTimeRange, eventTitle, finalStatusLabel, formatEventDate, plannedReasonLabel, plannedStatusLabel } from "@/lib/squad/attendance-format";
import { getTrainingEventDetail, listAvailableTrialPlayers } from "@/lib/squad/attendance-queries";
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
  const availableTrialPlayers = await listAvailableTrialPlayers(supabase, user.id, event.id);
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
            <CompleteEventButton eventId={event.id} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Expected total" value={String(counts.confirmedTotal)} />
        <Metric label="Field players" value={String(counts.fieldPlayers)} />
        <Metric label="Goalkeepers" value={String(counts.goalkeepers)} tone={counts.goalkeepers === 0 ? "warning" : "normal"} />
        <Metric label="Trial players" value={String(counts.trialPlayers)} />
        <Metric label="Unclear" value={String(counts.unclear)} />
      </section>
      <p className="text-sm text-slate-500">Trial players are included in expected total and also shown separately as information.</p>
      {counts.goalkeepers === 0 ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">No expected goalkeeper confirmed yet.</p> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <form action={addSquadPlayersToEvent} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><UsersRound className="h-5 w-5" /> Squad players</h2>
          <p className="mt-1 text-sm text-slate-600">Add all active squad players who are not already on this event.</p>
          <Button type="submit" className="mt-4 h-9 px-3">Add active squad</Button>
        </form>

        <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><UserPlus className="h-5 w-5" /> Trial players</h2>
          <form action={addTrialPlayerToEvent}>
            <input type="hidden" name="eventId" value={event.id} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input name="displayName" required placeholder="New trial name" className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
              <input name="contact" placeholder="Contact optional" className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
              <input name="notes" placeholder="Notes optional" className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 sm:col-span-2" />
            </div>
            <Button type="submit" variant="secondary" className="mt-4 h-9 px-3">Create and add trial</Button>
          </form>
          {availableTrialPlayers.length ? (
            <form action={addExistingTrialPlayerToEvent} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="eventId" value={event.id} />
              <select name="playerId" className="h-10 min-w-0 flex-1 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                {availableTrialPlayers.map((player) => (
                  <option key={player.id} value={player.id}>{[player.first_name, player.last_name].filter(Boolean).join(" ")}</option>
                ))}
              </select>
              <Button type="submit" variant="secondary" className="h-10 px-3">Add existing trial</Button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-board-navy">Availability and attendance</h2>
            <MissingStatusesNotice entries={event.attendance} />
          </div>
          {event.attendance.length ? <MarkAllExpectedButton eventId={event.id} /> : null}
        </div>
        {event.attendance.length ? (
          event.attendance.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="font-bold text-board-navy">
                    {attendanceDisplayName(entry)}
                    {entry.player?.playerType === "trial" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Trial</span> : null}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Planned: {plannedStatusLabel(entry.plannedStatus)} · Actual: {finalStatusLabel(entry.finalStatus)}
                  </p>
                  {entry.plannedReason || entry.plannedReasonNote ? (
                    <p className="mt-1 text-sm text-slate-600">
                      Reason: {[plannedReasonLabel(entry.plannedReason), entry.plannedReasonNote].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <PlannedAttendanceControls entry={entry} eventId={event.id} returnTo={`/squad/attendance/${event.id}`} />
                <div className="flex flex-wrap gap-2">
                  {entry.player?.playerType === "trial" ? (
                    <form action={convertTrialPlayerToSquadPlayer}>
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="playerId" value={entry.player.id} />
                      <Button type="submit" variant="secondary" className="h-10">Convert to player</Button>
                    </form>
                  ) : null}
                  <form action={removePlayerFromEvent}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="attendanceId" value={entry.id} />
                    <Button type="submit" variant="ghost" className="h-10">Remove from event</Button>
                  </form>
                </div>
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

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warning" }) {
  return (
    <div className={`rounded-lg border p-4 shadow-soft ${tone === "warning" ? "border-red-200 bg-red-50" : "border-board-line bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone === "warning" ? "text-red-700" : "text-board-navy"}`}>{value}</p>
    </div>
  );
}
