"use client";

import { useSystemText } from "@/components/i18n/use-system-text";


import { Check, Clock3, HelpCircle, ShieldAlert, Stethoscope, UserMinus } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useActionState, useContext, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { developmentCategoryLabel, developmentGoalCategories } from "@/config/development";
import { createPlayerObservation } from "@/lib/squad/development-actions";
import {
  completeTrainingEvent,
  markAllExpectedPresent,
  markAllPresent,
  markAllExpected,
  updateAttendanceRating,
  updateAttendanceRatingInline,
  updateFinalAttendance,
  updateFinalAttendanceInline,
  updatePlannedAttendanceInline,
  updatePlannedAttendance
} from "@/lib/squad/attendance-actions";
import type { AttendanceMutationResult, PlannedAttendanceMutationResult, RatingMutationResult } from "@/lib/squad/attendance-actions";
import { updatePlayerMedicalPeriodStatus } from "@/lib/squad/player-hub-actions";
import { actualAbsenceReasonLabel, attendanceDisplayName, effectiveActualAbsenceReason, finalStatusLabel, plannedReasonLabel, plannedStatusLabel } from "@/lib/squad/attendance-format";
import { attendanceCounts } from "@/lib/squad/attendance-format";
import { attendanceReasonLabels, overallRatingInitialValue, toggleRatingValue } from "@/lib/squad/attendance-utils";
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

type CheckInFilter = "all" | "present" | "absent" | "late" | "roster" | "trial";

const checkInFilterLabels: Record<CheckInFilter, string> = {
  all: "All",
  present: "Present",
  absent: "Absent",
  late: "Late",
  roster: "Roster",
  trial: "Trial players"
};

export function CheckInPanel({ event, initialFilter = "all" }: { event: SquadTrainingEventDetail; initialFilter?: CheckInFilter }) {
  const ui = useSystemText();
  const [entries, setEntries] = useState(event.attendance);
  const [filter, setFilter] = useState<CheckInFilter>(initialFilter);
  useEffect(() => setEntries(event.attendance), [event.attendance]);
  const counts = attendanceCounts(entries);
  const presentEntries = entries.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z");
  const visibleEntries = entries.filter((entry) => {
    if (filter === "present") return entry.finalStatus === "present" || entry.finalStatus === "Z";
    if (filter === "late") return entry.finalStatus === "Z";
    if (filter === "absent") return Boolean(entry.finalStatus && entry.finalStatus !== "present" && entry.finalStatus !== "Z");
    if (filter === "roster") return entry.player?.playerType !== "trial";
    if (filter === "trial") return entry.player?.playerType === "trial";
    return true;
  });

  function updateEntry(nextEntry: SquadAttendanceEntry) {
    setEntries((current) => current.map((entry) => entry.id === nextEntry.id ? nextEntry : entry));
  }

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CheckInMetric label={ui("Present")} value={counts.present} tone="success" />
        <CheckInMetric label={ui("Absent")} value={counts.absent} tone="danger" />
        <CheckInMetric label={ui("Late")} value={counts.late} tone="warning" />
        <CheckInMetric label={ui("Total")} value={entries.length} />
      </div>
      {presentEntries.length ? (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          {counts.goalkeepersPresent} {ui(" GK present · ")}{counts.trialPlayersPresent} {ui(" trial player")}{counts.trialPlayersPresent === 1 ? "" : "s"} {ui(" present")}</p>
      ) : null}
      {entries.length ? <div className="mt-4"><CheckInActions eventId={event.id} /></div> : null}

      {entries.length ? (
        <nav className="mt-5 flex gap-2 overflow-x-auto rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label={ui("Check-in filters")}>
          {(Object.keys(checkInFilterLabels) as CheckInFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition",
                filter === item ? "bg-board-green text-white" : "text-slate-600 hover:bg-slate-100 hover:text-board-navy"
              )}
            >
              {checkInFilterLabels[item]}
            </button>
          ))}
        </nav>
      ) : null}

      <section className="mt-5 space-y-3">
        {entries.length ? (
          visibleEntries.length ? (
            visibleEntries.map((entry) => <CheckInRow key={entry.id} entry={entry} eventId={event.id} eventDate={event.date} onEntryChange={updateEntry} />)
          ) : (
            <p className="rounded-lg border border-dashed border-board-line bg-white p-5 text-center text-sm font-semibold text-slate-500 shadow-soft">
              {ui("No players match this filter.")}</p>
          )
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="font-bold text-board-navy">{ui("No players to check in")}</h2>
            <p className="mt-2 text-sm text-slate-600">{ui("Go back to the event and add squad or trial players first.")}</p>
          </div>
        )}
      </section>
    </>
  );
}

export function PlannedAttendanceControls({ entry, eventId, returnTo }: { entry: SquadAttendanceEntry; eventId: string; returnTo: string }) {
  const ui = useSystemText();
  const [currentEntry, setCurrentEntry] = useState(entry);
  const [reason, setReason] = useState(entry.plannedReason ?? "");
  const [reasonNote, setReasonNote] = useState(entry.plannedReasonNote ?? "");
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentEntry(entry);
    setReason(entry.plannedReason ?? "");
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
              onClick={() => applyPlannedStatus(button.status)}
              className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${active ? button.className : "bg-white text-board-navy ring-1 ring-board-line hover:bg-slate-50"}`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{isPending && active ? "Saving..." : button.label}</span>
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
            {(["injured", "sick", "school", "work", "holiday", "private", "other", "V", "K", "E", "P", "S"] as const).map((reason) => (
              <option key={reason} value={reason}>{attendanceReasonLabels[reason]}</option>
            ))}
          </select>
          <input
            name="plannedReasonNote"
            value={reasonNote}
            onChange={(event) => setReasonNote(event.target.value)}
            placeholder={ui("Reason note optional")}
            className="h-10 min-w-0 flex-1 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
          />
          <Button type="submit" variant="secondary" disabled={isPending} className="h-10 px-3">{isPending ? "Saving..." : "Save reason"}</Button>
        </form>
      ) : null}
      <div aria-live="polite" className="min-h-4 text-xs font-semibold">
        {error ? <span className="text-red-700">{error}</span> : savedMessage ? <span className="text-board-green">{savedMessage}</span> : null}
      </div>
      {currentEntry.medicalAvailability ? (
        <div className="inline-flex flex-wrap items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
          <span className="inline-flex items-center gap-2">
            <Stethoscope className="h-3.5 w-3.5" />
            {ui("Medical status: ")}{currentEntry.medicalAvailability.label}
            {currentEntry.medicalAvailability.until ? ` until ${currentEntry.medicalAvailability.until}` : " until further notice"}
          </span>
          {currentEntry.medicalAvailability.needsReview ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{ui("Return needs review")}</span> : null}
          {currentEntry.plannedStatusSource === "manual" ? <span>{ui("Attendance override active")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CheckInActions({ eventId }: { eventId: string }) {
  const ui = useSystemText();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <form action={markAllExpectedPresent}>
        <input type="hidden" name="eventId" value={eventId} />
        <Button type="submit" variant="secondary" className="h-10 w-full justify-center px-3 sm:w-auto">{ui("Mark expected as present")}</Button>
      </form>
      <form action={markAllPresent}>
        <input type="hidden" name="eventId" value={eventId} />
        <Button
          type="submit"
          className="h-10 w-full justify-center px-3 sm:w-auto"
          onClick={(event) => {
            if (!window.confirm("Mark every player in this event as present? This can overwrite existing actual statuses.")) {
              event.preventDefault();
            }
          }}
        >
          {ui("Mark all present")}</Button>
      </form>
    </div>
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

export function CheckInRow({ entry, eventId, eventDate, onEntryChange }: { entry: SquadAttendanceEntry; eventId: string; eventDate: string; onEntryChange?: (entry: SquadAttendanceEntry) => void }) {
  const ui = useSystemText();
  const transition = useTransition();
  const [currentEntry, setCurrentEntry] = useState(entry);
  const [error, setError] = useState("");
  useEffect(() => setCurrentEntry(entry), [entry]);
  const entryWithState = currentEntry;
  function handleEntryChange(nextEntry: SquadAttendanceEntry) {
    setCurrentEntry(nextEntry);
    onEntryChange?.(nextEntry);
  }
  const isLate = entryWithState.finalStatus === "Z";
  const isAbsent = Boolean(entryWithState.finalStatus && entryWithState.finalStatus !== "present" && entryWithState.finalStatus !== "Z");
  const isParticipating = entryWithState.finalStatus === "present" || entryWithState.finalStatus === "Z";
  const actualAbsenceReason = effectiveActualAbsenceReason(entryWithState);
  const statusTone = entryWithState.finalStatus
    ? entryWithState.finalStatus === "present" || entryWithState.finalStatus === "Z"
      ? "bg-green-50 text-green-700"
      : "bg-red-50 text-red-700"
    : "bg-amber-50 text-amber-700";

  return (
    <CheckInTransitionContext.Provider value={transition}>
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <fieldset disabled={transition[0]} className="min-w-0 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-board-navy">
              {attendanceDisplayName(entryWithState)}
              {entryWithState.player?.playerType === "trial" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">{ui("Trial")}</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              {entryWithState.player?.position ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{entryWithState.player.position}</span> : null}
              {entryWithState.player?.playerType === "trial" ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{ui("Trial player")}</span> : null}
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                {ui("Planned: ")}{plannedStatusLabel(entryWithState.plannedStatus)}{plannedReasonLabel(entryWithState.plannedReason) ? ` · ${plannedReasonLabel(entryWithState.plannedReason)}` : ""}
              </span>
              <span className={`rounded-full px-2 py-1 ${statusTone}`}>
                {ui("Actual: ")}{isAbsent ? `Absent${actualAbsenceReason ? ` · ${actualAbsenceReasonLabel(actualAbsenceReason)}` : ""}` : finalStatusLabel(entryWithState.finalStatus)}
              </span>
              {entryWithState.medicalAvailability ? (
                <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                  {entryWithState.medicalAvailability.label}
                  {entryWithState.medicalAvailability.needsReview ? " · review" : ""}
                </span>
              ) : null}
            </div>
            {entryWithState.coachNote ? <p className="mt-2 text-sm text-slate-600">{entryWithState.coachNote}</p> : null}
            {error ? <p className="mt-2 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="present" label={ui("Present")} icon={<Check className="h-4 w-4" />} onOptimisticEntry={handleEntryChange} onError={setError} />
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="Z" label={ui("Late")} icon={<Clock3 className="h-4 w-4" />} onOptimisticEntry={handleEntryChange} onError={setError} />
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="absent" label={ui("Absent")} icon={<UserMinus className="h-4 w-4" />} onOptimisticEntry={handleEntryChange} onError={setError} />
          </div>
        </div>
        {isParticipating ? (
          <InlineRatingControl entry={entryWithState} eventId={eventId} onOptimisticEntry={handleEntryChange} onError={setError} />
        ) : null}
        {isLate ? (
          <form action={updateFinalAttendance} className="grid gap-2 rounded-md bg-amber-50 p-3 sm:grid-cols-[120px_150px_auto] sm:items-end">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="attendanceId" value={entryWithState.id} />
            <input type="hidden" name="finalStatus" value="Z" />
            <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/check-in`} />
            <label>
              <span className="text-xs font-bold uppercase text-amber-700">{ui("Late minutes")}</span>
              <input name="lateMinutes" type="number" min="0" defaultValue={entryWithState.lateMinutes ?? ""} className="mt-1 h-10 w-full rounded-md border border-amber-200 bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </label>
            <label className="flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 text-sm font-semibold text-slate-600">
              <input name="latePenaltyApplied" type="checkbox" defaultChecked={entryWithState.latePenaltyApplied} className="h-4 w-4" />
              {ui("Reliability penalty")}</label>
            <Button type="submit" variant="secondary" className="h-10">{ui("Save late details")}</Button>
          </form>
        ) : null}
        {isAbsent ? (
          <AbsenceReasonControl entry={entryWithState} eventId={eventId} onOptimisticEntry={handleEntryChange} onError={setError} />
        ) : null}
        {entryWithState.medicalAvailability?.periodId && (entryWithState.finalStatus === "present" || entryWithState.finalStatus === "Z") ? (
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
              {attendanceDisplayName(entry)}
              {entry.player?.playerType === "trial" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">{ui("Trial")}</span> : null}
            </p>
            <p className="text-sm text-slate-500">{ui("Actual: ")}{finalStatusLabel(entry.finalStatus)}{entry.ratingAutoSuggestion ? ` · Suggested ${entry.ratingAutoSuggestion}` : ""}</p>
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
                  {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                </select>
              </label>
              <label>
                <span className="text-xs font-bold uppercase text-slate-500">{ui("Category")}</span>
                <select name="category" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                  <option value="">{ui("Optional")}</option>
                  {developmentGoalCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
              </label>
            </div>
            {goals.length ? (
              <p className="text-xs text-slate-500">{ui("Active goals: ")}{goals.map((goal) => `${goal.title} (${developmentCategoryLabel(goal.category)})`).join(", ")}</p>
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

function InlineRatingControl({
  entry,
  eventId,
  onOptimisticEntry,
  onError
}: {
  entry: SquadAttendanceEntry;
  eventId: string;
  onOptimisticEntry: (entry: SquadAttendanceEntry) => void;
  onError: (message: string) => void;
}) {
  const ui = useSystemText();
  const [isPending, startTransition] = useCheckInTransition();

  function updateRating(value: number | null) {
    if (isPending) return;
    const previous = entry;
    const optimistic = { ...entry, overallRating: value ?? undefined };
    onError("");
    onOptimisticEntry(optimistic);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", eventId);
      formData.set("attendanceId", entry.id);
      if (value) formData.set("overallRating", String(value));
      const result = await safeAttendanceMutation(() => updateAttendanceRatingInline(formData));
      if (!result.ok) {
        onOptimisticEntry(previous);
        onError(result.message || "Rating could not be updated.");
        return;
      }
      onOptimisticEntry({ ...optimistic, overallRating: result.overallRating ?? undefined });
      onError(result.warning ?? "");
    });
  }

  return (
    <div className="rounded-md bg-green-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase text-green-700">{ui("Rating")}</p>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((rating) => {
            const active = entry.overallRating === rating;
            return (
              <button
                key={rating}
                type="button"
                disabled={isPending}
                aria-pressed={active}
                aria-label={`Rating ${rating}${active ? ", selected. Press again to remove rating." : ""}`}
                onClick={() => updateRating(toggleRatingValue(entry.overallRating, rating))}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70",
                  active ? "bg-board-green text-white" : "bg-white text-board-navy ring-1 ring-green-200 hover:bg-green-100"
                )}
              >
                {rating}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-xs text-green-800">{ui("Optional. Saved to the same rating used on the Ratings page.")}</p>
    </div>
  );
}

function AbsenceReasonControl({
  entry,
  eventId,
  onOptimisticEntry,
  onError
}: {
  entry: SquadAttendanceEntry;
  eventId: string;
  onOptimisticEntry: (entry: SquadAttendanceEntry) => void;
  onError: (message: string) => void;
}) {
  const ui = useSystemText();
  const [isPending, startTransition] = useCheckInTransition();
  const currentReason = effectiveActualAbsenceReason(entry) ?? defaultActualAbsenceReason(entry);

  function updateReason(reason: SquadActualAbsenceReason) {
    if (isPending) return;
    const previous = entry;
    const optimistic: SquadAttendanceEntry = {
      ...entry,
      finalStatus: legacyFinalStatusForReason(reason),
      actualAbsenceReason: reason,
      overallRating: undefined,
      ratingTechnique: undefined,
      ratingGameUnderstanding: undefined,
      ratingIntensity: undefined,
      ratingBehavior: undefined,
      ratingAutoSuggestion: undefined
    };
    onError("");
    onOptimisticEntry(optimistic);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", eventId);
      formData.set("attendanceId", entry.id);
      formData.set("finalStatus", "absent");
      formData.set("actualAbsenceReason", reason);
      const result = await safeAttendanceMutation(() => updateFinalAttendanceInline(formData));
      if (!result.ok) {
        onOptimisticEntry(previous);
        onError(result.message || "Absence reason could not be updated.");
        return;
      }
      onOptimisticEntry({
        ...optimistic,
        finalStatus: result.status,
        actualAbsenceReason: result.actualAbsenceReason ?? undefined,
        overallRating: result.overallRating ?? undefined
      });
      onError(result.warning ?? "");
    });
  }

  return (
    <div className="grid gap-2 rounded-md bg-red-50 p-3 sm:grid-cols-[minmax(180px,1fr)_auto] sm:items-end">
      <label>
        <span className="text-xs font-bold uppercase text-red-700">{ui("Reason")}</span>
        <select
          value={currentReason}
          onChange={(event) => updateReason(event.target.value as SquadActualAbsenceReason)}
          disabled={isPending}
          className="mt-1 h-10 w-full rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 disabled:cursor-wait disabled:opacity-70"
        >
          {actualAbsenceOptions.map((option) => <option key={option.reason} value={option.reason}>{option.label}</option>)}
        </select>
      </label>
      <span className="inline-flex h-10 items-center rounded-md bg-white px-3 text-xs font-bold text-red-700 ring-1 ring-red-200">
        {isPending ? "Saving..." : "Required for absence"}
      </span>
    </div>
  );
}

function FinalStatusButton({
  entry,
  eventId,
  status,
  label,
  icon,
  onOptimisticEntry,
  onError
}: {
  entry: SquadAttendanceEntry;
  eventId: string;
  status: SquadFinalAttendanceStatus;
  label: string;
  icon: ReactNode;
  onOptimisticEntry: (entry: SquadAttendanceEntry) => void;
  onError: (message: string) => void;
}) {
  const active = status === "absent"
    ? Boolean(entry.finalStatus && entry.finalStatus !== "present" && entry.finalStatus !== "Z")
    : entry.finalStatus === status;
  const [isPending, startTransition] = useCheckInTransition();
  const tone =
    status === "present"
      ? "bg-green-600 text-white hover:bg-green-700"
      : status === "Z"
        ? "bg-amber-500 text-white hover:bg-amber-600"
        : "bg-red-600 text-white hover:bg-red-700";
  const idle =
    status === "present"
      ? "bg-white text-green-700 ring-1 ring-green-200 hover:bg-green-50"
      : status === "Z"
        ? "bg-white text-amber-700 ring-1 ring-amber-200 hover:bg-amber-50"
        : "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50";
  function updateStatus() {
    if (isPending || active) return;
    const previous = entry;
    const actualAbsenceReason = status === "absent" ? defaultActualAbsenceReason(entry) : undefined;
    const optimistic: SquadAttendanceEntry = {
      ...entry,
      finalStatus: status,
      actualAbsenceReason,
      lateMinutes: status === "Z" ? entry.lateMinutes : undefined,
      latePenaltyApplied: status === "Z" ? entry.latePenaltyApplied : true,
      overallRating: status === "present" || status === "Z" ? entry.overallRating : undefined,
      ratingTechnique: status === "present" || status === "Z" ? entry.ratingTechnique : undefined,
      ratingGameUnderstanding: status === "present" || status === "Z" ? entry.ratingGameUnderstanding : undefined,
      ratingIntensity: status === "present" || status === "Z" ? entry.ratingIntensity : undefined,
      ratingBehavior: status === "present" || status === "Z" ? entry.ratingBehavior : undefined,
      ratingAutoSuggestion: status === "present" || status === "Z" ? entry.ratingAutoSuggestion : undefined
    };
    onError("");
    onOptimisticEntry(optimistic);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", eventId);
      formData.set("attendanceId", entry.id);
      formData.set("finalStatus", status);
      if (actualAbsenceReason) formData.set("actualAbsenceReason", actualAbsenceReason);
      if (status === "Z" && entry.latePenaltyApplied) formData.set("latePenaltyApplied", "on");
      const result = await safeAttendanceMutation(() => updateFinalAttendanceInline(formData));
      if (!result.ok) {
        onOptimisticEntry(previous);
        onError(result.message || "Attendance could not be updated. The previous status was restored.");
        return;
      }
      onOptimisticEntry({
        ...optimistic,
        finalStatus: result.status,
        actualAbsenceReason: result.actualAbsenceReason ?? undefined,
        lateMinutes: result.lateMinutes ?? undefined,
        latePenaltyApplied: result.latePenaltyApplied,
        overallRating: result.overallRating ?? undefined
      });
      onError(result.warning ?? "");
    });
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-busy={isPending}
      disabled={isPending || active}
      onClick={updateStatus}
      className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none sm:w-auto ${active ? tone : idle}`}
    >
      {icon}
      {isPending ? "Saving..." : label}
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

function defaultActualAbsenceReason(entry: SquadAttendanceEntry): SquadActualAbsenceReason {
  if (entry.actualAbsenceReason) return entry.actualAbsenceReason;
  if (entry.finalStatus === "V") return "injured";
  if (entry.finalStatus === "K") return "sick";
  if (entry.finalStatus === "E") return "excused";
  if (entry.finalStatus === "P") return "private";
  if (entry.finalStatus === "U") return "unexcused";
  if (entry.plannedReason === "injured" || entry.plannedReason === "V") return "injured";
  if (entry.plannedReason === "sick" || entry.plannedReason === "K") return "sick";
  if (entry.plannedReason === "school") return "school";
  if (entry.plannedReason === "work") return "work";
  if (entry.plannedReason === "holiday") return "holiday";
  if (entry.plannedReason === "private" || entry.plannedReason === "P") return "private";
  if (entry.plannedReason === "other") return "other";
  if (entry.plannedReason === "E") return "excused";
  if (entry.plannedReason === "U") return "unexcused";
  return "unexcused";
}

function legacyFinalStatusForReason(reason: SquadActualAbsenceReason): SquadFinalAttendanceStatus {
  if (reason === "injured") return "V";
  if (reason === "sick") return "K";
  if (reason === "excused") return "E";
  if (reason === "private") return "P";
  if (reason === "unexcused") return "U";
  return "absent";
}

function CheckInMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const styles = {
    neutral: "bg-slate-50 text-board-navy",
    success: "bg-green-50 text-green-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700"
  };
  return (
    <div className={`rounded-md px-3 py-3 ${styles[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function RatingSelect({ name, label, defaultValue }: { name: string; label: string; defaultValue?: number }) {
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
              aria-label={`${label} ${rating}${active ? ", selected. Press again to remove rating." : ""}`}
              onClick={() => setValue(toggleRatingValue(value, rating))}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-md text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-green-100",
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
  return missing ? (
    <p className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
      <ShieldAlert className="h-4 w-4" />
      {missing} {ui(" player")}{missing === 1 ? "" : "s"} {ui(" still need an actual status.")}</p>
  ) : null;
}
