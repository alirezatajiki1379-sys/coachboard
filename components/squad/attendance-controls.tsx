"use client";

import { Check, Clock3, HelpCircle, ShieldAlert, Stethoscope, UserMinus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { developmentCategoryLabel, developmentGoalCategories } from "@/config/development";
import { createPlayerObservation } from "@/lib/squad/development-actions";
import {
  completeTrainingEvent,
  markAllExpectedPresent,
  markAllPresent,
  markAllExpected,
  updateAttendanceRating,
  updateFinalAttendance,
  updateFinalAttendanceInline,
  updatePlannedAttendance
} from "@/lib/squad/attendance-actions";
import type { AttendanceMutationResult } from "@/lib/squad/attendance-actions";
import { updatePlayerMedicalPeriodStatus } from "@/lib/squad/player-hub-actions";
import { attendanceDisplayName, finalStatusLabel, plannedStatusLabel } from "@/lib/squad/attendance-format";
import { attendanceCounts } from "@/lib/squad/attendance-format";
import { attendanceReasonLabels } from "@/lib/squad/attendance-utils";
import { cn } from "@/lib/utils";
import type { PlayerDevelopmentGoal, SquadAttendanceEntry, SquadFinalAttendanceStatus, SquadPlannedAttendanceStatus, SquadTrainingEventDetail } from "@/types/domain";

const plannedButtons: Array<{ status: SquadPlannedAttendanceStatus; label: string; icon: typeof Check; className: string }> = [
  { status: "expected", label: "Expected", icon: Check, className: "bg-green-600 text-white hover:bg-green-700" },
  { status: "unavailable", label: "Unavailable", icon: UserMinus, className: "bg-red-50 text-red-700 hover:bg-red-100" },
  { status: "unclear", label: "Unclear", icon: HelpCircle, className: "bg-slate-100 text-slate-700 hover:bg-slate-200" }
];

const absenceOptions: Array<{ status: SquadFinalAttendanceStatus; label: string }> = [
  { status: "absent", label: "Absent, no reason added" },
  { status: "V", label: "Injured" },
  { status: "K", label: "Sick" },
  { status: "E", label: "Excused" },
  { status: "P", label: "Private reason" },
  { status: "S", label: "Late cancellation" },
  { status: "U", label: "Unexcused" }
];

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
        <CheckInMetric label="Present" value={counts.present} tone="success" />
        <CheckInMetric label="Absent" value={counts.absent} tone="danger" />
        <CheckInMetric label="Late" value={counts.late} tone="warning" />
        <CheckInMetric label="Total" value={entries.length} />
      </div>
      {presentEntries.length ? (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          {counts.goalkeepersPresent} GK present · {counts.trialPlayersPresent} trial player{counts.trialPlayersPresent === 1 ? "" : "s"} present
        </p>
      ) : null}
      {entries.length ? <div className="mt-4"><CheckInActions eventId={event.id} /></div> : null}

      {entries.length ? (
        <nav className="mt-5 flex gap-2 overflow-x-auto rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label="Check-in filters">
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
              No players match this filter.
            </p>
          )
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="font-bold text-board-navy">No players to check in</h2>
            <p className="mt-2 text-sm text-slate-600">Go back to the event and add squad or trial players first.</p>
          </div>
        )}
      </section>
    </>
  );
}

export function PlannedAttendanceControls({ entry, eventId, returnTo }: { entry: SquadAttendanceEntry; eventId: string; returnTo: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {plannedButtons.map((button) => {
          const Icon = button.icon;
          const active = entry.plannedStatus === button.status;
          return (
            <form key={button.status} action={updatePlannedAttendance}>
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="attendanceId" value={entry.id} />
              <input type="hidden" name="plannedStatus" value={button.status} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition ${active ? button.className : "bg-white text-board-navy ring-1 ring-board-line hover:bg-slate-50"}`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{button.label}</span>
              </button>
            </form>
          );
        })}
      </div>
      {entry.plannedStatus === "unavailable" ? (
        <form action={updatePlannedAttendance} className="grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="attendanceId" value={entry.id} />
          <input type="hidden" name="plannedStatus" value="unavailable" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <select
            name="plannedReason"
            defaultValue={entry.plannedReason ?? ""}
            className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            aria-label="Unavailable reason"
          >
            <option value="">Reason optional</option>
            {(["V", "K", "E", "P", "S"] as const).map((reason) => (
              <option key={reason} value={reason}>{attendanceReasonLabels[reason]}</option>
            ))}
          </select>
          <input
            name="plannedReasonNote"
            defaultValue={entry.plannedReasonNote ?? ""}
            placeholder="Reason note optional"
            className="h-10 min-w-0 flex-1 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
          />
          <Button type="submit" variant="secondary" className="h-10 px-3">Save reason</Button>
        </form>
      ) : null}
      {entry.medicalAvailability ? (
        <div className="inline-flex flex-wrap items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
          <span className="inline-flex items-center gap-2">
            <Stethoscope className="h-3.5 w-3.5" />
            Medical status: {entry.medicalAvailability.label}
            {entry.medicalAvailability.until ? ` until ${entry.medicalAvailability.until}` : " until further notice"}
          </span>
          {entry.medicalAvailability.needsReview ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Return needs review</span> : null}
          {entry.plannedStatusSource === "manual" ? <span>Attendance override active</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CheckInActions({ eventId }: { eventId: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <form action={markAllExpectedPresent}>
        <input type="hidden" name="eventId" value={eventId} />
        <Button type="submit" variant="secondary" className="h-10 w-full justify-center px-3 sm:w-auto">Mark expected as present</Button>
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
          Mark all present
        </Button>
      </form>
    </div>
  );
}

export function MarkAllExpectedButton({ eventId }: { eventId: string }) {
  return (
    <form action={markAllExpected}>
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="secondary" className="h-9 px-3">Mark all expected</Button>
    </form>
  );
}

export function CheckInRow({ entry, eventId, eventDate, onEntryChange }: { entry: SquadAttendanceEntry; eventId: string; eventDate: string; onEntryChange?: (entry: SquadAttendanceEntry) => void }) {
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
  const statusTone = entryWithState.finalStatus
    ? entryWithState.finalStatus === "present" || entryWithState.finalStatus === "Z"
      ? "bg-green-50 text-green-700"
      : "bg-red-50 text-red-700"
    : "bg-amber-50 text-amber-700";

  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-board-navy">
              {attendanceDisplayName(entryWithState)}
              {entryWithState.player?.playerType === "trial" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Trial</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              {entryWithState.player?.position ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{entryWithState.player.position}</span> : null}
              {entryWithState.player?.playerType === "trial" ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Trial player</span> : null}
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Planned: {plannedStatusLabel(entryWithState.plannedStatus)}</span>
              <span className={`rounded-full px-2 py-1 ${statusTone}`}>Actual: {finalStatusLabel(entryWithState.finalStatus)}</span>
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
          <div className="flex w-full gap-2 sm:w-auto">
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="present" label="Present" icon={<Check className="h-4 w-4" />} onOptimisticEntry={handleEntryChange} onError={setError} />
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="Z" label="Late" icon={<Clock3 className="h-4 w-4" />} onOptimisticEntry={handleEntryChange} onError={setError} />
            <FinalStatusButton entry={entryWithState} eventId={eventId} status="absent" label="Absent" icon={<UserMinus className="h-4 w-4" />} onOptimisticEntry={handleEntryChange} onError={setError} />
          </div>
        </div>
        {isLate ? (
          <form action={updateFinalAttendance} className="grid gap-2 rounded-md bg-amber-50 p-3 sm:grid-cols-[120px_150px_auto] sm:items-end">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="attendanceId" value={entryWithState.id} />
            <input type="hidden" name="finalStatus" value="Z" />
            <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/check-in`} />
            <label>
              <span className="text-xs font-bold uppercase text-amber-700">Late minutes</span>
              <input name="lateMinutes" type="number" min="0" defaultValue={entryWithState.lateMinutes ?? ""} className="mt-1 h-10 w-full rounded-md border border-amber-200 bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </label>
            <label className="flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 text-sm font-semibold text-slate-600">
              <input name="latePenaltyApplied" type="checkbox" defaultChecked={entryWithState.latePenaltyApplied} className="h-4 w-4" />
              Reliability penalty
            </label>
            <Button type="submit" variant="secondary" className="h-10">Save late details</Button>
          </form>
        ) : null}
        {isAbsent ? (
          <form action={updateFinalAttendance} className="grid gap-2 rounded-md bg-red-50 p-3 sm:grid-cols-[minmax(180px,1fr)_auto] sm:items-end">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="attendanceId" value={entryWithState.id} />
            <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/check-in`} />
            <label>
              <span className="text-xs font-bold uppercase text-red-700">Optional absence reason</span>
              <select name="finalStatus" defaultValue={entryWithState.finalStatus ?? "absent"} className="mt-1 h-10 w-full rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                {absenceOptions.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}
              </select>
            </label>
            <Button type="submit" variant="secondary" className="h-10">Save absence</Button>
          </form>
        ) : null}
        {entryWithState.medicalAvailability?.periodId && (entryWithState.finalStatus === "present" || entryWithState.finalStatus === "Z") ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">This player still has an active medical absence.</p>
            <p className="mt-1 text-sm text-amber-800">Mark as returned, or keep the medical status active.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <form action={updatePlayerMedicalPeriodStatus} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="playerId" value={entryWithState.playerId} />
                <input type="hidden" name="periodId" value={entryWithState.medicalAvailability.periodId} />
                <input type="hidden" name="status" value="completed" />
                <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/check-in`} />
                <input name="actualReturnDate" type="date" defaultValue={eventDate} className="h-10 rounded-md border border-amber-200 bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                <Button type="submit" variant="secondary" className="h-10">Mark returned</Button>
              </form>
              <span className="inline-flex h-10 items-center rounded-md bg-white px-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
                Keep medical status active
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function RatingRow({ entry, eventId, goals = [] }: { entry: SquadAttendanceEntry; eventId: string; goals?: PlayerDevelopmentGoal[] }) {
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <form action={updateAttendanceRating}>
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="attendanceId" value={entry.id} />
        <div className="space-y-3">
          <div>
            <p className="font-bold text-board-navy">
              {attendanceDisplayName(entry)}
              {entry.player?.playerType === "trial" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Trial</span> : null}
            </p>
            <p className="text-sm text-slate-500">Actual: {finalStatusLabel(entry.finalStatus)}{entry.ratingAutoSuggestion ? ` · Suggested ${entry.ratingAutoSuggestion}` : ""}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <RatingSelect name="overallRating" label="Overall" defaultValue={entry.overallRating} />
            <RatingSelect name="ratingTechnique" label="Technique" defaultValue={entry.ratingTechnique} />
            <RatingSelect name="ratingGameUnderstanding" label="Game IQ" defaultValue={entry.ratingGameUnderstanding} />
            <RatingSelect name="ratingIntensity" label="Intensity" defaultValue={entry.ratingIntensity} />
            <RatingSelect name="ratingBehavior" label="Behavior" defaultValue={entry.ratingBehavior} />
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase text-slate-500">Coach note</span>
            <textarea name="coachNote" defaultValue={entry.coachNote ?? ""} rows={2} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input name="sensitiveNote" type="checkbox" defaultChecked={entry.sensitiveNote} className="h-4 w-4" />
              Sensitive note
            </label>
            <Button type="submit" variant="secondary" className="h-10">Save rating</Button>
          </div>
        </div>
      </form>
      {entry.player ? (
        <details className="mt-4 rounded-md bg-board-paper p-3">
          <summary className="cursor-pointer text-sm font-bold text-board-navy">Add observation</summary>
          <form action={createPlayerObservation} className="mt-3 grid gap-2">
            <input type="hidden" name="playerId" value={entry.player.id} />
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/ratings`} />
            <div className="grid gap-2 sm:grid-cols-3">
              <label>
                <span className="text-xs font-bold uppercase text-slate-500">Date</span>
                <input name="observationDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
              </label>
              <label>
                <span className="text-xs font-bold uppercase text-slate-500">Goal</span>
                <select name="goalId" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                  <option value="">No linked goal</option>
                  {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                </select>
              </label>
              <label>
                <span className="text-xs font-bold uppercase text-slate-500">Category</span>
                <select name="category" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                  <option value="">Optional</option>
                  {developmentGoalCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
              </label>
            </div>
            {goals.length ? (
              <p className="text-xs text-slate-500">Active goals: {goals.map((goal) => `${goal.title} (${developmentCategoryLabel(goal.category)})`).join(", ")}</p>
            ) : null}
            <textarea name="note" required rows={2} placeholder="What did you notice?" className="w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            <Button type="submit" variant="secondary" className="h-10 w-full justify-center px-3 sm:w-auto">Save observation</Button>
          </form>
        </details>
      ) : null}
    </article>
  );
}

export function CompleteEventButton({ eventId }: { eventId: string }) {
  return (
    <form action={completeTrainingEvent}>
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="secondary" className="h-9 px-3">
        Mark completed
      </Button>
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
  const active = entry.finalStatus === status;
  const [isPending, startTransition] = useTransition();
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
    const optimistic: SquadAttendanceEntry = {
      ...entry,
      finalStatus: status,
      lateMinutes: status === "Z" ? entry.lateMinutes : undefined,
      latePenaltyApplied: status === "Z" ? entry.latePenaltyApplied : true
    };
    onError("");
    onOptimisticEntry(optimistic);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", eventId);
      formData.set("attendanceId", entry.id);
      formData.set("finalStatus", status);
      if (status === "Z" && entry.latePenaltyApplied) formData.set("latePenaltyApplied", "on");
      const result = await updateFinalAttendanceInline(formData) as AttendanceMutationResult;
      if (!result.ok) {
        onOptimisticEntry(previous);
        onError(result.message || "Attendance could not be updated. The previous status was restored.");
        return;
      }
      onOptimisticEntry({
        ...optimistic,
        finalStatus: result.status,
        lateMinutes: result.lateMinutes ?? undefined,
        latePenaltyApplied: result.latePenaltyApplied
      });
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
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
        <option value="">-</option>
        {[1, 2, 3, 4, 5].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MissingStatusesNotice({ entries }: { entries: SquadAttendanceEntry[] }) {
  const missing = entries.filter((entry) => !entry.finalStatus).length;
  return missing ? (
    <p className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
      <ShieldAlert className="h-4 w-4" />
      {missing} player{missing === 1 ? "" : "s"} still need an actual status.
    </p>
  ) : null;
}
