"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createRecurringTrainingEvents, createTrainingEvent, type TrainingEventActionState } from "@/lib/squad/attendance-actions";
import { generateRecurringTrainingDates } from "@/lib/trainings/utils";

type TrainingEventFormProps = {
  sessions: Array<{ id: string; title: string }>;
};

const initialState: TrainingEventActionState = {};

export function TrainingEventForm({ sessions }: TrainingEventFormProps) {
  const [state, formAction, isPending] = useActionState(createTrainingEvent, initialState);
  const [recurringState, recurringAction, isRecurringPending] = useActionState(createRecurringTrainingEvents, initialState);
  const values = useMemo(
    () =>
      state.values ?? {
        date: "",
        startTime: "",
        endTime: "",
        label: "",
        location: "",
        focus: "",
        linkedTrainingSessionId: "",
        generalNotes: ""
      },
    [state.values]
  );
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-6">
      <form action={formAction} noValidate className="space-y-6">
        {state.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {state.error}
          </div>
        ) : null}

        <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">Training appointment</h2>
          <p className="mt-1 text-sm text-slate-500">Create the real training first. You can link a prepared training plan if you already made one.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextInput name="date" label="Date" type="date" required defaultValue={values.date} error={errors.date} />
            <TextInput name="startTime" label="Start time" type="time" required defaultValue={values.startTime} error={errors.startTime} />
            <TextInput name="endTime" label="End time" type="time" defaultValue={values.endTime} />
            <TextInput name="label" label="Title / label" defaultValue={values.label} error={errors.label} placeholder="e.g. Tuesday U11 training" />
            <TextInput name="location" label="Location" defaultValue={values.location} placeholder="e.g. Main pitch" />
            <TextInput name="focus" label="Focus" defaultValue={values.focus} placeholder="e.g. Offensive 1v1" />
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

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <ButtonLink href="/trainings" variant="secondary" className="justify-center">Cancel</ButtonLink>
          <Button type="submit" disabled={isPending} className="justify-center">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            Create training
          </Button>
        </div>
      </form>
      <RecurringTrainingPanel state={recurringState} action={recurringAction} isPending={isRecurringPending} />
    </div>
  );
}

function RecurringTrainingPanel({ state, action, isPending }: { state: TrainingEventActionState; action: (formData: FormData) => void; isPending: boolean }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [intervalWeeks, setIntervalWeeks] = useState<"1" | "2">("1");
  const preview = generateRecurringTrainingDates({ startDate, endDate, intervalWeeks: intervalWeeks === "2" ? 2 : 1 });

  return (
    <form action={action} noValidate className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-bold text-board-navy">Plan multiple trainings</h2>
      <p className="mt-1 text-sm text-slate-500">Creates independent training dates. Each one can later be edited, checked in, rated, or linked to a plan.</p>
      {state.error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TextInput name="date" label="First date" type="date" required defaultValue={state.values?.date ?? ""} error={state.fieldErrors?.date} onChange={setStartDate} />
        <TextInput name="endDate" label="End date" type="date" required defaultValue="" error={state.fieldErrors?.endDate} onChange={setEndDate} />
        <TextInput name="startTime" label="Start time" type="time" required defaultValue={state.values?.startTime ?? ""} error={state.fieldErrors?.startTime} />
        <TextInput name="endTime" label="End time" type="time" defaultValue={state.values?.endTime ?? ""} />
        <TextInput name="label" label="Title / label" defaultValue={state.values?.label ?? ""} placeholder="e.g. U11 team training" />
        <TextInput name="location" label="Location" defaultValue={state.values?.location ?? ""} placeholder="e.g. Main pitch" />
        <TextInput name="focus" label="Focus" defaultValue={state.values?.focus ?? ""} placeholder="e.g. Finishing" />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Repeat</span>
          <select name="intervalWeeks" value={intervalWeeks} onChange={(event) => setIntervalWeeks(event.target.value as "1" | "2")} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
            <option value="1">Weekly</option>
            <option value="2">Every two weeks</option>
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-sm font-medium text-slate-700">General notes</span>
          <textarea name="generalNotes" defaultValue={state.values?.generalNotes ?? ""} rows={3} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
        </label>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-600">
        {preview.length ? `${preview.length} trainings will be created. ${preview[0]}${preview.length > 1 ? ` to ${preview[preview.length - 1]}` : ""}` : "Choose a first date and end date to preview the series."}
      </p>
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isPending || !preview.length} className="justify-center">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
          Create series
        </Button>
      </div>
    </form>
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
