"use client";

import { useActionState, useMemo } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createTrainingEvent, type TrainingEventActionState } from "@/lib/squad/attendance-actions";

type TrainingEventFormProps = {
  sessions: Array<{ id: string; title: string }>;
};

const initialState: TrainingEventActionState = {};

export function TrainingEventForm({ sessions }: TrainingEventFormProps) {
  const [state, formAction, isPending] = useActionState(createTrainingEvent, initialState);
  const values = useMemo(
    () =>
      state.values ?? {
        date: "",
        startTime: "",
        endTime: "",
        label: "",
        linkedTrainingSessionId: "",
        generalNotes: ""
      },
    [state.values]
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-6">
      {state.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      ) : null}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Training appointment</h2>
        <p className="mt-1 text-sm text-slate-500">Create the real event first. You can link a prepared session plan if you already made one.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput name="date" label="Date" type="date" required defaultValue={values.date} error={errors.date} />
          <TextInput name="startTime" label="Start time" type="time" required defaultValue={values.startTime} error={errors.startTime} />
          <TextInput name="endTime" label="End time" type="time" defaultValue={values.endTime} />
          <TextInput name="label" label="Label" defaultValue={values.label} error={errors.label} placeholder="e.g. Tuesday U11 training" />
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-700">Linked CoachBoard session plan</span>
            <select name="linkedTrainingSessionId" defaultValue={values.linkedTrainingSessionId} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
              <option value="">No linked plan</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-700">General notes</span>
            <textarea name="generalNotes" defaultValue={values.generalNotes} rows={4} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href="/squad/attendance" variant="secondary" className="justify-center">Cancel</ButtonLink>
        <Button type="submit" disabled={isPending} className="justify-center">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
          Create event
        </Button>
      </div>
    </form>
  );
}

function RequiredMark() {
  return <span className="ml-1 text-red-600">*</span>;
}

function TextInput({ name, label, type = "text", required, defaultValue, error, placeholder }: { name: string; label: string; type?: string; required?: boolean; defaultValue: string; error?: string; placeholder?: string }) {
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
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"}`}
      />
      {error ? <p className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}
    </label>
  );
}
