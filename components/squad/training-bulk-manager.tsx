"use client";

import { useDialogFocus } from "@/components/shared/use-dialog-focus";
import { DialogPortal } from "@/components/shared/dialog-portal";

import { useSystemText } from "@/components/i18n/use-system-text";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { formatDate } from "@/lib/i18n";


import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckSquare, RotateCcw, Trash2, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { TrainingCalendarRow } from "@/components/squad/training-calendar-row";
import {
  bulkMoveTrainingsToTrash,
  bulkPermanentlyDeleteTrainings,
  bulkRestoreTrainings,
  type BulkTrainingOperationResult
} from "@/lib/squad/attendance-actions";
import { trainingTimeRange } from "@/lib/trainings/utils";
import type { TrainingWorkflowState } from "@/lib/trainings/workflow";
import type { Locale } from "@/lib/i18n";
import type { SquadTrainingEventDetail } from "@/types/domain";

export type TrainingCalendarSection = {
  id: string;
  label: string;
  groupLabel?: string;
  eventIds: string[];
  moreHref?: string;
  moreLabel?: string;
};

type TrainingBulkManagerProps = {
  initialEvents: SquadTrainingEventDetail[];
  activeTeamId: string;
  activeTeamName: string;
  filterLabel: string;
  isTrash: boolean;
  sections: TrainingCalendarSection[];
  workflowByEventId: Record<string, TrainingWorkflowState>;
  emptyMessage: string;
  locale?: Locale;
};

type BulkAction = "trash" | "restore" | "permanent";

export function TrainingBulkManager({ initialEvents, activeTeamId, activeTeamName, filterLabel, isTrash, sections, workflowByEventId, emptyMessage, locale = "en" }: TrainingBulkManagerProps) {
  const copy = trainingBulkCopy[locale];
  const [events, setEvents] = useState(initialEvents);
  const initialEventsKey = useMemo(
    () => initialEvents.map((event) => `${event.id}:${event.updatedAt}:${event.deletedAt ?? ""}`).join("|"),
    [initialEvents]
  );
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [permanentConfirmation, setPermanentConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();
  const allSelected = events.length > 0 && events.every((event) => selectedIds.has(event.id));
  const someSelected = events.some((event) => selectedIds.has(event.id));
  const selectedEvents = useMemo(() => events.filter((event) => selectedIds.has(event.id)), [events, selectedIds]);
  const relatedSummary = useMemo(() => summarizeRelatedData(selectedEvents), [selectedEvents]);
  const masterRef = useRef<HTMLInputElement>(null);
  if (masterRef.current) masterRef.current.indeterminate = someSelected && !allSelected;

  useEffect(() => {
    setEvents(initialEvents);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setPendingAction(null);
    setPermanentConfirmation("");
    setMessage(undefined);
    setError(undefined);
  }, [activeTeamId, filterLabel, initialEvents, initialEventsKey, isTrash]);

  function enterSelectionMode() {
    setSelectionMode(true);
    setMessage(undefined);
    setError(undefined);
  }

  function cancelSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setPendingAction(null);
    setPermanentConfirmation("");
  }

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(events.map((event) => event.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function runBulkAction() {
    const ids = Array.from(selectedIds);
    const action = pendingAction;
    if (!action || !ids.length) return;
    setError(undefined);
    startTransition(async () => {
      const result = await executeBulkAction(action, {
        squadId: activeTeamId,
        trainingIds: ids,
        confirmation: permanentConfirmation
      });
      handleResult(result);
    });
  }

  function handleResult(result: BulkTrainingOperationResult) {
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const affected = new Set(result.affectedIds);
    setEvents((current) => current.filter((event) => !affected.has(event.id)));
    setSelectedIds(new Set());
    setSelectionMode(false);
    setPendingAction(null);
    setPermanentConfirmation("");
    setMessage(result.message);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-board-line bg-white p-3 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-board-navy">{copy.title}</p>
            <p className="text-xs font-semibold text-slate-500">{copy.count(events.length)}</p>
          </div>
          {selectionMode ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={deselectAll} disabled={!selectedIds.size} className="h-9 px-3">
                {copy.deselectAll}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelSelectionMode} className="h-9 px-3">
                {copy.cancel}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="secondary" onClick={enterSelectionMode} disabled={!events.length} className="h-9 px-3">
              <CheckSquare className="h-4 w-4" />
              {copy.select}
            </Button>
          )}
        </div>
        {selectionMode ? (
          <div className="mt-3 flex flex-col gap-3 rounded-md bg-board-paper p-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-3 text-sm font-bold text-board-navy">
              <input
                ref={masterRef}
                type="checkbox"
                checked={allSelected}
                onChange={(event) => {
                  if (event.target.checked) selectAllVisible();
                  else deselectAll();
                }}
                className="h-5 w-5 rounded border-slate-300 text-board-green focus:ring-board-green"
                aria-label={copy.selectAll}
              />
              {copy.selectAll}
            </label>
            <p className="text-xs font-semibold text-slate-500">{selectionLabel(selectedIds.size, locale)}</p>
          </div>
        ) : null}
      </div>

      {message ? <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{message}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {events.length ? (
        selectionMode ? (
          <section className="space-y-3 pb-24" data-training-selection-list>
            {events.map((event) => (
              <SelectableTrainingCard
                key={event.id}
                event={event}
                selected={selectedIds.has(event.id)}
                onToggle={() => toggle(event.id)}
              />
            ))}
          </section>
        ) : (
          <div className="space-y-7" data-training-calendar-sections>
            {sections.map((section) => {
              const sectionEvents = section.eventIds.map((id) => eventsById.get(id)).filter((event): event is SquadTrainingEventDetail => Boolean(event));
              if (!sectionEvents.length) return null;
              return (
                <section key={section.id} className="space-y-3" data-training-calendar-section={section.id}>
                  {section.groupLabel ? <h2 className="text-xl font-bold text-board-navy">{section.groupLabel}</h2> : null}
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    {section.label ? <h3 className="break-words text-base font-bold text-board-navy">{section.label} <span className="text-sm font-semibold text-slate-500">· {sectionEvents.length}</span></h3> : <p className="text-sm font-semibold text-slate-500">{sectionEvents.length} {copy.sectionCount}</p>}
                    {section.moreHref && section.moreLabel ? <ButtonLink href={section.moreHref} variant="ghost" className="h-9 px-3">{section.moreLabel}</ButtonLink> : null}
                  </div>
                  <div className="space-y-3">
                    {sectionEvents.map((event) => (
                      <TrainingCalendarRow key={event.id} event={event} workflow={workflowByEventId[event.id]} locale={locale} isTrash={isTrash} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">{copy.emptyTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{emptyMessage}</p>
          {!isTrash ? (
            <ButtonLink href="/trainings/new" className="mt-5">
              {copy.create}
            </ButtonLink>
          ) : null}
        </div>
      )}

      {selectionMode ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-board-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-board-navy" aria-live="polite">{selectionLabel(selectedIds.size, locale)}</p>
            <div className="flex flex-wrap gap-2">
              {isTrash ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setPendingAction("restore")} disabled={!selectedIds.size} className="h-9 px-3">
                    <RotateCcw className="h-4 w-4" />
                    {copy.restoreSelected}
                  </Button>
                  <Button type="button" variant="danger" onClick={() => setPendingAction("permanent")} disabled={!selectedIds.size} className="h-9 px-3">
                    <Trash2 className="h-4 w-4" />
                    {copy.deletePermanently}
                  </Button>
                </>
              ) : (
                <Button type="button" variant="danger" onClick={() => setPendingAction("trash")} disabled={!selectedIds.size} className="h-9 px-3">
                  <Trash2 className="h-4 w-4" />
                  {copy.deleteSelected}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {pendingAction ? (
        <BulkConfirmDialog
          action={pendingAction}
          selectedEvents={selectedEvents}
          relatedSummary={relatedSummary}
          filterLabel={filterLabel}
          teamName={activeTeamName}
          isPending={isPending}
          confirmation={permanentConfirmation}
          setConfirmation={setPermanentConfirmation}
          onCancel={() => {
            setPendingAction(null);
            setPermanentConfirmation("");
          }}
          onConfirm={runBulkAction}
        />
      ) : null}
    </div>
  );
}

const trainingBulkCopy = {
  en: {
    title: "Training management",
    select: "Select",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    cancel: "Cancel",
    restoreSelected: "Restore selected",
    deletePermanently: "Delete permanently",
    deleteSelected: "Delete selected",
    emptyTitle: "No trainings found",
    create: "Create training",
    sectionCount: "Trainings",
    count: (count: number) => `${count} Training${count === 1 ? "" : "s"} in this view`
  },
  de: {
    title: "Trainingsverwaltung",
    select: "Auswählen",
    selectAll: "Alle auswählen",
    deselectAll: "Auswahl aufheben",
    cancel: "Abbrechen",
    restoreSelected: "Ausgewählte wiederherstellen",
    deletePermanently: "Endgültig löschen",
    deleteSelected: "Ausgewählte löschen",
    emptyTitle: "Keine Trainingseinheiten gefunden",
    create: "Training erstellen",
    sectionCount: "Trainingseinheiten",
    count: (count: number) => `${count} Trainingseinheit${count === 1 ? "" : "en"} in dieser Ansicht`
  }
} as const;

function SelectableTrainingCard({ event, selected, onToggle }: { event: SquadTrainingEventDetail; selected: boolean; onToggle: () => void }) {
  const ui = useSystemText();
  const locale = useOptionalI18n()?.locale ?? "en";
  const title = event.label || ui("Training on {date}", { date: formatDate(event.date, locale) });
  return (
    <article
      className={`rounded-lg border bg-white p-4 shadow-soft transition ${selected ? "border-board-green ring-2 ring-board-green/20" : "border-board-line hover:border-board-green/40"}`}
    >
      <button type="button" onClick={onToggle} className="flex w-full gap-3 text-left" aria-pressed={selected}>
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            readOnly
            tabIndex={-1}
            className="h-5 w-5 rounded border-slate-300 text-board-green focus:ring-board-green"
            aria-label={ui("Select {title} on {date}", { title, date: formatDate(event.date, locale) })}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-board-green">
            {formatDate(event.date, locale, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })} · {trainingTimeRange(event)}
          </span>
          <span translate="no" className="mt-1 block break-words text-lg font-bold tracking-normal text-board-navy">{title}</span>
          {event.recurrenceSeriesId ? <span className="mt-2 block text-xs font-semibold text-slate-500">{ui("Recurring")}</span> : null}
        </span>
      </button>
    </article>
  );
}

function BulkConfirmDialog({
  action,
  selectedEvents,
  relatedSummary,
  filterLabel,
  teamName,
  isPending,
  confirmation,
  setConfirmation,
  onCancel,
  onConfirm
}: {
  action: BulkAction;
  selectedEvents: SquadTrainingEventDetail[];
  relatedSummary: RelatedSummary;
  filterLabel: string;
  teamName: string;
  isPending: boolean;
  confirmation: string;
  setConfirmation: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogFocus(true, () => { if (!isPending) onCancel(); });
  const ui = useSystemText();
  const locale = useOptionalI18n()?.locale ?? "en";
  const count = selectedEvents.length;
  const dateRange = selectedDateRange(selectedEvents, locale);
  const recurringCount = selectedEvents.filter((event) => event.recurrenceSeriesId).length;
  const expectedConfirmation = `DELETE ${count} TRAININGS`;
  const title =
    action === "restore"
      ? ui(count === 1 ? "Restore {count} Training?" : "Restore {count} Trainings?", { count })
      : action === "permanent"
        ? ui(count === 1 ? "Permanently delete {count} Training?" : "Permanently delete {count} Trainings?", { count })
        : ui(count === 1 ? "Delete {count} Training?" : "Delete {count} Trainings?", { count });
  return (
    <DialogPortal><div className="fixed inset-0 z-[var(--app-modal-z)] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bulk-training-dialog-title">
      <div ref={dialogRef} tabIndex={-1} className="app-dialog-panel max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="bulk-training-dialog-title" className="text-xl font-bold text-board-navy">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {ui(action === "trash"
                ? "These Trainings will be moved to Trash and removed from the normal Training Calendar. You can restore them later."
                : action === "restore"
                  ? "These Trainings and their related coaching data will return to the normal Training Calendar."
                  : "This permanently removes the selected Trainings and associated coaching data. This action cannot be undone.")}
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={isPending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label={ui("Close confirmation")}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 rounded-lg border border-board-line bg-board-paper p-4 text-sm text-slate-700 sm:grid-cols-2">
          <SummaryItem label={ui("Team")} value={teamName} />
          <SummaryItem label={ui("Filter scope")} value={filterLabel} />
          <SummaryItem label={ui("Trainings")} value={String(count)} />
          <SummaryItem label={ui("Period")} value={dateRange} />
        </div>
        <div className="mt-4 rounded-lg border border-board-line p-4">
          <p className="text-sm font-bold text-board-navy">{ui("Related data summary")}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>{relatedSummary.participants} {ui(" participant records")}</li>
            <li>{relatedSummary.ratings} {ui(" ratings")}</li>
            <li>{relatedSummary.plans} {ui(" linked Training Plans")}</li>
            {recurringCount ? <li>{ui("Selected trainings in recurring series: {count}. Only selected dates are affected.", { count: recurringCount })}</li> : null}
          </ul>
          {action !== "permanent" ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">{ui("This data is preserved and restored with the Trainings.")}</p>
          ) : null}
        </div>
        {action === "permanent" ? (
          <label className="mt-4 block">
            <span translate="no" className="text-sm font-bold text-red-700">{ui("Type {confirmation}", { confirmation: expectedConfirmation })}</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-red-200 px-3 text-board-navy outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
            />
          </label>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>{ui("Cancel")}</Button>
          <Button
            type="button"
            variant={action === "restore" ? "primary" : "danger"}
            onClick={onConfirm}
            disabled={isPending || (action === "permanent" && confirmation !== expectedConfirmation)}
          >
            {isPending ? ui("Working...") : action === "permanent" ? ui("Delete permanently") : action === "restore" ? ui(count === 1 ? "Restore {count} Training" : "Restore {count} Trainings", { count }) : ui(count === 1 ? "Move {count} Training to Trash" : "Move {count} Trainings to Trash", { count })}
          </Button>
        </div>
      </div>
    </div></DialogPortal>
  );
}

type RelatedSummary = {
  participants: number;
  ratings: number;
  plans: number;
};

function summarizeRelatedData(events: SquadTrainingEventDetail[]): RelatedSummary {
  return events.reduce(
    (summary, event) => {
      summary.participants += event.attendance.length;
      summary.ratings += event.attendance.filter((entry) =>
        Boolean(entry.overallRating || entry.ratingTechnique || entry.ratingGameUnderstanding || entry.ratingIntensity || entry.ratingBehavior)
      ).length;
      if (event.linkedTrainingSessionId) summary.plans += 1;
      return summary;
    },
    { participants: 0, ratings: 0, plans: 0 }
  );
}

function selectedDateRange(events: SquadTrainingEventDetail[], locale: Locale) {
  if (!events.length) return "-";
  const dates = events.map((event) => event.date).sort();
  const first = dates[0] ?? "";
  const last = dates.at(-1) ?? "";
  return first === last ? formatDate(first, locale) : `${formatDate(first, locale)} – ${formatDate(last, locale)}`;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-board-navy">{value}</p>
    </div>
  );
}

function selectionLabel(count: number, locale: Locale = "en") {
  if (locale === "de") return `${count} Trainingseinheit${count === 1 ? "" : "en"} ausgewählt`;
  if (count === 1) return "1 Training selected";
  return `${count} Trainings selected`;
}

async function executeBulkAction(action: BulkAction, input: { squadId: string; trainingIds: string[]; confirmation: string }) {
  if (action === "restore") return bulkRestoreTrainings({ squadId: input.squadId, trainingIds: input.trainingIds });
  if (action === "permanent") return bulkPermanentlyDeleteTrainings(input);
  return bulkMoveTrainingsToTrash({ squadId: input.squadId, trainingIds: input.trainingIds });
}
