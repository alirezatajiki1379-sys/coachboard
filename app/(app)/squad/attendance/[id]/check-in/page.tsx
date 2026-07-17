import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CheckInRow } from "@/components/squad/attendance-controls";
import { attendanceCounts, eventTimeRange, eventTitle, formatEventDate } from "@/lib/squad/attendance-format";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";

type CheckInPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CheckInPage({ params }: CheckInPageProps) {
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
    <div className="space-y-5">
      <Link href={`/squad/attendance/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to event
      </Link>
      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold uppercase text-board-green">{formatEventDate(event.date)} · {eventTimeRange(event)}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{eventTitle(event)}</h1>
        <p className="mt-2 text-sm text-slate-600">{counts.present} present · {counts.absent} absent · {counts.unavailable} unavailable · {counts.unclear} unclear</p>
      </section>

      <section className="space-y-3">
        {event.attendance.length ? (
          event.attendance.map((entry) => <CheckInRow key={entry.id} entry={entry} eventId={event.id} />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="font-bold text-board-navy">No players to check in</h2>
            <p className="mt-2 text-sm text-slate-600">Go back to the event and add squad or trial players first.</p>
          </div>
        )}
      </section>
    </div>
  );
}
