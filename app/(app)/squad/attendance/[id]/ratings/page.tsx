import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RatingRow } from "@/components/squad/attendance-controls";
import { attendanceDisplayName, eventTimeRange, eventTitle, finalStatusLabel, formatEventDate } from "@/lib/squad/attendance-format";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { getActiveDevelopmentGoalsForPlayers } from "@/lib/squad/development";
import { createClient } from "@/lib/supabase/server";

type RatingsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EventRatingsPage({ params }: RatingsPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event) notFound();
  const goalsByPlayer = await getActiveDevelopmentGoalsForPlayers(supabase, user.id, event.attendance.map((entry) => entry.playerId));
  const activeEntries = event.attendance.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z");
  const unresolvedEntries = event.attendance.filter((entry) => !entry.finalStatus);
  const absentEntries = event.attendance.filter((entry) => entry.finalStatus && !["present", "Z"].includes(entry.finalStatus));

  return (
    <div className="space-y-5">
      <Link href={`/squad/attendance/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to event
      </Link>
      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold uppercase text-board-green">{formatEventDate(event.date)} · {eventTimeRange(event)}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Ratings: {eventTitle(event)}</h1>
        <p className="mt-2 text-sm text-slate-600">Optional post-training scores. Leave fields empty if you only need attendance.</p>
      </section>

      <section className="space-y-3">
        {event.attendance.length ? (
          <>
            {activeEntries.length ? (
              activeEntries.map((entry) => <RatingRow key={entry.id} entry={entry} eventId={event.id} goals={goalsByPlayer.get(entry.playerId) ?? []} />)
            ) : (
              <p className="rounded-lg border border-dashed border-board-line bg-white p-5 text-sm font-semibold text-slate-600 shadow-soft">
                No present or late players are ready to rate yet. Complete check-in first, or leave ratings empty.
              </p>
            )}
            {unresolvedEntries.length ? (
              <div className="rounded-lg border border-board-line bg-board-paper p-4">
                <h2 className="font-bold text-board-navy">Unresolved check-in</h2>
                <p className="mt-1 text-sm text-slate-600">These players need an actual attendance status before they become rateable.</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                  {unresolvedEntries.map((entry) => (
                    <span key={entry.id} className="rounded-full bg-white px-2 py-1 ring-1 ring-board-line">
                      {entry.player ? [entry.player.firstName, entry.player.lastName].filter(Boolean).join(" ") : "Unknown player"}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {absentEntries.length ? (
              <div className="rounded-lg border border-board-line bg-board-paper p-4">
                <h2 className="font-bold text-board-navy">Absent players</h2>
                <p className="mt-1 text-sm text-slate-600">Absent players are shown for context and are not included in rating progress.</p>
                <div className="mt-3 space-y-3">
                  {absentEntries.map((entry) => (
                    <div key={entry.id} className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-board-line">
                      {attendanceDisplayName(entry)} · {finalStatusLabel(entry.finalStatus)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="font-bold text-board-navy">No players to rate</h2>
            <p className="mt-2 text-sm text-slate-600">Go back to the event and add players first.</p>
          </div>
        )}
      </section>
    </div>
  );
}
