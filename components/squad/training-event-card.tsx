"use client";

import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { formatDate } from "@/lib/i18n";
import Link from "next/link";
import { CalendarDays, ClipboardList, Clock, MapPin, Target, UsersRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { TrainingEventActions } from "@/components/squad/training-event-actions";
import { attendanceCounts } from "@/lib/squad/attendance-format";
import { isTrainingPast, trainingNowParts, trainingPlanStatus, trainingRatingStats, trainingTimeRange } from "@/lib/trainings/utils";
import type { SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";

export function TrainingEventCard({ event, attendance = [], hrefBase = "/squad/attendance", hasReview = false }: { event: SquadTrainingEvent; attendance?: SquadAttendanceEntry[]; hrefBase?: string; hasReview?: boolean }) {
  const locale = useOptionalI18n()?.locale ?? "en";
  const ui = createSystemTranslator(locale);
  const title = event.label || ui("Training on {date}", { date: formatDate(event.date, locale) });
  const counts = attendanceCounts(attendance);
  const ratings = trainingRatingStats({ ...event, attendance });
  const now = trainingNowParts();
  const isPast = isTrainingPast(event, now);
  const isLive = !isPast && (event.date === now.date || event.status === "in_progress");
  const detailHref = `${hrefBase}/${event.id}`;
  const dateTimeLabel = `${formatDate(event.date, locale, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })} · ${trainingTimeRange(event)}`;

  return (
    <article className="group rounded-lg border border-board-line bg-white p-4 shadow-soft transition hover:border-board-green/40 hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Link
          href={detailHref}
          className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-board-green/30"
          aria-label={ui("Open {title}", { title })}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-board-green">{dateTimeLabel}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{ui({ draft: "Draft", prepared: "Prepared", in_progress: "In progress", rating_open: "Rating open", completed: "Completed" }[event.status])}</p>
          <h2 translate="no" className="mt-1 text-xl font-bold tracking-normal text-board-navy underline-offset-4 group-hover:text-board-green group-hover:underline">{title}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(event.date, locale)}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><Clock className="h-3.5 w-3.5" />{trainingTimeRange(event)}</span>
            {event.location ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><MapPin className="h-3.5 w-3.5" />{event.location}</span> : null}
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><UsersRound className="h-3.5 w-3.5" />{ui("Team: ")}{event.squadName ?? "Active Team"}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><UsersRound className="h-3.5 w-3.5" />{attendance.length} {ui(" total")}</span>
            {event.recurrenceSeriesId ? <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">{ui("Recurring")}</span> : null}
            {event.deletedAt ? <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">{ui("In Trash")}</span> : null}
          </div>
          <TrainingStatusSummary
            isPast={isPast}
            isLive={isLive}
            counts={counts}
            ratings={ratings}
            hasReview={hasReview}
          />
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-board-green">
              <ClipboardList className="h-3.5 w-3.5" />
              {ui(trainingPlanStatus(event))}
            </span>
            {event.linkedTrainingSessionTitle ? (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                {ui("Plan: ")}{event.linkedTrainingSessionTitle}
              </span>
            ) : null}
            {event.focus ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                <Target className="h-3.5 w-3.5" />
                {event.focus}
              </span>
            ) : null}
          </div>
        </Link>
        <div className="relative z-10 flex flex-wrap gap-2">
          {!event.deletedAt ? <ButtonLink href={detailHref} variant="secondary" className="h-9 px-3">{ui("Open")}</ButtonLink> : null}
          {!event.deletedAt ? <ButtonLink href={`${hrefBase}/${event.id}/check-in`} className="h-9 px-3">{ui("Check-in")}</ButtonLink> : null}
          <TrainingEventActions eventId={event.id} attendanceCount={attendance.length} compact isTrash={Boolean(event.deletedAt)} isRecurring={Boolean(event.recurrenceSeriesId)} />
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
  hasReview
}: {
  isPast: boolean;
  isLive: boolean;
  counts: TrainingCounts;
  ratings: RatingCounts;
  hasReview: boolean;
}) {
  const locale = useOptionalI18n()?.locale ?? "en";
  const ui = createSystemTranslator(locale);
  if (isPast) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
        <span className="rounded-md bg-green-50 px-2 py-1 text-green-700">{counts.present} {ui(" present")}</span>
        <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">{counts.absent} {ui(" absence")}</span>
        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{counts.late} {ui(" late")}</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{ratings.rated} {ui(" of ")}{ratings.rateable} {ui(" rated")}</span>
        <span className={hasReview ? "rounded-md bg-green-50 px-2 py-1 text-green-700" : "rounded-md bg-amber-50 px-2 py-1 text-amber-700"}>
          {ui(hasReview ? "Review saved" : "Review missing")}
        </span>
      </div>
    );
  }

  if (isLive) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
        <span className="rounded-md bg-green-50 px-2 py-1 text-green-700">{counts.present} {ui(" present")}</span>
        <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">{counts.absent} {ui(" absence")}</span>
        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{counts.late} {ui(" late")}</span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
      <span aria-label={ui("{count} expected", { count: counts.plannedExpected })} className="rounded-md bg-green-50 px-2 py-1 text-green-700">{counts.plannedExpected} {ui(" expected")}</span>
      <span aria-label={ui("{count} not expected", { count: counts.unavailable + counts.unclear })} className="rounded-md bg-red-50 px-2 py-1 text-red-700">{counts.unavailable + counts.unclear} {ui(" not expected")}</span>
      <span className={counts.goalkeepers === 0 ? "rounded-md bg-red-50 px-2 py-1 text-red-700" : "rounded-md bg-slate-100 px-2 py-1 text-slate-700"}>
        {counts.fieldPlayers} {ui(" field · ")}{counts.goalkeepers} {ui(" GK · ")}{counts.trialPlayers} {ui(" trial")}</span>
    </div>
  );
}
