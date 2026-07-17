"use client";

import { Check, HelpCircle, UserMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeTrainingEvent, updateAttendanceRating, updateAttendanceStatus } from "@/lib/squad/attendance-actions";
import { attendanceDisplayName } from "@/lib/squad/attendance-format";
import type { SquadAttendanceEntry } from "@/types/domain";

const statusButtons = [
  { status: "present", label: "Present", icon: Check, className: "bg-green-600 text-white hover:bg-green-700" },
  { status: "absent", label: "Absent", icon: X, className: "bg-red-50 text-red-700 hover:bg-red-100" },
  { status: "unavailable", label: "Unavailable", icon: UserMinus, className: "bg-amber-50 text-amber-700 hover:bg-amber-100" },
  { status: "unclear", label: "Unclear", icon: HelpCircle, className: "bg-slate-100 text-slate-700 hover:bg-slate-200" }
] as const;

export function AttendanceStatusButtons({ entry, eventId, returnTo }: { entry: SquadAttendanceEntry; eventId: string; returnTo: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {statusButtons.map((button) => {
        const Icon = button.icon;
        const active = entry.status === button.status;
        return (
          <form key={button.status} action={updateAttendanceStatus}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="attendanceId" value={entry.id} />
            <input type="hidden" name="status" value={button.status} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition sm:w-auto ${active ? button.className : "bg-white text-board-navy ring-1 ring-board-line hover:bg-slate-50"}`}
            >
              <Icon className="h-4 w-4" />
              {button.label}
            </button>
          </form>
        );
      })}
    </div>
  );
}

export function CheckInRow({ entry, eventId }: { entry: SquadAttendanceEntry; eventId: string }) {
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-bold text-board-navy">{attendanceDisplayName(entry)}</p>
          <p className="mt-1 text-sm text-slate-500">Status: {entry.status}</p>
        </div>
        <AttendanceStatusButtons entry={entry} eventId={eventId} returnTo={`/squad/attendance/${eventId}/check-in`} />
      </div>
    </article>
  );
}

export function RatingRow({ entry, eventId }: { entry: SquadAttendanceEntry; eventId: string }) {
  return (
    <form action={updateAttendanceRating} className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="attendanceId" value={entry.id} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <p className="font-bold text-board-navy">{attendanceDisplayName(entry)}</p>
          <p className="text-sm text-slate-500">Attendance: {entry.status}</p>
        </div>
        <RatingSelect name="rating" label="Performance" defaultValue={entry.rating} />
        <RatingSelect name="effortRating" label="Effort" defaultValue={entry.effortRating} />
        <label className="block flex-[1.5]">
          <span className="text-xs font-bold uppercase text-slate-500">Notes</span>
          <input name="notes" defaultValue={entry.notes ?? ""} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
        </label>
        <Button type="submit" variant="secondary" className="h-10">Save</Button>
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

function RatingSelect({ name, label, defaultValue }: { name: string; label: string; defaultValue?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className="mt-1 h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
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
