import { CalendarDays, Clock, UsersRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { attendanceCounts, eventTimeRange, eventTitle, formatEventDate } from "@/lib/squad/attendance-format";
import type { SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";

export function TrainingEventCard({ event, attendance = [] }: { event: SquadTrainingEvent; attendance?: SquadAttendanceEntry[] }) {
  const counts = attendanceCounts(attendance);
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-board-green">{event.status}</p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-board-navy">{eventTitle(event)}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-3.5 w-3.5" />{formatEventDate(event.date)}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><Clock className="h-3.5 w-3.5" />{eventTimeRange(event)}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><UsersRound className="h-3.5 w-3.5" />{attendance.length} players</span>
          </div>
          {event.linkedTrainingSessionTitle ? <p className="mt-3 text-sm text-slate-600">Plan: {event.linkedTrainingSessionTitle}</p> : null}
          {attendance.length ? <p className="mt-2 text-sm text-slate-600">{counts.present} present · {counts.absent} absent · {counts.unavailable} unavailable</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/squad/attendance/${event.id}`} variant="secondary" className="h-9 px-3">Open</ButtonLink>
          <ButtonLink href={`/squad/attendance/${event.id}/check-in`} className="h-9 px-3">Check-in</ButtonLink>
        </div>
      </div>
    </article>
  );
}
