"use client";

import { Check, Clock3, HelpCircle, ShieldAlert, UserMinus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  completeTrainingEvent,
  markAllExpectedPresent,
  markAllPresent,
  markAllExpected,
  updateAttendanceRating,
  updateFinalAttendance,
  updatePlannedAttendance
} from "@/lib/squad/attendance-actions";
import { attendanceDisplayName, finalStatusLabel, plannedStatusLabel } from "@/lib/squad/attendance-format";
import { attendanceReasonLabels } from "@/lib/squad/attendance-utils";
import type { SquadAttendanceEntry, SquadFinalAttendanceStatus, SquadPlannedAttendanceStatus } from "@/types/domain";

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

export function CheckInRow({ entry, eventId }: { entry: SquadAttendanceEntry; eventId: string }) {
  const isLate = entry.finalStatus === "Z";
  const isAbsent = Boolean(entry.finalStatus && entry.finalStatus !== "present" && entry.finalStatus !== "Z");
  const statusTone = entry.finalStatus
    ? entry.finalStatus === "present" || entry.finalStatus === "Z"
      ? "bg-green-50 text-green-700"
      : "bg-red-50 text-red-700"
    : "bg-amber-50 text-amber-700";

  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-board-navy">
              {attendanceDisplayName(entry)}
              {entry.player?.playerType === "trial" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Trial</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              {entry.player?.position ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{entry.player.position}</span> : null}
              {entry.player?.playerType === "trial" ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Trial player</span> : null}
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Planned: {plannedStatusLabel(entry.plannedStatus)}</span>
              <span className={`rounded-full px-2 py-1 ${statusTone}`}>Actual: {finalStatusLabel(entry.finalStatus)}</span>
            </div>
            {entry.coachNote ? <p className="mt-2 text-sm text-slate-600">{entry.coachNote}</p> : null}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <FinalStatusButton entry={entry} eventId={eventId} status="present" label="Present" icon={<Check className="h-4 w-4" />} />
            <FinalStatusButton entry={entry} eventId={eventId} status="Z" label="Late" icon={<Clock3 className="h-4 w-4" />} />
            <FinalStatusButton entry={entry} eventId={eventId} status="absent" label="Absent" icon={<UserMinus className="h-4 w-4" />} />
          </div>
        </div>
        {isLate ? (
          <form action={updateFinalAttendance} className="grid gap-2 rounded-md bg-amber-50 p-3 sm:grid-cols-[120px_150px_auto] sm:items-end">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="attendanceId" value={entry.id} />
            <input type="hidden" name="finalStatus" value="Z" />
            <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/check-in`} />
            <label>
              <span className="text-xs font-bold uppercase text-amber-700">Late minutes</span>
              <input name="lateMinutes" type="number" min="0" defaultValue={entry.lateMinutes ?? ""} className="mt-1 h-10 w-full rounded-md border border-amber-200 bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </label>
            <label className="flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 text-sm font-semibold text-slate-600">
              <input name="latePenaltyApplied" type="checkbox" defaultChecked={entry.latePenaltyApplied} className="h-4 w-4" />
              Reliability penalty
            </label>
            <Button type="submit" variant="secondary" className="h-10">Save late details</Button>
          </form>
        ) : null}
        {isAbsent ? (
          <form action={updateFinalAttendance} className="grid gap-2 rounded-md bg-red-50 p-3 sm:grid-cols-[minmax(180px,1fr)_auto] sm:items-end">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="attendanceId" value={entry.id} />
            <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/check-in`} />
            <label>
              <span className="text-xs font-bold uppercase text-red-700">Optional absence reason</span>
              <select name="finalStatus" defaultValue={entry.finalStatus ?? "absent"} className="mt-1 h-10 w-full rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                {absenceOptions.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}
              </select>
            </label>
            <Button type="submit" variant="secondary" className="h-10">Save absence</Button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export function RatingRow({ entry, eventId }: { entry: SquadAttendanceEntry; eventId: string }) {
  return (
    <form action={updateAttendanceRating} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
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

function FinalStatusButton({ entry, eventId, status, label, icon }: { entry: SquadAttendanceEntry; eventId: string; status: SquadFinalAttendanceStatus; label: string; icon: ReactNode }) {
  const active = entry.finalStatus === status;
  return (
    <form action={updateFinalAttendance} className="flex-1 sm:flex-none">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="attendanceId" value={entry.id} />
      <input type="hidden" name="finalStatus" value={status} />
      <input type="hidden" name="returnTo" value={`/squad/attendance/${eventId}/check-in`} />
      <button
        type="submit"
        className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition sm:w-auto ${active ? "bg-green-600 text-white hover:bg-green-700" : "bg-white text-board-navy ring-1 ring-board-line hover:bg-slate-50"}`}
      >
        {icon}
        {label}
      </button>
    </form>
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
