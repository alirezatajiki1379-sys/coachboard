"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createTrainingEvent, updateTrainingEvent, type TrainingEventActionState } from "@/lib/squad/attendance-actions";
import { recurrenceSummary, weekdayForDate } from "@/lib/trainings/utils";
import type { Squad, SquadPlayer, SquadTrainingEventDetail } from "@/types/domain";

type TrainingEventFormProps = {
  sessions: Array<{ id: string; title: string }>;
  squads: Squad[];
  participants: SquadPlayer[];
  event?: SquadTrainingEventDetail;
  mode?: "create" | "edit";
};

const initialState: TrainingEventActionState = {};

export function TrainingEventForm({ sessions, squads, participants, event, mode = "create" }: TrainingEventFormProps) {
  const action = mode === "edit" ? updateTrainingEvent : createTrainingEvent;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const selectedParticipants = useMemo(
    () => new Set(mode === "edit" ? event?.attendance.map((entry) => entry.playerId) ?? [] : participants.map((player) => player.id)),
    [event?.attendance, mode, participants]
  );
  const activeTeam = squads.find((squad) => squad.isActive) ?? squads[0];
  const eventTeam = event?.squadId ? squads.find((squad) => squad.id === event.squadId) : undefined;
  const assignedTeam = eventTeam ?? activeTeam;
  const values = useMemo(
    () =>
      state.values ?? {
        date: event?.date ?? "",
        startTime: event?.startTime ?? "",
        endTime: event?.endTime ?? "",
        label: event?.label ?? "",
        location: event?.location ?? "",
        focus: event?.focus ?? "",
        linkedTrainingSessionId: event?.linkedTrainingSessionId ?? "",
        squadId: event?.squadId ?? activeTeam?.id ?? "",
        generalNotes: event?.generalNotes ?? "",
        repeatMode: "none",
        repeatIntervalWeeks: "1",
        repeatWeekdays: event?.date ? [String(weekdayForDate(event.date))] : [],
        repeatEndMode: "date",
        repeatEndDate: "",
        repeatOccurrenceCount: "10",
        planApplyMode: "none",
        editScope: "single"
      },
    [activeTeam?.id, event, state.values]
  );
  const errors = state.fieldErrors ?? {};
  const [dateValue, setDateValue] = useState(values.date);
  const [startTimeValue, setStartTimeValue] = useState(values.startTime);
  const [endTimeValue, setEndTimeValue] = useState(values.endTime);
  const [repeatMode, setRepeatMode] = useState(values.repeatMode || "none");
  const [repeatIntervalWeeks, setRepeatIntervalWeeks] = useState(values.repeatIntervalWeeks || "1");
  const [repeatEndMode, setRepeatEndMode] = useState(values.repeatEndMode || "date");
  const [repeatEndDate, setRepeatEndDate] = useState(values.repeatEndDate || "");
  const [repeatOccurrenceCount, setRepeatOccurrenceCount] = useState(values.repeatOccurrenceCount || "10");
  const [repeatWeekdays, setRepeatWeekdays] = useState<Set<string>>(
    () => new Set(values.repeatWeekdays?.length ? values.repeatWeekdays : values.date ? [String(weekdayForDate(values.date))] : [])
  );
  const recurrencePreview = recurrenceSummary(
    {
      startDate: dateValue,
      intervalWeeks: repeatMode === "two_weeks" ? 2 : Math.max(1, Number.parseInt(repeatIntervalWeeks, 10) || 1),
      weekdays: Array.from(repeatWeekdays).map((day) => Number.parseInt(day, 10)),
      endMode: repeatEndMode === "occurrence_count" ? "occurrence_count" : "date",
      endDate: repeatEndDate,
      occurrenceCount: Number.parseInt(repeatOccurrenceCount, 10) || 0
    },
    endTimeValue ? `${startTimeValue}-${endTimeValue}` : startTimeValue
  );

  return (
    <div className="space-y-6">
      <form action={formAction} noValidate className="space-y-6">
        {event ? <input type="hidden" name="eventId" value={event.id} /> : null}
        {state.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {state.error}
          </div>
        ) : null}

        <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">Training appointment</h2>
          <p className="mt-1 text-sm text-slate-500">Create the real training first. You can link a prepared training plan if you already made one.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextInput name="date" label="Date" type="date" required defaultValue={values.date} error={errors.date} onChange={(value) => {
              setDateValue(value);
              if (!repeatWeekdays.size && value) setRepeatWeekdays(new Set([String(weekdayForDate(value))]));
            }} />
            <TextInput name="startTime" label="Start time" type="time" required defaultValue={values.startTime} error={errors.startTime} onChange={setStartTimeValue} />
            <TextInput name="endTime" label="End time" type="time" defaultValue={values.endTime} onChange={setEndTimeValue} />
            <TextInput name="label" label="Title / label" defaultValue={values.label} error={errors.label} placeholder="e.g. Tuesday U11 training" />
            <TextInput name="location" label="Location" defaultValue={values.location} placeholder="e.g. Main pitch" />
            <TextInput name="focus" label="Focus" defaultValue={values.focus} placeholder="e.g. Offensive 1v1" />
            <input type="hidden" name="squadId" value={values.squadId} />
            <div className="rounded-md border border-board-line bg-board-paper px-3 py-2 md:col-span-2">
              <p className="text-sm font-medium text-slate-700">Team</p>
              <p className="mt-1 text-base font-bold text-board-navy">{assignedTeam?.name ?? "Active Team"}</p>
              <p className="mt-1 text-xs text-slate-500">Trainings automatically use the active Team roster. Participants below are saved as a training snapshot.</p>
            </div>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Training plan</span>
              <select name="linkedTrainingSessionId" defaultValue={values.linkedTrainingSessionId} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                <option value="">No linked plan</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex flex-wrap gap-2">
                <ButtonLink href="/sessions/new" variant="ghost" className="h-8 px-2 text-xs">Create new training plan</ButtonLink>
                <ButtonLink href="/sessions" variant="ghost" className="h-8 px-2 text-xs">Open training plans</ButtonLink>
              </div>
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-slate-700">General notes</span>
              <textarea name="generalNotes" defaultValue={values.generalNotes} rows={4} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </label>
          </div>
        </section>

        <ParticipantSelector participants={participants} selected={selectedParticipants} />

        <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">Repeat</h2>
          <p className="mt-1 text-sm text-slate-500">Create one Training or generate concrete future Training Sessions from a recurring series.</p>
          {event?.recurrenceSeriesId ? (
            <div className="mt-4 rounded-md border border-board-line bg-board-paper p-3">
              <p className="text-sm font-bold text-board-navy">Recurring Training</p>
              <p className="mt-1 text-xs text-slate-500">Choose whether edits apply only to this Session or also to following connected Sessions.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="rounded-md border border-board-line bg-white p-3 text-sm font-semibold text-board-navy">
                  <input type="radio" name="editScope" value="single" defaultChecked className="mr-2" />
                  This Session only
                </label>
                <label className="rounded-md border border-board-line bg-white p-3 text-sm font-semibold text-board-navy">
                  <input type="radio" name="editScope" value="future" className="mr-2" />
                  This and following Sessions
                </label>
              </div>
            </div>
          ) : null}
          {mode === "create" ? (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Repeat</span>
                <select name="repeatMode" value={repeatMode} onChange={(event) => setRepeatMode(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                  <option value="none">Does not repeat</option>
                  <option value="weekly">Every week</option>
                  <option value="two_weeks">Every 2 weeks</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {repeatMode !== "none" ? (
                <>
                  {repeatMode === "custom" ? (
                    <TextInput name="repeatIntervalWeeks" label="Repeat every weeks" type="number" defaultValue={repeatIntervalWeeks} error={errors.repeatIntervalWeeks} onChange={setRepeatIntervalWeeks} />
                  ) : (
                    <input type="hidden" name="repeatIntervalWeeks" value={repeatMode === "two_weeks" ? "2" : "1"} />
                  )}
                  <fieldset>
                    <legend className="text-sm font-medium text-slate-700">On</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
                      {weekdayOptions.map((day) => (
                        <label key={day.value} className="flex items-center gap-2 rounded-md border border-board-line px-3 py-2 text-sm font-semibold text-board-navy">
                          <input
                            type="checkbox"
                            name="repeatWeekdays"
                            value={day.value}
                            checked={repeatWeekdays.has(day.value)}
                            onChange={(event) => {
                              const next = new Set(repeatWeekdays);
                              if (event.target.checked) next.add(day.value);
                              else next.delete(day.value);
                              setRepeatWeekdays(next);
                            }}
                          />
                          {day.short}
                        </label>
                      ))}
                    </div>
                    {errors.repeatWeekdays ? <p className="mt-1 text-sm font-medium text-red-700">{errors.repeatWeekdays}</p> : null}
                  </fieldset>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Ends</span>
                      <select name="repeatEndMode" value={repeatEndMode} onChange={(event) => setRepeatEndMode(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                        <option value="date">On date</option>
                        <option value="occurrence_count">After number of Sessions</option>
                      </select>
                    </label>
                    {repeatEndMode === "date" ? (
                      <TextInput name="repeatEndDate" label="End date" type="date" defaultValue={repeatEndDate} error={errors.repeatEndDate} onChange={setRepeatEndDate} />
                    ) : (
                      <TextInput name="repeatOccurrenceCount" label="Number of Sessions" type="number" defaultValue={repeatOccurrenceCount} error={errors.repeatOccurrenceCount} onChange={setRepeatOccurrenceCount} />
                    )}
                  </div>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Training plan for series</span>
                    <select name="planApplyMode" defaultValue="none" className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                      <option value="none">No Training Plan yet</option>
                      <option value="first">Use selected Plan for first Session only</option>
                      <option value="all">Use selected Plan for all generated Sessions</option>
                    </select>
                  </label>
                  <p className="rounded-md border border-board-line bg-board-paper p-3 text-sm font-semibold text-slate-700">{recurrencePreview}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <ButtonLink href="/trainings" variant="secondary" className="justify-center">Cancel</ButtonLink>
          <Button type="submit" disabled={isPending} className="justify-center">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {mode === "edit" ? "Save training" : "Create training"}
          </Button>
        </div>
      </form>
    </div>
  );
}

const weekdayOptions = [
  { value: "1", short: "Mon" },
  { value: "2", short: "Tue" },
  { value: "3", short: "Wed" },
  { value: "4", short: "Thu" },
  { value: "5", short: "Fri" },
  { value: "6", short: "Sat" },
  { value: "7", short: "Sun" }
];

function ParticipantSelector({ participants, selected, compact = false }: { participants: SquadPlayer[]; selected: Set<string>; compact?: boolean }) {
  const rosterCount = participants.filter((player) => player.playerType === "roster").length;
  const trialCount = participants.filter((player) => player.playerType === "trial").length;
  return (
    <section className={compact ? "mt-4 rounded-lg border border-board-line bg-board-paper p-4" : "rounded-lg border border-board-line bg-white p-5 shadow-soft"}>
      <h2 className="text-lg font-bold text-board-navy">Participants</h2>
      <p className="mt-1 text-sm text-slate-500">
        Active Team players are selected by default. Add or remove players for this training only. {trialCount ? `${trialCount} trial player${trialCount === 1 ? "" : "s"} available.` : ""}
      </p>
      {participants.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((player) => (
            <label key={player.id} className="flex items-center gap-3 rounded-md border border-board-line bg-white px-3 py-2 text-sm font-semibold text-board-navy">
              <input name="participantIds" type="checkbox" value={player.id} defaultChecked={selected.has(player.id)} className="h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" />
              <span className="min-w-0 flex-1 truncate">
                {[player.firstName, player.lastName].filter(Boolean).join(" ")}
                {player.position ? <span className="font-medium text-slate-500"> · {player.position}</span> : null}
              </span>
              {player.playerType === "trial" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Trial</span> : null}
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No active players yet. Add players to this Team first, then come back to create attendance rows.</p>
      )}
      <p className="mt-3 text-xs font-semibold text-slate-500">{rosterCount} roster · {trialCount} trial</p>
    </section>
  );
}

function RequiredMark() {
  return <span className="ml-1 text-red-600">*</span>;
}

function TextInput({ name, label, type = "text", required, defaultValue, error, placeholder, onChange }: { name: string; label: string; type?: string; required?: boolean; defaultValue: string; error?: string; placeholder?: string; onChange?: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"}`}
      />
      {error ? <p className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}
    </label>
  );
}
