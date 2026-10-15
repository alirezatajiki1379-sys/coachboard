"use client";

import { useSystemText } from "@/components/i18n/use-system-text";


import { Check, ChevronDown, ClipboardCheck, Clock3, HelpCircle, LogOut, ShieldAlert, Stethoscope, UserMinus } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useActionState, useContext, useEffect, useState, useTransition } from "react";
import { DialogPortal } from "@/components/shared/dialog-portal";
import { useDialogFocus } from "@/components/shared/use-dialog-focus";
import { Button, ButtonLink } from "@/components/ui/button";
import { developmentCategoryLabel, developmentGoalCategories } from "@/config/development";
import { formatDate } from "@/lib/i18n";
import { createPlayerObservation } from "@/lib/squad/development-actions";
import {
  completeTrainingEvent,
  applyAttendanceAsExpected,
  markAllExpectedPresent,
  markAllPresent,
  markAllExpected,
  updateAttendanceRating,
  updateFinalAttendanceInline,
  updatePlannedAttendanceInline,
  updatePlannedAttendance
} from "@/lib/squad/attendance-actions";
import type { ApplyAsExpectedAttendanceResult, AttendanceMutationResult, PlannedAttendanceMutationResult, RatingMutationResult } from "@/lib/squad/attendance-actions";
import { updatePlayerMedicalPeriodStatus } from "@/lib/squad/player-hub-actions";
import { actualAbsenceReasonLabel, attendanceDisplayName, checkInOpenLabel, effectiveActualAbsenceReason, finalStatusLabel, plannedReasonLabel, plannedStatusLabel } from "@/lib/squad/attendance-format";
import { attendanceCounts } from "@/lib/squad/attendance-format";
import {
  attendanceReasonLabels,
  getApplyAsExpectedSummary,
  isAbsentAttendanceStatus,
  isParticipatingAttendanceStatus,
  normalizePlannedAttendanceReason,
  overallRatingInitialValue,
  plannedAttendanceReasonOptions,
  plannedReasonToActualAbsenceReason,
  toggleRatingValue
} from "@/lib/squad/attendance-utils";
import { cn } from "@/lib/utils";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import type { PlayerDevelopmentGoal, SquadActualAbsenceReason, SquadAttendanceEntry, SquadFinalAttendanceStatus, SquadPlannedAttendanceStatus, SquadTrainingEventDetail } from "@/types/domain";

const plannedButtons: Array<{ status: SquadPlannedAttendanceStatus; label: string; icon: typeof Check; className: string }> = [
  { status: "expected", label: "Expected", icon: Check, className: "bg-green-600 text-white hover:bg-green-700" },
  { status: "unavailable", label: "Not expected", icon: UserMinus, className: "bg-red-50 text-red-700 hover:bg-red-100" },
  { status: "unclear", label: "Needs decision", icon: HelpCircle, className: "bg-slate-100 text-slate-700 hover:bg-slate-200" }
];

const actualAbsenceOptions: Array<{ reason: SquadActualAbsenceReason; label: string }> = [
  { reason: "unexcused", label: "Unexcused" },
  { reason: "late_cancellation", label: "Late cancellation" },
  { reason: "excused", label: "Excused" },
  { reason: "sick", label: "Sick" },
  { reason: "injured", label: "Injured" },
  { reason: "school", label: "School" },
  { reason: "work", label: "Work" },
  { reason: "holiday", label: "Holiday" },
  { reason: "private", label: "Private" },
  { reason: "other", label: "Other" }
];

const CheckInTransitionContext = createContext<ReturnType<typeof useTransition> | null>(null);

function useCheckInTransition() {
  const transition = useContext(CheckInTransitionContext);
  if (!transition) throw new Error("Check-in controls must be inside a check-in row.");
  return transition;
}

type CheckInFilter = "open" | "all" | "present" | "absent" | "late" | "leftEarly" | "roster" | "trial";

const checkInFilterLabels: Record<CheckInFilter, string> = {
  open: "Open",
  all: "All",
  present: "Present",
  absent: "Absent",
  late: "Late",
  leftEarly: "Left early",
  roster: "Roster",
  trial: "Trial players"
};

export function CheckInPanel({ event, initialFilter = "all" }: { event: SquadTrainingEventDetail; initialFilter?: CheckInFilter }) {
  const ui = useSystemText();
  const locale = useOptionalI18n()?.locale ?? "en";
  const [entries, setEntries] = useState(event.attendance);
  const [filter, setFilter] = useState<CheckInFilter>(initialFilter);
  const [editingExceptions, setEditingExceptions] = useState<Set<string>>(new Set());
  useEffect(() => setEntries(event.attendance), [event.attendance]);
  const counts = attendanceCounts(entries);
  const openCount = entries.filter((entry) => !entry.finalStatus || editingExceptions.has(entry.id)).length;
  const recordedCount = entries.length - openCount;
  useEffect(() => {
    if (openCount === 0 && filter === "open") setFilter("all");
  }, [filter, openCount]);
  const visibleEntries = entries.filter((entry) => {
    if (filter === "open") return !entry.finalStatus || editingExceptions.has(entry.id);
    if (filter === "present") return entry.finalStatus === "present";
    if (filter === "late") return entry.finalStatus === "Z";
    if (filter === "leftEarly") return entry.finalStatus === "left_early";
    if (filter === "absent") return isAbsentAttendanceStatus(entry.finalStatus);
    if (filter === "roster") return entry.player?.playerType !== "trial";
    if (filter === "trial") return entry.player?.playerType === "trial";
    return true;
  });

  function updateEntry(nextEntry: SquadAttendanceEntry) {
    setEntries((current) => current.map((entry) => entry.id === nextEntry.id ? nextEntry : entry));
  }

  function setExceptionEditing(attendanceId: string, editing: boolean) {
    setEditingExceptions((current) => {
      const next = new Set(current);
      if (editing) next.add(attendanceId);
      else next.delete(attendanceId);
      return next;
    });
  }

  function applyBulkUpdates(updates: Extract<ApplyAsExpectedAttendanceResult, { ok: true }>["updates"]) {
    const updatesById = new Map(updates.map((update) => [update.attendanceId, update]));
    setEntries((current) => current.map((entry) => {
      const update = updatesById.get(entry.id);
      if (!update) return entry;
      const isAbsent = isAbsentAttendanceStatus(update.finalStatus);
      return {
        ...entry,
        finalStatus: update.finalStatus,
        actualAbsenceReason: update.actualAbsenceReason ?? undefined,
        lateMinutes: undefined,
        latePenaltyApplied: true,
        ...(isAbsent ? {
          overallRating: undefined,
          ratingTechnique: undefined,
          ratingGameUnderstanding: undefined,
          ratingIntensity: undefined,
          ratingBehavior: undefined,
          ratingAutoSuggestion: undefined
        } : {})
      };
    }));
  }

  return (
    <>
      {entries.length ? (
        <div className="sticky top-[4.25rem] z-10 mt-5 rounded-lg border border-board-line bg-white/95 p-3 shadow-soft backdrop-blur sm:static sm:bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-board-navy">{ui("{recorded} of {total} recorded", { recorded: recordedCount, total: entries.length })}</p>
              <p className={cn("text-sm font-bold", openCount ? "text-amber-700" : "text-board-green")}>
                {openCount ? ui("{count} open", { count: openCount }) : ui("Attendance complete")}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-600">
              <span>{ui("Present")} {counts.present}</span>
              {counts.late ? <span>{ui("Late")} {counts.late}</span> : null}
              {counts.absent ? <span>{ui("Absent")} {counts.absent}</span> : null}
              {counts.leftEarly ? <span>{ui("Left early")} {counts.leftEarly}</span> : null}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
            {(["open", "all"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-bold transition",
                  filter === item ? "bg-board-green text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {item === "open" ? checkInOpenLabel(locale) : ui(checkInFilterLabels[item])}{item === "open" ? ` ${openCount}` : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {entries.length ? (
        <div className="mt-4 space-y-3">
          <CheckInActions eventId={event.id} entries={entries} onApplied={applyBulkUpdates} />
        </div>
      ) : null}

      {entries.length ? (
        <details className="mt-3 rounded-lg border border-board-line bg-white shadow-soft">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-bold text-board-navy">
            {ui("Filters")}
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </summary>
          <nav className="flex flex-wrap gap-2 border-t border-board-line p-2" aria-label={ui("Check-in filters")}>
            {(["present", "absent", "late", "leftEarly", "roster", "trial"] as const).map((item) => {
              const count = item === "present" ? counts.present : item === "absent" ? counts.absent : item === "late" ? counts.late : item === "leftEarly" ? counts.leftEarly : item === "trial" ? entries.filter((entry) => entry.player?.playerType === "trial").length : entries.filter((entry) => entry.player?.playerType !== "trial").length;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={cn(
                    "min-h-10 rounded-md px-3 py-2 text-sm font-semibold transition",
                    filter === item ? "bg-board-green text-white" : "text-slate-600 hover:bg-slate-100 hover:text-board-navy"
                  )}
                >
                  {ui(checkInFilterLabels[item])}{count ? ` ${count}` : ""}
                </button>
              );
            })}
          </nav>
        </details>
      ) : null}

      {entries.length && openCount === 0 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-green-200 bg-green-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-bold text-green-800">{ui("Attendance complete")}</p>
          <ButtonLink href={`/trainings/${event.id}`} variant="secondary" className="w-full justify-center sm:w-auto">{ui("Back to training")}</ButtonLink>
        </div>
      ) : null}

      <section className="mt-5 space-y-3">
        {entries.length ? (
          visibleEntries.length ? (
            visibleEntries.map((entry) => <CheckInRow key={entry.id} entry={entry} eventId={event.id} eventDate={event.date} onEntryChange={updateEntry} onExceptionEditingChange={setExceptionEditing} />)
          ) : (
            <p className="rounded-lg border border-dashed border-board-line bg-white p-5 text-center text-sm font-semibold text-slate-500 shadow-soft">
              {ui("No players match this filter.")}</p>
          )
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="font-bold text-board-navy">{ui("No players for this training")}</h2>
            <p className="mt-2 text-sm text-slate-600">{ui("Add or sync players from the Training first.")}</p>
            <ButtonLink href={`/trainings/${event.id}`} variant="secondary" className="mt-4 w-full justify-center sm:w-auto">{ui("Back to training")}</ButtonLink>
          </div>
        )}
      </section>
    </>
  );
}

export function ApplyAsExpectedAttendance({
  eventId,
  entries,
  onApplied
}: {
  eventId: string;
  entries: SquadAttendanceEntry[];
  onApplied?: (updates: Extract<ApplyAsExpectedAttendanceResult, { ok: true }>["updates"]) => void;
}) {
  const ui = useSystemText();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ApplyAsExpectedAttendanceResult | null>(null);
  const summary = getApplyAsExpectedSummary(entries);

  function applyPlannedAttendance() {
    setResult(null);
    startTransition(async () => {
      const nextResult = await applyAttendanceAsExpected(eventId);
      setResult(nextResult);
      if (nextResult.ok) onApplied?.(nextResult.updates);
    });
  }

  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50 p-3" aria-labelledby={`apply-as-expected-${eventId}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 id={`apply-as-expected-${eventId}`} className="flex items-center gap-2 text-sm font-bold text-board-navy">
            <ClipboardCheck className="h-4 w-4 shrink-0 text-board-green" />
            {ui("Apply as expected")}
          </h3>
          <p className="mt-1 text-sm text-slate-600">{ui("Set missing attendance based on planned participation.")}</p>
          <p className="mt-2 text-xs font-semibold text-slate-700">
            {ui("Apply planned participation to {count} players", { count: summary.applicable })}
            {" · "}{ui("{count} present", { count: summary.present })}
            {" · "}{ui("{count} absent", { count: summary.absent })}
            {summary.needsReview ? ` · ${ui("{count} need review", { count: summary.needsReview })}` : ""}
          </p>
        </div>
        <Button
          type="button"
          onClick={applyPlannedAttendance}
          disabled={isPending || summary.applicable === 0}
          className="h-11 w-full shrink-0 justify-center px-4 sm:w-auto"
        >
          {isPending ? ui("Applying...") : ui("Apply as expected")}
        </Button>
      </div>
      {result ? (
        <p className={`mt-3 text-sm font-semibold ${result.ok ? "text-emerald-800" : "text-red-700"}`} role="status">
          {result.ok
            ? `${ui("{count} attendance records updated", { count: result.updatedCount })}${result.reviewCount ? ` · ${ui("{count} require review", { count: result.reviewCount })}` : ""}${result.warning ? ` · ${ui(result.warning)}` : ""}`
            : ui(result.message)}
        </p>
      ) : null}
    </section>
  );
}

export function PlannedAttendanceControls({ entry, eventId, returnTo }: { entry: SquadAttendanceEntry; eventId: string; returnTo: string }) {
  const ui = useSystemText();
  const initialReason = normalizePlannedAttendanceReason(entry.plannedReason) ?? "";
  const [currentEntry, setCurrentEntry] = useState(entry);
  const [reason, setReason] = useState(initialReason);
  const [reasonNote, setReasonNote] = useState(entry.plannedReasonNote ?? "");
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentEntry(entry);
    setReason(normalizePlannedAttendanceReason(entry.plannedReason) ?? "");
    setReasonNote(entry.plannedReasonNote ?? "");
  }, [entry]);

  function applyPlannedStatus(status: SquadPlannedAttendanceStatus, nextReason = reason, nextReasonNote = reasonNote) {
    if (isPending) return;
    const previous = currentEntry;
    const optimistic: SquadAttendanceEntry = {
      ...currentEntry,
      plannedStatus: status,
      plannedReason: status === "unavailable" ? nextReason as SquadAttendanceEntry["plannedReason"] : undefined,
      plannedReasonNote: status === "unavailable" ? nextReasonNote || undefined : undefined,
      plannedStatusSource: "manual"
    };
    setError("");
    setSavedMessage("");
    setCurrentEntry(optimistic);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", eventId);
      formData.set("attendanceId", currentEntry.id);
      formData.set("plannedStatus", status);
      if (status === "unavailable") {
        if (nextReason) formData.set("plannedReason", nextReason);
        if (nextReasonNote) formData.set("plannedReasonNote", nextReasonNote);
      }
      const result = await safeAttendanceMutation(() => updatePlannedAttendanceInline(formData));
      if (!result.ok) {
        setCurrentEntry(previous);
        setError(result.message || "Planned participation could not be updated.");
        return;
      }
      setCurrentEntry({
        ...optimistic,
        plannedStatus: result.plannedStatus,
        plannedReason: result.plannedReason ?? undefined,
        plannedReasonNote: result.plannedReasonNote ?? undefined,
        plannedStatusSource: "manual"
      });
      setReason(result.plannedReason ?? "");
      setReasonNote(result.plannedReasonNote ?? "");
      setError(result.warning ?? "");
      setSavedMessage("Saved");
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {plannedButtons.map((button) => {
          const Icon = button.icon;
          const active = currentEntry.plannedStatus === button.status;
          return (
            <button
              key={button.status}
              type="button"
              disabled={isPending && !active}
              aria-label={ui(button.label)}
              onClick={() => applyPlannedStatus(button.status)}
              className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${active ? button.className : "bg-white text-board-navy ring-1 ring-board-line hover:bg-slate-50"}`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{ui(isPending && active ? "Saving..." : button.label)}</span>
            </button>
          );
        })}
      </div>
      {currentEntry.plannedStatus === "unavailable" ? (
        <form
          action={updatePlannedAttendance}
          onSubmit={(event) => {
            event.preventDefault();
            applyPlannedStatus("unavailable", reason, reasonNote);
          }}
          className="grid gap-2 sm:grid-cols-[160px_1fr_auto]"
        >
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="attendanceId" value={currentEntry.id} />
          <input type="hidden" name="plannedStatus" value="unavailable" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <select
            name="plannedReason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            aria-label={ui("Not expected reason")}
          >
            <option value="">{ui("Reason optional")}</option>
            {plannedAttendanceReasonOptions.map((reason) => (
              <option key={reason} value={reason}>{ui(attendanceReasonLabels[reason])}</option>
            ))}
          </select>
          <input
            name="plannedReasonNote"
            value={reasonNote}
            onChange={(event) => setReasonNote(event.target.value)}
            placeholder={ui("Reason note optional")}
            className="h-10 min-w-0 flex-1 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
          />
          <Button type="submit" variant="secondary" disabled={isPending} className="h-10 px-3">{ui(isPending ? "Saving..." : "Save reason")}</Button>
        </form>
      ) : null}
      <div aria-live="polite" className="min-h-4 text-xs font-semibold">
        {error ? <span className="text-red-700">{ui(error)}</span> : savedMessage ? <span className="text-board-green">{ui(savedMessage)}</span> : null}
      </div>
      {currentEntry.medicalAvailability ? (
        <div className="inline-flex flex-wrap items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
          <span className="inline-flex items-center gap-2">
            <Stethoscope className="h-3.5 w-3.5" />
            {ui("Medical status: ")}{ui(currentEntry.medicalAvailability.label)}
            {currentEntry.medicalAvailability.until ? ` until ${currentEntry.medicalAvailability.until}` : " until further notice"}
          </span>
          {currentEntry.medicalAvailability.needsReview ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{ui("Return needs review")}</span> : null}
          {currentEntry.plannedStatusSource === "manual" ? <span>{ui("Attendance override active")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CheckInActions({
  eventId,
  entries,
  onApplied
}: {
  eventId: string;
  entries: SquadAttendanceEntry[];
  onApplied?: (updates: Extract<ApplyAsExpectedAttendanceResult, { ok: true }>["updates"]) => void;
}) {
  const ui = useSystemText();
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  return (
    <div className="space-y-2">
      <form action={markAllExpectedPresent} className="w-full sm:w-auto">
        <input type="hidden" name="eventId" value={eventId} />
        <Button type="submit" className="h-11 w-full justify-center px-4 sm:w-auto">{ui("Mark expected as present")}</Button>
      </form>
      <details className="rounded-lg border border-board-line bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-bold text-board-navy">
          {ui("More bulk actions")}
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </summary>
        <div className="space-y-3 border-t border-board-line p-3">
          <ApplyAsExpectedAttendance eventId={eventId} entries={entries} onApplied={onApplied} />
          <Button type="button" variant="danger" className="h-11 w-full justify-center sm:w-auto" onClick={() => setConfirmAllOpen(true)}>
            {ui("Mark all present")}
          </Button>
        </div>
      </details>
      {confirmAllOpen ? <MarkAllPresentDialog eventId={eventId} onClose={() => setConfirmAllOpen(false)} /> : null}
    </div>
  );
}

function MarkAllPresentDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const ui = useSystemText();
  const dialogRef = useDialogFocus<HTMLFormElement>(true, onClose);
  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[var(--app-modal-z)] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="mark-all-present-title">
        <form ref={dialogRef} tabIndex={-1} action={markAllPresent} className="app-dialog-panel w-full max-w-md rounded-lg bg-white p-5 shadow-xl outline-none">
          <input type="hidden" name="eventId" value={eventId} />
          <h2 id="mark-all-present-title" className="text-lg font-bold text-board-navy">{ui("Mark all participants as present?")}</h2>
          <p className="mt-2 text-sm text-slate-600">{ui("Existing actual attendance statuses can be overwritten.")}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="h-11 w-full sm:w-auto" onClick={onClose}>{ui("Cancel")}</Button>
            <Button type="submit" variant="danger" className="h-11 w-full sm:w-auto">{ui("Mark all present")}</Button>
          </div>
        </form>
      </div>
    </DialogPortal>
  );
}

export function MarkAllExpectedButton({ eventId }: { eventId: string }) {
  const ui = useSystemText();
  return (
    <form action={markAllExpected}>
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="secondary" className="h-9 px-3">{ui("Mark all expected")}</Button>
    </form>
  );
}

export function CheckInRow({
  entry,
  eventId,
  eventDate,
  onEntryChange,
  onExceptionEditingChange
}: {
  entry: SquadAttendanceEntry;
  eventId: string;
  eventDate: string;
  onEntryChange?: (entry: SquadAttendanceEntry) => void;
  onExceptionEditingChange?: (attendanceId: string, editing: boolean) => void;
}) {
  const ui = useSystemText();
  const locale = useOptionalI18n()?.locale ?? "en";
  const transition = useTransition();
  const [currentEntry, setCurrentEntry] = useState(entry);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setCurrentEntry(entry), [entry]);
  const entryWithState = currentEntry;
  function handleOptimisticEntry(nextEntry: SquadAttendanceEntry) {
    setCurrentEntry(nextEntry);
  }
  function handleCommittedEntry(nextEntry: SquadAttendanceEntry) {
    setCurrentEntry(nextEntry);
    onEntryChange?.(nextEntry);
  }
  const isLate = entryWithState.finalStatus === "Z";
  const isLeftEarly = entryWithState.finalStatus === "left_early";
  const isAbsent = isAbsentAttendanceStatus(entryWithState.finalStatus);
  const isParticipating = isParticipatingAttendanceStatus(entryWithState.finalStatus);
  const showsActualAttendanceDetails = isLate || isAbsent || isLeftEarly;
  const actualAbsenceReason = effectiveActualAbsenceReason(entryWithState);
  const showsPlannedContext = entryWithState.plannedStatus === "unavailable" || entryWithState.plannedStatus === "unclear" || Boolean(entryWithState.plannedReason);
  const actualStatusText = isAbsent
    ? `${ui("Absent")}${actualAbsenceReason ? ` · ${ui(actualAbsenceReasonLabel(actualAbsenceReason))}` : ""}`
    : isLate
      ? `${ui("Late")}${entryWithState.lateMinutes !== undefined ? ` · ${entryWithState.lateMinutes} ${ui("min.")}` : ""}`
      : isLeftEarly
        ? `${ui("Left early")}${entryWithState.leftEarlyMinute !== undefined ? ` · ${entryWithState.leftEarlyMinute}. ${ui("min.")}` : ""}`
        : ui(finalStatusLabel(entryWithState.finalStatus));
  const statusTone = entryWithState.finalStatus
    ? entryWithState.finalStatus === "present" || entryWithState.finalStatus === "Z"
      ? "bg-green-50 text-green-700"
      : entryWithState.finalStatus === "left_early"
        ? "bg-orange-50 text-orange-700"
      : "bg-red-50 text-red-700"
    : "bg-amber-50 text-amber-700";

  return (
    <CheckInTransitionContext.Provider value={transition}>
    <article className="min-w-0 break-words rounded-lg border border-board-line bg-white p-3 shadow-soft sm:p-4">
      <fieldset disabled={transition[0]} className="min-w-0 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-board-navy">
              <span translate="no">{attendanceDisplayName(entryWithState)}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              {entryWithState.player?.position ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{entryWithState.player.position}</span> : null}
              {entryWithState.player?.playerType === "trial" ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{ui("Trial player")}</span> : null}
              {showsPlannedContext ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                  {ui(plannedStatusLabel(entryWithState.plannedStatus))}{plannedReasonLabel(entryWithState.plannedReason) ? ` · ${ui(plannedReasonLabel(entryWithState.plannedReason))}` : ""}
                </span>
              ) : null}
              {entryWithState.finalStatus ? <span className={`rounded-full px-2 py-1 ${statusTone}`}>{actualStatusText}</span> : null}
            </div>
            {entryWithState.plannedReasonNote && !detailsOpen ? (
              <p translate="no" className="mt-1 text-sm text-slate-500">&ldquo;{entryWithState.plannedReasonNote}&rdquo;</p>
            ) : null}
            {entryWithState.actualAttendanceNote && !detailsOpen ? (
              <p translate="no" className="mt-1 text-sm text-slate-700">&ldquo;{entryWithState.actualAttendanceNote}&rdquo;</p>
            ) : null}
            {entryWithState.medicalAvailability ? (
              <div className="mt-2 inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-800">
                <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                <span>{ui(entryWithState.medicalAvailability.label)}</span>
                {entryWithState.medicalAvailability.until ? <span>· {ui("Expected return")} {formatDate(entryWithState.medicalAvailability.until, locale)}</span> : null}
                {entryWithState.medicalAvailability.needsReview ? <span>· {ui("Return needs review")}</span> : null}
              </div>
            ) : null}
            {entryWithState.coachNote ? <p className="mt-2 text-sm text-slate-600">{entryWithState.coachNote}</p> : null}
            {error ? <p className="mt-2 text-sm font-semibold text-red-700" role="alert">{ui(error)}</p> : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="present" label={ui("Present")} icon={<Check className="h-4 w-4" />} onOptimisticEntry={handleOptimisticEntry} onCommittedEntry={handleCommittedEntry} onOpenDetails={() => setDetailsOpen(true)} onExceptionEditingChange={onExceptionEditingChange} onError={setError} />
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="Z" label={ui("Late")} icon={<Clock3 className="h-4 w-4" />} onOptimisticEntry={handleOptimisticEntry} onCommittedEntry={handleCommittedEntry} onOpenDetails={() => setDetailsOpen(true)} onExceptionEditingChange={onExceptionEditingChange} onError={setError} />
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="absent" label={ui("Absent")} icon={<UserMinus className="h-4 w-4" />} onOptimisticEntry={handleOptimisticEntry} onCommittedEntry={handleCommittedEntry} onOpenDetails={() => setDetailsOpen(true)} onExceptionEditingChange={onExceptionEditingChange} onError={setError} />
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="left_early" label={ui("Left early")} icon={<LogOut className="h-4 w-4" />} onOptimisticEntry={handleOptimisticEntry} onCommittedEntry={handleCommittedEntry} onOpenDetails={() => setDetailsOpen(true)} onExceptionEditingChange={onExceptionEditingChange} onError={setError} />
          </div>
        </div>
        {showsActualAttendanceDetails && detailsOpen ? (
          <ActualAttendanceDetails key={`${entryWithState.id}-${entryWithState.finalStatus}`} entry={entryWithState} eventId={eventId} onEntryChange={handleCommittedEntry} onDetailsSaved={() => { setDetailsOpen(false); onExceptionEditingChange?.(entryWithState.id, false); }} onError={setError} />
        ) : null}
        {entryWithState.medicalAvailability?.periodId && isParticipating ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">{ui("This player still has an active medical absence.")}</p>
            <p className="mt-1 text-sm text-amber-800">{ui("Mark as returned, or keep the medical status active.")}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <form action={updatePlayerMedicalPeriodStatus} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="playerId" value={entryWithState.playerId} />
                <input type="hidden" name="periodId" value={entryWithState.medicalAvailability.periodId} />
                <input type="hidden" name="status" value="completed" />
                <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/check-in`} />
                <input name="actualReturnDate" type="date" defaultValue={eventDate} className="h-10 rounded-md border border-amber-200 bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                <Button type="submit" variant="secondary" className="h-10">{ui("Mark returned")}</Button>
              </form>
              <span className="inline-flex h-10 items-center rounded-md bg-white px-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
                {ui("Keep medical status active")}</span>
            </div>
          </div>
        ) : null}
      </fieldset>
    </article>
    </CheckInTransitionContext.Provider>
  );
}

export function RatingRow({ entry, eventId, goals = [] }: { entry: SquadAttendanceEntry; eventId: string; goals?: PlayerDevelopmentGoal[] }) {
  const ui = useSystemText();
  const locale = useOptionalI18n()?.locale ?? "en";
  const [note, setNote] = useState(entry.coachNote ?? "");
  const [sensitiveNote, setSensitiveNote] = useState(entry.sensitiveNote ?? false);
  const [result, saveRating, isSaving] = useActionState<RatingMutationResult | null, FormData>(async (_previous, data) => {
    return safeAttendanceMutation(() => updateAttendanceRating(data));
  }, null);
  const initialOverallRating = overallRatingInitialValue(entry);
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <form action={saveRating}>
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="attendanceId" value={entry.id} />
        <div className="space-y-3">
          <div>
            <p className="font-bold text-board-navy">
              <span translate="no">{attendanceDisplayName(entry)}</span>
              {entry.player?.playerType === "trial" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">{ui("Trial")}</span> : null}
            </p>
            <p className="text-sm text-slate-500">{ui("Actual: ")}{ui(finalStatusLabel(entry.finalStatus))}{entry.ratingAutoSuggestion ? ` · ${ui("Suggested {rating}", { rating: entry.ratingAutoSuggestion })}` : ""}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <RatingSelect name="overallRating" label={ui("Overall")} defaultValue={result?.ok ? result.overallRating ?? undefined : initialOverallRating} />
            <RatingSelect name="ratingTechnique" label={ui("Technique")} defaultValue={entry.ratingTechnique} />
            <RatingSelect name="ratingGameUnderstanding" label={ui("Game IQ")} defaultValue={entry.ratingGameUnderstanding} />
            <RatingSelect name="ratingIntensity" label={ui("Intensity")} defaultValue={entry.ratingIntensity} />
            <RatingSelect name="ratingBehavior" label={ui("Behavior")} defaultValue={entry.ratingBehavior} />
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase text-slate-500">{ui("Coach note")}</span>
            <textarea name="coachNote" value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input name="sensitiveNote" type="checkbox" checked={sensitiveNote} onChange={(event) => setSensitiveNote(event.target.checked)} className="h-4 w-4" />
              {ui("Sensitive note")}</label>
            <Button type="submit" disabled={isSaving} variant="secondary" className="h-10">{isSaving ? "Saving..." : "Save rating"}</Button>
          </div>
          {result ? <p role={result.ok ? "status" : "alert"} className={`text-sm font-semibold ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.ok
              ? result.warning
                ? locale === "de" ? "Bewertung gespeichert, aber der Trainingsstatus konnte nicht aktualisiert werden. Bitte lade die Seite neu." : result.warning
                : locale === "de" ? "Bewertung gespeichert." : "Rating saved."
              : locale === "de" ? "Bewertung konnte nicht gespeichert werden. Bitte prüfe die Anwesenheit und versuche es erneut. Deine Eingaben bleiben erhalten." : "Rating could not be saved. Check attendance and try again. Your entries have been kept."}
          </p> : null}
        </div>
      </form>
      {entry.player ? (
        <details className="mt-4 rounded-md bg-board-paper p-3">
          <summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Add observation")}</summary>
          <form action={createPlayerObservation} className="mt-3 grid gap-2">
            <input type="hidden" name="playerId" value={entry.player.id} />
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/ratings`} />
            <div className="grid gap-2 sm:grid-cols-3">
              <label>
                <span className="text-xs font-bold uppercase text-slate-500">{ui("Date")}</span>
                <input name="observationDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
              </label>
              <label>
                <span className="text-xs font-bold uppercase text-slate-500">{ui("Goal")}</span>
                <select name="goalId" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                  <option value="">{ui("No linked goal")}</option>
                  {goals.map((goal) => <option translate="no" key={goal.id} value={goal.id}>{goal.title}</option>)}
                </select>
              </label>
              <label>
                <span className="text-xs font-bold uppercase text-slate-500">{ui("Category")}</span>
                <select name="category" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                  <option value="">{ui("Optional")}</option>
                  {developmentGoalCategories.map((category) => <option key={category.value} value={category.value}>{ui(category.label)}</option>)}
                </select>
              </label>
            </div>
            {goals.length ? (
              <p className="text-xs text-slate-500" translate="no">{ui("Active goals: ")}{goals.map((goal) => `${goal.title} (${ui(developmentCategoryLabel(goal.category))})`).join(", ")}</p>
            ) : null}
            <textarea name="note" required rows={2} placeholder={ui("What did you notice?")} className="w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            <Button type="submit" variant="secondary" className="h-10 w-full justify-center px-3 sm:w-auto">{ui("Save observation")}</Button>
          </form>
        </details>
      ) : null}
    </article>
  );
}

export function CompleteEventButton({ eventId }: { eventId: string }) {
  const ui = useSystemText();
  return (
    <form action={completeTrainingEvent}>
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="secondary" className="h-10 px-3">
        {ui("Mark completed")}</Button>
    </form>
  );
}

export function ActualAttendanceDetails({
  entry,
  eventId,
  onEntryChange,
  onDetailsSaved,
  onError
}: {
  entry: SquadAttendanceEntry;
  eventId: string;
  onEntryChange?: (entry: SquadAttendanceEntry) => void;
  onDetailsSaved?: () => void;
  onError?: (message: string) => void;
}) {
  const ui = useSystemText();
  const [isPending, startTransition] = useTransition();
  const [savedEntry, setSavedEntry] = useState(entry);
  useEffect(() => setSavedEntry(entry), [entry]);
  const status = savedEntry.finalStatus;
  const needsReason = status === "left_early" || isAbsentAttendanceStatus(status);
  const currentReason = effectiveActualAbsenceReason(savedEntry) ?? defaultActualAbsenceReason(savedEntry);
  const effectiveAttendanceNote = isAbsentAttendanceStatus(status)
    ? savedEntry.actualAttendanceNote ?? savedEntry.plannedReasonNote ?? ""
    : savedEntry.actualAttendanceNote ?? "";
  const tone = status === "left_early" ? "border-orange-200 bg-orange-50" : status === "Z" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
  const noteLabel = status === "left_early"
    ? "Note about leaving early"
    : status === "Z"
      ? "Late note"
      : "Absence note";
  const formLayout = status === "left_early"
    ? "sm:grid-cols-[minmax(0,3fr)_minmax(7.5rem,2fr)_minmax(0,5fr)]"
    : status === "Z"
      ? "sm:grid-cols-[minmax(8.75rem,1fr)_minmax(0,2fr)]"
      : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]";
  const saveLayout = status === "left_early"
    ? "sm:col-span-3"
    : status === "Z"
      ? "sm:justify-self-end"
      : "sm:col-span-2";

  function saveDetails(formData: FormData) {
    if (isPending || !status) return;
    const reason = formData.get("actualAbsenceReason");
    if (needsReason && !reason) {
      onError?.("Select an actual reason before saving.");
      return;
    }
    onError?.("");
    startTransition(async () => {
      formData.set("eventId", eventId);
      formData.set("attendanceId", savedEntry.id);
      formData.set("finalStatus", isAbsentAttendanceStatus(status) ? "absent" : status);
      const result = await safeAttendanceMutation(() => updateFinalAttendanceInline(formData));
      if (!result.ok) {
        onError?.(result.message || "Attendance details could not be updated.");
        return;
      }
      const nextEntry: SquadAttendanceEntry = {
        ...savedEntry,
        finalStatus: result.status,
        actualAbsenceReason: result.actualAbsenceReason ?? undefined,
        actualAttendanceNote: result.actualAttendanceNote ?? undefined,
        lateMinutes: result.lateMinutes ?? undefined,
        leftEarlyMinute: result.leftEarlyMinute ?? undefined,
        latePenaltyApplied: result.latePenaltyApplied,
        overallRating: result.overallRating ?? undefined
      };
      setSavedEntry(nextEntry);
      onEntryChange?.(nextEntry);
      onDetailsSaved?.();
      onError?.(result.warning ?? "");
    });
  }

  return (
    <form action={saveDetails} className={`grid gap-3 rounded-md border p-3 ${tone} ${formLayout}`}>
      {needsReason ? (
        <label>
          <span className="text-xs font-bold uppercase text-slate-600">{ui("Reason")} *</span>
          <select name="actualAbsenceReason" defaultValue={currentReason ?? ""} disabled={isPending} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
            <option value="">{ui("Select reason")}</option>
            {actualAbsenceOptions.map((option) => <option key={option.reason} value={option.reason}>{ui(option.label)}</option>)}
          </select>
        </label>
      ) : null}
      {status === "Z" ? (
        <label>
          <span className="text-xs font-bold uppercase text-slate-600">{ui("Late minutes")}</span>
          <input name="lateMinutes" type="number" min="0" defaultValue={savedEntry.lateMinutes ?? ""} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
        </label>
      ) : null}
      {status === "left_early" ? (
        <label>
          <span className="text-xs font-bold uppercase text-slate-600">{ui("Left after minute")}</span>
          <input name="leftEarlyMinute" type="number" min="0" defaultValue={savedEntry.leftEarlyMinute ?? ""} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
        </label>
      ) : null}
      <label>
        <span className="text-xs font-bold uppercase text-slate-600">{ui(noteLabel)}</span>
        <input name="actualAttendanceNote" type="text" defaultValue={effectiveAttendanceNote} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
      </label>
      {status === "Z" ? (
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-board-line bg-white px-3 text-sm font-semibold text-slate-600">
          <input name="latePenaltyApplied" type="checkbox" defaultChecked={savedEntry.latePenaltyApplied} className="h-4 w-4" />
          {ui("Count as late arrival")}
        </label>
      ) : null}
      <div className={saveLayout}>
        <Button type="submit" disabled={isPending} variant="secondary" className="h-11 w-full justify-center sm:w-auto">
          {ui(isPending ? "Saving..." : "Save attendance details")}
        </Button>
      </div>
    </form>
  );
}

function FinalStatusButton({
  entry,
  eventId,
  status,
  label,
  icon,
  onOptimisticEntry,
  onCommittedEntry,
  onOpenDetails,
  onExceptionEditingChange,
  onError
}: {
  entry: SquadAttendanceEntry;
  eventId: string;
  status: SquadFinalAttendanceStatus;
  label: string;
  icon: ReactNode;
  onOptimisticEntry: (entry: SquadAttendanceEntry) => void;
  onCommittedEntry: (entry: SquadAttendanceEntry) => void;
  onOpenDetails: () => void;
  onExceptionEditingChange?: (attendanceId: string, editing: boolean) => void;
  onError: (message: string) => void;
}) {
  const ui = useSystemText();
  const active = status === "absent"
    ? isAbsentAttendanceStatus(entry.finalStatus)
    : entry.finalStatus === status;
  const [isPending, startTransition] = useCheckInTransition();
  const tone =
    status === "present"
      ? "bg-green-600 text-white hover:bg-green-700"
      : status === "Z"
        ? "bg-amber-500 text-white hover:bg-amber-600"
        : status === "left_early"
          ? "bg-orange-600 text-white hover:bg-orange-700"
          : "bg-red-600 text-white hover:bg-red-700";
  const idle =
    status === "present"
      ? "bg-white text-green-700 ring-1 ring-green-200 hover:bg-green-50"
      : status === "Z"
        ? "bg-white text-amber-700 ring-1 ring-amber-200 hover:bg-amber-50"
        : status === "left_early"
          ? "bg-white text-orange-700 ring-1 ring-orange-200 hover:bg-orange-50"
          : "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50";
  function updateStatus() {
    if (isPending) return;
    if (active) {
      if (status !== "present") onOpenDetails();
      return;
    }
    const previous = entry;
    const actualAbsenceReason = status === "absent" || status === "left_early" ? defaultActualAbsenceReason(entry) : undefined;
    const optimistic: SquadAttendanceEntry = {
      ...entry,
      finalStatus: status,
      actualAbsenceReason,
      actualAttendanceNote: status === "present" ? undefined : entry.actualAttendanceNote,
      lateMinutes: status === "Z" ? entry.lateMinutes : undefined,
      leftEarlyMinute: status === "left_early" ? entry.leftEarlyMinute : undefined,
      latePenaltyApplied: status === "Z" ? entry.latePenaltyApplied : true,
      overallRating: isParticipatingAttendanceStatus(status) ? entry.overallRating : undefined,
      ratingTechnique: isParticipatingAttendanceStatus(status) ? entry.ratingTechnique : undefined,
      ratingGameUnderstanding: isParticipatingAttendanceStatus(status) ? entry.ratingGameUnderstanding : undefined,
      ratingIntensity: isParticipatingAttendanceStatus(status) ? entry.ratingIntensity : undefined,
      ratingBehavior: isParticipatingAttendanceStatus(status) ? entry.ratingBehavior : undefined,
      ratingAutoSuggestion: isParticipatingAttendanceStatus(status) ? entry.ratingAutoSuggestion : undefined
    };
    onError("");
    const isException = status !== "present";
    onExceptionEditingChange?.(entry.id, isException);
    onOptimisticEntry(optimistic);
    if (isException) {
      onOpenDetails();
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", eventId);
      formData.set("attendanceId", entry.id);
      formData.set("finalStatus", "present");
      const result = await safeAttendanceMutation(() => updateFinalAttendanceInline(formData));
      if (!result.ok) {
        onOptimisticEntry(previous);
        onError(result.message || "Attendance could not be updated. The previous status was restored.");
        return;
      }
      const committed = {
        ...optimistic,
        finalStatus: result.status,
        actualAbsenceReason: result.actualAbsenceReason ?? undefined,
        actualAttendanceNote: result.actualAttendanceNote ?? undefined,
        lateMinutes: result.lateMinutes ?? undefined,
        leftEarlyMinute: result.leftEarlyMinute ?? undefined,
        latePenaltyApplied: result.latePenaltyApplied,
        overallRating: result.overallRating ?? undefined
      };
      onOptimisticEntry(committed);
      onCommittedEntry(committed);
      onExceptionEditingChange?.(entry.id, false);
      onError(result.warning ?? "");
    });
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-busy={isPending}
      disabled={isPending || (active && status === "present")}
      onClick={updateStatus}
      className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none sm:w-auto ${active ? tone : idle}`}
    >
      {icon}
      {ui(isPending ? "Saving..." : label)}
    </button>
  );
}

async function safeAttendanceMutation<T extends AttendanceMutationResult | RatingMutationResult | PlannedAttendanceMutationResult>(save: () => Promise<T>): Promise<T | { ok: false; code: string; message: string }> {
  try {
    return await save();
  } catch {
    return { ok: false, code: "network_error", message: "Changes could not be saved. Please try again." };
  }
}

function defaultActualAbsenceReason(entry: SquadAttendanceEntry): SquadActualAbsenceReason | undefined {
  if (entry.actualAbsenceReason) return entry.actualAbsenceReason;
  if (entry.finalStatus === "V") return "injured";
  if (entry.finalStatus === "K") return "sick";
  if (entry.finalStatus === "E") return "excused";
  if (entry.finalStatus === "P") return "private";
  if (entry.finalStatus === "U") return "unexcused";
  return plannedReasonToActualAbsenceReason(entry.plannedReason) ?? undefined;
}

function RatingSelect({ name, label, defaultValue }: { name: string; label: string; defaultValue?: number }) {
  const ui = useSystemText();
  const [value, setValue] = useState<number | null>(defaultValue ?? null);

  useEffect(() => {
    setValue(defaultValue ?? null);
  }, [defaultValue]);

  return (
    <fieldset className="block">
      <legend className="text-xs font-bold uppercase text-slate-500">{label}</legend>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((rating) => {
          const active = value === rating;
          return (
            <button
              key={rating}
              type="button"
              aria-pressed={active}
              aria-label={ui(active ? "{label} {rating}, selected. Press again to remove rating." : "{label} {rating}", { label, rating })}
              onClick={() => setValue(toggleRatingValue(value, rating))}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-green-100",
                active ? "bg-board-green text-white" : "bg-white text-board-navy ring-1 ring-board-line hover:bg-green-50 hover:ring-board-green"
              )}
            >
              {rating}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function MissingStatusesNotice({ entries }: { entries: SquadAttendanceEntry[] }) {
  const ui = useSystemText();
  const missing = entries.filter((entry) => !entry.finalStatus).length;
  const missingReasons = entries.filter((entry) => (isAbsentAttendanceStatus(entry.finalStatus) || entry.finalStatus === "left_early") && !effectiveActualAbsenceReason(entry)).length;
  return missing || missingReasons ? (
    <p className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
      <ShieldAlert className="h-4 w-4" />
      <span>{missing ? ui("{count} players still need an actual status.", { count: missing }) : null}{missing && missingReasons ? " " : ""}{missingReasons ? ui("{count} absent or left-early players still need an actual reason.", { count: missingReasons }) : null}</span>
    </p>
  ) : null;
}
