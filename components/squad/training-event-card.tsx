import Link from "next/link";
import { CalendarDays, Clock, MapPin, Star, UsersRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { attendanceCounts } from "@/lib/squad/attendance-format";
import { formatDateLabel, todayDateString, trainingDisplayTitle, trainingPlanStatus, trainingRatingStats, trainingTimeRange, weekdayLabel } from "@/lib/trainings/utils";
import type { SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";

export function TrainingEventCard({ event, attendance = [], hrefBase = "/squad/attendance" }: { event: SquadTrainingEvent; attendance?: SquadAttendanceEntry[]; hrefBase?: string }) {
  const counts = attendanceCounts(attendance);
  const ratings = trainingRatingStats({ ...event, attendance });
  const today = todayDateString();
  const isPast = event.date < today || event.status === "completed" || event.status === "rating_open";
  const isLive = !isPast && (event.date === today || event.status === "in_progress");
  const unresolved = attendance.filter((entry) => !entry.finalStatus).length;
  const detailHref = `${hrefBase}/${event.id}`;

  return (
    <article className="group rounded-lg border border-board-line bg-white p-4 shadow-soft transition hover:border-board-green/40 hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Link
          href={detailHref}
          className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-board-green/30"
          aria-label={`Open ${trainingDisplayTitle(event)}`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-board-green">{weekdayLabel(event.date)} · {event.status.replaceAll("_", " ")}</p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-board-navy underline-offset-4 group-hover:text-board-green group-hover:underline">{trainingDisplayTitle(event)}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-3.5 w-3.5" />{formatDateLabel(event.date)}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><Clock className="h-3.5 w-3.5" />{trainingTimeRange(event)}</span>
            {event.location ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><MapPin className="h-3.5 w-3.5" />{event.location}</span> : null}
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><UsersRound className="h-3.5 w-3.5" />{attendance.length} total</span>
          </div>
          <TrainingStatusSummary
            isPast={isPast}
            isLive={isLive}
            counts={counts}
            ratings={ratings}
            unresolved={unresolved}
          />
          <p className="mt-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{trainingPlanStatus(event)}</span>
            {event.linkedTrainingSessionTitle ? ` · ${event.linkedTrainingSessionTitle}` : ""}
            {event.focus ? ` · ${event.focus}` : ""}
          </p>
        </Link>
        <div className="relative z-10 flex flex-wrap gap-2">
          <ButtonLink href={detailHref} variant="secondary" className="h-9 px-3">Open</ButtonLink>
          <ButtonLink href={`${hrefBase}/${event.id}/check-in`} className="h-9 px-3">Check-in</ButtonLink>
        </div>
      </div>
    </article>
  );
}

type TrainingCounts = ReturnType<typeof attendanceCounts>;
type RatingCounts = ReturnType<typeof trainingRatingStats>;

function TrainingStatusSummary({
  isPast,
  isLive,
  counts,
  ratings,
  unresolved
}: {
  isPast: boolean;
  isLive: boolean;
  counts: TrainingCounts;
  ratings: RatingCounts;
  unresolved: number;
}) {
  if (isPast) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
        <span className="rounded-md bg-green-50 px-2 py-1 text-green-700">{counts.present} attended</span>
        <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">{counts.absent} absent</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{ratings.rated} of {ratings.rateable} rated</span>
      </div>
    );
  }

  if (isLive) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
        <span className="rounded-md bg-green-50 px-2 py-1 text-green-700">{counts.present} present</span>
        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{counts.late} late</span>
        <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">{counts.absent} absent</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{unresolved} unresolved</span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
      <span aria-label={`${counts.expected} expected`} className="rounded-md bg-green-50 px-2 py-1 text-green-700">{counts.expected} expected</span>
      <span aria-label={`${counts.unavailable} unavailable`} className="rounded-md bg-red-50 px-2 py-1 text-red-700">{counts.unavailable} unavailable</span>
      <span aria-label={`${counts.unclear} unclear`} className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{counts.unclear} unclear</span>
      <span className={counts.goalkeepers === 0 ? "rounded-md bg-red-50 px-2 py-1 text-red-700" : "rounded-md bg-slate-100 px-2 py-1 text-slate-700"}>
        {counts.fieldPlayers} field · {counts.goalkeepers} GK · {counts.trialPlayers} trial
      </span>
    </div>
  );
}
