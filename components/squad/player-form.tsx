"use client";

import { useActionState, useMemo } from "react";
import { Loader2, Save } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { createSquadPlayer, updateSquadPlayer, SquadPlayerActionState } from "@/lib/squad/actions";
import type { SquadPlayerFormField, SquadPlayerFormValues } from "@/lib/squad/form";
import type { SquadPlayer } from "@/types/domain";

type PlayerFormProps = {
  action: typeof createSquadPlayer | typeof updateSquadPlayer;
  mode: "create" | "edit";
  player?: SquadPlayer;
};

const initialActionState: SquadPlayerActionState = {};

export function PlayerForm({ action, mode, player }: PlayerFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  const values = useMemo(() => state.values ?? getInitialValues(player), [player, state.values]);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-6">
      {player ? <input type="hidden" name="playerId" value={player.id} /> : null}

      {state.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      ) : null}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Player details</h2>
        <p className="mt-1 text-sm text-slate-500">Start with the essentials. Attendance and ratings will build on this profile later.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput name="firstName" label="First name" required defaultValue={values.firstName} error={fieldErrors.firstName} />
          <TextInput name="lastName" label="Last name" defaultValue={values.lastName} error={fieldErrors.lastName} />
          <TextInput name="dateOfBirth" label="Date of birth" type="date" defaultValue={values.dateOfBirth} error={fieldErrors.dateOfBirth} />
          <TextInput name="position" label="Position" defaultValue={values.position} error={fieldErrors.position} />
          <TextInput name="secondaryPositions" label="Secondary positions" defaultValue={values.secondaryPositions} error={fieldErrors.secondaryPositions} />
          <SelectInput
            name="strongFoot"
            label="Strong foot"
            defaultValue={values.strongFoot}
            options={["", "Right", "Left", "Both"]}
            error={fieldErrors.strongFoot}
          />
          <TextInput name="club" label="Club" defaultValue={values.club} error={fieldErrors.club} />
          <TextInput name="jerseyNumber" label="Jersey number" defaultValue={values.jerseyNumber} error={fieldErrors.jerseyNumber} />
          <TextInput name="heightCm" label="Height (cm)" type="number" defaultValue={values.heightCm} error={fieldErrors.heightCm} />
          <TextInput name="weightKg" label="Weight (kg)" type="number" defaultValue={values.weightKg} error={fieldErrors.weightKg} />
          <SelectInput
            name="captainStatus"
            label="Captain status"
            defaultValue={values.captainStatus}
            options={["none", "captain", "vice_captain"]}
            error={fieldErrors.captainStatus}
          />
          <TextInput name="joinedDate" label="Joined date" type="date" defaultValue={values.joinedDate} error={fieldErrors.joinedDate} />
        </div>
        <p className="mt-3 text-xs text-slate-500">Separate secondary positions with commas, for example DM, AM. Optional fields are hidden in the Player Hub header unless enabled.</p>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Contact</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput name="playerPhone" label="Player phone" defaultValue={values.playerPhone} error={fieldErrors.playerPhone} />
          <TextInput name="playerEmail" label="Player email" type="email" defaultValue={values.playerEmail} error={fieldErrors.playerEmail} />
          <TextInput name="parentPhone" label="Parent phone" defaultValue={values.parentPhone} error={fieldErrors.parentPhone} />
          <TextInput name="parentEmail" label="Parent email" type="email" defaultValue={values.parentEmail} error={fieldErrors.parentEmail} />
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Development notes</h2>
        <div className="mt-4 grid gap-4">
          <TextArea name="developmentGoal" label="Development goal" defaultValue={values.developmentGoal} error={fieldErrors.developmentGoal} />
          <TextArea name="workOn" label="Work on" defaultValue={values.workOn} error={fieldErrors.workOn} />
          <TextArea name="hobbies" label="Hobbies / personality notes" defaultValue={values.hobbies} error={fieldErrors.hobbies} />
          <TextArea name="notes" label="Coach notes" defaultValue={values.notes} error={fieldErrors.notes} />
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Medical notes</h2>
        <p className="mt-1 text-sm text-slate-500">Private medical background stays inside the Player Hub and is not shown in general squad overviews.</p>
        <div className="mt-4 grid gap-4">
          <TextArea name="allergies" label="Allergies" defaultValue={values.allergies} error={fieldErrors.allergies} />
          <TextArea name="medication" label="Medication" defaultValue={values.medication} error={fieldErrors.medication} />
          <TextArea name="medicalNotes" label="Medical notes" defaultValue={values.medicalNotes} error={fieldErrors.medicalNotes} />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href={player ? `/squad/players/${player.id}` : "/squad"} variant="secondary" className="justify-center">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={isPending} className="justify-center">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "Create player" : "Save player"}
        </Button>
      </div>
    </form>
  );
}

function getInitialValues(player?: SquadPlayer): SquadPlayerFormValues {
  return {
    firstName: player?.firstName ?? "",
    lastName: player?.lastName ?? "",
    dateOfBirth: player?.dateOfBirth ?? "",
    position: player?.position ?? "",
    secondaryPositions: player?.secondaryPositions.join(", ") ?? "",
    strongFoot: player?.strongFoot ?? "",
    club: player?.club ?? "",
    playerEmail: player?.playerEmail ?? "",
    parentPhone: player?.parentPhone ?? "",
    playerPhone: player?.playerPhone ?? "",
    parentEmail: player?.parentEmail ?? "",
    heightCm: player?.heightCm ? String(player.heightCm) : "",
    weightKg: player?.weightKg ? String(player.weightKg) : "",
    jerseyNumber: player?.jerseyNumber ?? "",
    captainStatus: player?.captainStatus ?? "none",
    joinedDate: player?.joinedDate ?? "",
    allergies: player?.allergies ?? "",
    medication: player?.medication ?? "",
    medicalNotes: player?.medicalNotes ?? "",
    hobbies: player?.hobbies ?? "",
    developmentGoal: player?.developmentGoal ?? "",
    workOn: player?.workOn ?? "",
    notes: player?.notes ?? ""
  };
}

function RequiredMark() {
  return <span className="ml-1 text-red-600">*</span>;
}

function FieldError({ error }: { error?: string }) {
  return error ? <p className="mt-1 text-sm font-medium text-red-700">{error}</p> : null;
}

function TextInput({
  name,
  label,
  defaultValue,
  error,
  required = false,
  type = "text"
}: {
  name: SquadPlayerFormField;
  label: string;
  defaultValue: string;
  error?: string;
  required?: boolean;
  type?: string;
}) {
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
        aria-invalid={Boolean(error)}
        className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${
          error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"
        }`}
      />
      <FieldError error={error} />
    </label>
  );
}

function SelectInput({
  name,
  label,
  defaultValue,
  options,
  error
}: {
  name: SquadPlayerFormField;
  label: string;
  defaultValue: string;
  options: string[];
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${
          error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"
        }`}
      >
        {options.map((option) => (
          <option key={option || "empty"} value={option}>
            {option || "Select..."}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </label>
  );
}

function TextArea({ name, label, defaultValue, error }: { name: SquadPlayerFormField; label: string; defaultValue: string; error?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        name={name}
        rows={3}
        defaultValue={defaultValue}
        className={`mt-1 w-full rounded-md border bg-white px-3 py-2 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${
          error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"
        }`}
      />
      <FieldError error={error} />
    </label>
  );
}
