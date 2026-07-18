import { CalendarDays, Clock, MapPin, Star, UsersRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { attendanceCounts } from "@/lib/squad/attendance-format";
import { trainingDisplayTitle, trainingPlanStatus, trainingRatingStats, trainingTimeRange, weekdayLabel } from "@/lib/trainings/utils";
import type { SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";

export function TrainingEventCard({ event, attendance = [], hrefBase = "/squad/attendance" }: { event: SquadTrainingEvent; attendance?: SquadAttendanceEntry[]; hrefBase?: string }) {
  const counts = attendanceCounts(attendance);
  const ratings = trainingRatingStats({ ...event, attendance });
  const hasActuals = counts.present > 0 || counts.absent > 0 || counts.late > 0 || event.status === "in_progress" || event.status === "rating_open" || event.status === "completed";
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-board-green">{weekdayLabel(event.date)} · {event.status.replaceAll("_", " ")}</p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-board-navy">{trainingDisplayTitle(event)}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-3.5 w-3.5" />{event.date}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><Clock className="h-3.5 w-3.5" />{trainingTimeRange(event)}</span>
            {event.location ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><MapPin className="h-3.5 w-3.5" />{event.location}</span> : null}
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><UsersRound className="h-3.5 w-3.5" />{counts.confirmedTotal} expected</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
            <span aria-label={`${counts.expected} expected`} className="rounded-md bg-green-50 px-2 py-1 text-green-700">👍 {counts.expected} expected</span>
            <span aria-label={`${counts.unavailable} unavailable`} className="rounded-md bg-red-50 px-2 py-1 text-red-700">👎 {counts.unavailable} unavailable</span>
            <span aria-label={`${counts.unclear} unclear`} className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">? {counts.unclear} unclear</span>
            <span className={counts.goalkeepers === 0 ? "rounded-md bg-red-50 px-2 py-1 text-red-700" : "rounded-md bg-slate-100 px-2 py-1 text-slate-700"}>{counts.fieldPlayers} field · {counts.goalkeepers} GK · {counts.trialPlayers} trial</span>
          </div>
          {hasActuals ? (
            <p className="mt-3 text-sm font-semibold text-board-navy">{counts.present} present · {counts.late} late · {counts.absent} absent · {ratings.rated} of {ratings.rateable} rated</p>
          ) : null}
          <p className="mt-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{trainingPlanStatus(event)}</span>
            {event.linkedTrainingSessionTitle ? ` · ${event.linkedTrainingSessionTitle}` : ""}
            {event.focus ? ` · ${event.focus}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`${hrefBase}/${event.id}`} variant="secondary" className="h-9 px-3">Open</ButtonLink>
          <ButtonLink href={`${hrefBase}/${event.id}/check-in`} className="h-9 px-3">Check-in</ButtonLink>
        </div>
      </div>
    </article>
  );
}
