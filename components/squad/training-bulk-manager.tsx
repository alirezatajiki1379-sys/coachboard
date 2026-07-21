"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CheckSquare, RotateCcw, Trash2, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { TrainingEventCard } from "@/components/squad/training-event-card";
import {
  bulkMoveTrainingsToTrash,
  bulkPermanentlyDeleteTrainings,
  bulkRestoreTrainings,
  type BulkTrainingOperationResult
} from "@/lib/squad/attendance-actions";
import { attendanceCounts } from "@/lib/squad/attendance-format";
import { formatDateLabel, trainingDisplayTitle, trainingTimeRange, weekdayLabel } from "@/lib/trainings/utils";
import type { SquadAttendanceEntry, SquadTrainingEventDetail } from "@/types/domain";

type TrainingBulkManagerProps = {
  initialEvents: SquadTrainingEventDetail[];
  activeTeamId: string;
  activeTeamName: string;
  filterLabel: string;
  isTrash: boolean;
};

type BulkAction = "trash" | "restore" | "permanent";

export function TrainingBulkManager({ initialEvents, activeTeamId, activeTeamName, filterLabel, isTrash }: TrainingBulkManagerProps) {
  const [events, setEvents] = useState(initialEvents);
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
            <p className="text-sm font-bold text-board-navy">Training management</p>
            <p className="text-xs font-semibold text-slate-500">
              {events.length} Training{events.length === 1 ? "" : "s"} in this view · Team: {activeTeamName}
            </p>
          </div>
          {selectionMode ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={selectAllVisible} disabled={!events.length} className="h-9 px-3">
                Select all visible
              </Button>
              <Button type="button" variant="secondary" onClick={selectAllVisible} disabled={!events.length} className="h-9 px-3">
                Select all filtered
              </Button>
              <Button type="button" variant="ghost" onClick={deselectAll} disabled={!selectedIds.size} className="h-9 px-3">
                Deselect all
              </Button>
              <Button type="button" variant="ghost" onClick={cancelSelectionMode} className="h-9 px-3">
                Cancel
              </Button>
            </div>
          ) : (
            <Button type="button" variant="secondary" onClick={enterSelectionMode} disabled={!events.length} className="h-9 px-3">
              <CheckSquare className="h-4 w-4" />
              Select
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
                aria-label="Select all visible Trainings"
              />
              {selectionLabel(selectedIds.size)}
            </label>
            <p className="text-xs font-semibold text-slate-500">
              Select all visible and all filtered both mean these {events.length} Trainings because the current filtered result is fully loaded.
            </p>
          </div>
        ) : null}
      </div>

      {message ? <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{message}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {events.length ? (
        <section className="space-y-4 pb-24">
          {events.map((event) =>
            selectionMode ? (
              <SelectableTrainingCard
                key={event.id}
                event={event}
                attendance={event.attendance}
                selected={selectedIds.has(event.id)}
                onToggle={() => toggle(event.id)}
              />
            ) : (
              <TrainingEventCard key={event.id} event={event} attendance={event.attendance} hrefBase="/trainings" />
            )
          )}
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">No trainings found</h2>
          <p className="mt-2 text-sm text-slate-600">{isTrash ? "Training Trash is empty for this Team." : "No trainings scheduled for this Team. Create the first Training or switch to another Team."}</p>
          {!isTrash ? (
            <ButtonLink href="/trainings/new" className="mt-5">
              Create training
            </ButtonLink>
          ) : null}
        </div>
      )}

      {selectionMode ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-board-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-board-navy" aria-live="polite">{selectionLabel(selectedIds.size)}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={selectAllVisible} disabled={!events.length || allSelected} className="h-9 px-3">Select all filtered</Button>
              {isTrash ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setPendingAction("restore")} disabled={!selectedIds.size} className="h-9 px-3">
                    <RotateCcw className="h-4 w-4" />
                    Restore selected
                  </Button>
                  <Button type="button" variant="danger" onClick={() => setPendingAction("permanent")} disabled={!selectedIds.size} className="h-9 px-3">
                    <Trash2 className="h-4 w-4" />
                    Delete permanently
                  </Button>
                </>
              ) : (
                <Button type="button" variant="danger" onClick={() => setPendingAction("trash")} disabled={!selectedIds.size} className="h-9 px-3">
                  <Trash2 className="h-4 w-4" />
                  Delete selected
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

function SelectableTrainingCard({ event, attendance, selected, onToggle }: { event: SquadTrainingEventDetail; attendance: SquadAttendanceEntry[]; selected: boolean; onToggle: () => void }) {
  const counts = attendanceCounts(attendance);
  const title = trainingDisplayTitle(event);
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
            aria-label={`Select ${title} on ${formatDateLabel(event.date)}`}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-board-green">
            {weekdayLabel(event.date)} · {formatDateLabel(event.date)} · {trainingTimeRange(event)}
          </span>
          <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{event.status.replaceAll("_", " ")}</span>
          <span className="mt-1 block text-xl font-bold tracking-normal text-board-navy">{title}</span>
          <span className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-md bg-green-50 px-2 py-1 text-green-700">{counts.present || counts.expected} present/expected</span>
            <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">{counts.absent || counts.unavailable} absence/unavailable</span>
            <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{counts.late} late</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{attendance.length} participant records</span>
            {event.recurrenceSeriesId ? <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">Recurring</span> : null}
            {event.linkedTrainingSessionTitle ? <span className="rounded-md bg-green-50 px-2 py-1 text-board-green">Plan: {event.linkedTrainingSessionTitle}</span> : null}
          </span>
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
  const count = selectedEvents.length;
  const dateRange = selectedDateRange(selectedEvents);
  const recurringCount = selectedEvents.filter((event) => event.recurrenceSeriesId).length;
  const expectedConfirmation = `DELETE ${count} TRAININGS`;
  const title =
    action === "restore"
      ? `Restore ${count} Training${count === 1 ? "" : "s"}?`
      : action === "permanent"
        ? `Permanently delete ${count} Training${count === 1 ? "" : "s"}?`
        : `Delete ${count} Training${count === 1 ? "" : "s"}?`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bulk-training-dialog-title">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="bulk-training-dialog-title" className="text-xl font-bold text-board-navy">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {action === "trash"
                ? "These Trainings will be moved to Trash and removed from the normal Training Calendar. You can restore them later."
                : action === "restore"
                  ? "These Trainings and their related coaching data will return to the normal Training Calendar."
                  : "This permanently removes the selected Trainings and associated coaching data. This action cannot be undone."}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close confirmation">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 rounded-lg border border-board-line bg-board-paper p-4 text-sm text-slate-700 sm:grid-cols-2">
          <SummaryItem label="Team" value={teamName} />
          <SummaryItem label="Filter scope" value={filterLabel} />
          <SummaryItem label="Trainings" value={String(count)} />
          <SummaryItem label="Period" value={dateRange} />
        </div>
        <div className="mt-4 rounded-lg border border-board-line p-4">
          <p className="text-sm font-bold text-board-navy">Related data summary</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>{relatedSummary.participants} participant records</li>
            <li>{relatedSummary.ratings} ratings</li>
            <li>{relatedSummary.plans} linked Training Plans</li>
            {recurringCount ? <li>{recurringCount} selected Training{recurringCount === 1 ? "" : "s"} belong to recurring series. Only selected concrete Trainings are affected.</li> : null}
          </ul>
          {action !== "permanent" ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">This data is preserved and restored with the Trainings.</p>
          ) : null}
        </div>
        {action === "permanent" ? (
          <label className="mt-4 block">
            <span className="text-sm font-bold text-red-700">Type {expectedConfirmation}</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-red-200 px-3 text-board-navy outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
            />
          </label>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>Cancel</Button>
          <Button
            type="button"
            variant={action === "restore" ? "primary" : "danger"}
            onClick={onConfirm}
            disabled={isPending || (action === "permanent" && confirmation !== expectedConfirmation)}
          >
            {isPending ? "Working..." : actionLabel(action, count)}
          </Button>
        </div>
      </div>
    </div>
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

function selectedDateRange(events: SquadTrainingEventDetail[]) {
  if (!events.length) return "-";
  const dates = events.map((event) => event.date).sort();
  const first = dates[0] ?? "";
  const last = dates.at(-1) ?? "";
  return first === last ? formatDateLabel(first) : `${formatDateLabel(first)} to ${formatDateLabel(last)}`;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-board-navy">{value}</p>
    </div>
  );
}

function selectionLabel(count: number) {
  if (count === 1) return "1 Training selected";
  return `${count} Trainings selected`;
}

function actionLabel(action: BulkAction, count: number) {
  if (action === "restore") return `Restore ${count} Training${count === 1 ? "" : "s"}`;
  if (action === "permanent") return `Delete permanently`;
  return `Move ${count} Training${count === 1 ? "" : "s"} to Trash`;
}

async function executeBulkAction(action: BulkAction, input: { squadId: string; trainingIds: string[]; confirmation: string }) {
  if (action === "restore") return bulkRestoreTrainings({ squadId: input.squadId, trainingIds: input.trainingIds });
  if (action === "permanent") return bulkPermanentlyDeleteTrainings(input);
  return bulkMoveTrainingsToTrash({ squadId: input.squadId, trainingIds: input.trainingIds });
}
