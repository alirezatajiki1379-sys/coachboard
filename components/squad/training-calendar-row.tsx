"use client";

import { MapPin, Repeat2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { TrainingEventActions } from "@/components/squad/training-event-actions";
import { useSystemText } from "@/components/i18n/use-system-text";
import { formatDate, type Locale } from "@/lib/i18n";
import { trainingTimeRange } from "@/lib/trainings/utils";
import type { TrainingWorkflowState } from "@/lib/trainings/workflow";
import type { SquadTrainingEventDetail } from "@/types/domain";

type TrainingCalendarRowProps = {
  event: SquadTrainingEventDetail;
  workflow?: TrainingWorkflowState;
  locale: Locale;
  isTrash?: boolean;
};

export function TrainingCalendarRow({ event, workflow, locale, isTrash = false }: TrainingCalendarRowProps) {
  const ui = useSystemText();
  const title = event.label || ui("Training on {date}", { date: formatDate(event.date, locale) });
  const phaseTone = workflow?.phase === "follow_up" && workflow.primaryAction?.kind === "check_in"
    ? "bg-amber-50 text-amber-800"
    : workflow?.phase === "live"
      ? "bg-green-50 text-green-800"
      : "bg-slate-100 text-slate-700";

  return (
    <article
      className="rounded-lg border border-board-line bg-white p-4 shadow-soft transition-colors hover:border-board-green/40"
      data-training-calendar-row
      data-workflow-phase={workflow?.phase ?? (isTrash ? "trash" : "")}
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(150px,0.8fr)_minmax(240px,1.4fr)_minmax(220px,1.35fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-board-green">
            {formatDate(event.date, locale, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">{trainingTimeRange(event)}</p>
        </div>

        <div className="min-w-0">
          <h2 translate="no" className="break-words text-lg font-bold tracking-normal text-board-navy">{title}</h2>
          {event.location ? (
            <p translate="no" className="mt-1 flex min-w-0 items-start gap-1.5 break-words text-sm text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{event.location}</span>
            </p>
          ) : null}
          {event.recurrenceSeriesId ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
              <Repeat2 className="h-3.5 w-3.5" />
              {ui("Recurring")}
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold uppercase ${phaseTone}`}>
            {isTrash ? ui("In Trash") : ui(workflow?.phaseLabel ?? "")}
          </span>
          {workflow?.phase === "follow_up" && workflow.reason ? (
            <p className="mt-2 break-words text-sm font-semibold text-slate-700">{ui(workflow.reason, workflow.reasonValues)}</p>
          ) : null}
          {workflow?.facts.length ? (
            <dl className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {workflow.facts.slice(0, 2).map((fact) => (
                <div key={`${fact.label}:${fact.value}`} className="min-w-0 break-words">
                  <dt className="inline font-semibold text-slate-500">{ui(fact.label)}: </dt>
                  <dd className="inline font-bold text-board-navy">{ui(fact.value, fact.values)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:max-w-[310px] lg:justify-end">
          {!isTrash && workflow?.primaryAction ? (
            <ButtonLink href={workflow.primaryAction.href} className="w-full justify-center sm:w-auto">
              {ui(workflow.primaryAction.label)}
            </ButtonLink>
          ) : null}
          {!isTrash ? (
            <ButtonLink href={`/trainings/${event.id}`} variant="secondary" className="w-full justify-center sm:w-auto">
              {ui("Open")}
            </ButtonLink>
          ) : null}
          <TrainingEventActions
            eventId={event.id}
            attendanceCount={event.attendance.length}
            compact
            isTrash={isTrash}
            isRecurring={Boolean(event.recurrenceSeriesId)}
          />
        </div>
      </div>
    </article>
  );
}
