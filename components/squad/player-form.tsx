"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { createSquadPlayer, updateSquadPlayer, SquadPlayerActionState } from "@/lib/squad/actions";
import type { SquadPlayerFormField, SquadPlayerFormValues } from "@/lib/squad/form";
import type { SquadPlayer } from "@/types/domain";

type PlayerFormProps = {
  action: typeof createSquadPlayer | typeof updateSquadPlayer;
  mode: "create" | "edit";
  player?: SquadPlayer;
  trainingDates?: string[];
};

const initialActionState: SquadPlayerActionState = {};

export function PlayerForm({ action, mode, player, trainingDates = [] }: PlayerFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  const values = useMemo(() => state.values ?? getInitialValues(player), [player, state.values]);
  const fieldErrors = state.fieldErrors ?? {};
  const [playerType, setPlayerType] = useState(values.playerType || "roster");
  const [trialMode, setTrialMode] = useState(values.trialDurationMode || "training_count");
  const [trialStartDate, setTrialStartDate] = useState(values.trialStartDate);
  const [trialTrainingLimit, setTrialTrainingLimit] = useState(values.trialTrainingLimit);
  const [trialEndDate, setTrialEndDate] = useState(values.trialEndDate);
  const trialSummary = useMemo(
    () => calculateTrialSummary({ trainingDates, trialStartDate, trialTrainingLimit, trialEndDate, trialMode }),
    [trainingDates, trialEndDate, trialMode, trialStartDate, trialTrainingLimit]
  );

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
          <TextInput name="originalClub" label="Original imported club" defaultValue={values.originalClub} error={fieldErrors.originalClub} />
          <TextInput name="externalPlayerId" label="External player ID" defaultValue={values.externalPlayerId} error={fieldErrors.externalPlayerId} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Player type</span>
            <select
              name="playerType"
              value={playerType}
              onChange={(event) => setPlayerType(event.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            >
              <option value="roster">Permanent squad player</option>
              <option value="trial">Trial player</option>
            </select>
          </label>
          <TextInput name="preferredPositions" label="Player-preferred positions" defaultValue={values.preferredPositions} error={fieldErrors.preferredPositions} />
          <TextInput name="originalPreferredPositions" label="Original preferred positions" defaultValue={values.originalPreferredPositions} error={fieldErrors.originalPreferredPositions} />
          <TextInput name="originalStrongFoot" label="Original dominant foot" defaultValue={values.originalStrongFoot} error={fieldErrors.originalStrongFoot} />
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

      {playerType === "trial" ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-5 shadow-soft">
          <h2 className="text-lg font-bold text-board-navy">Trial period</h2>
          <p className="mt-1 text-sm text-amber-800">Track how long this player should stay in trial status before a decision.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextInput
              name="trialStartDate"
              label="Trial start date"
              type="date"
              defaultValue={values.trialStartDate}
              error={fieldErrors.trialStartDate}
              onChange={setTrialStartDate}
            />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Trial duration</span>
              <select
                name="trialDurationMode"
                value={trialMode}
                onChange={(event) => setTrialMode(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
              >
                <option value="training_count">Number of trainings</option>
                <option value="end_date">Until date</option>
              </select>
            </label>
            {trialMode === "training_count" ? (
              <TextInput
                name="trialTrainingLimit"
                label="Training limit"
                type="number"
                defaultValue={values.trialTrainingLimit}
                error={fieldErrors.trialTrainingLimit}
                onChange={setTrialTrainingLimit}
              />
            ) : (
              <TextInput
                name="trialEndDate"
                label="Trial end date"
                type="date"
                defaultValue={values.trialEndDate}
                error={fieldErrors.trialEndDate}
                onChange={setTrialEndDate}
              />
            )}
          </div>
          <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
            {trialSummary}
          </p>
        </section>
      ) : (
        <>
          <input type="hidden" name="trialStartDate" value="" />
          <input type="hidden" name="trialDurationMode" value="" />
          <input type="hidden" name="trialTrainingLimit" value="" />
          <input type="hidden" name="trialEndDate" value="" />
        </>
      )}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Contact</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput name="playerPhone" label="Player phone" defaultValue={values.playerPhone} error={fieldErrors.playerPhone} />
          <TextInput name="playerEmail" label="Player email" type="email" defaultValue={values.playerEmail} error={fieldErrors.playerEmail} />
          <TextInput name="parentGuardianName" label="Parent / guardian name" defaultValue={values.parentGuardianName} error={fieldErrors.parentGuardianName} />
          <TextInput name="parentPhone" label="Parent phone" defaultValue={values.parentPhone} error={fieldErrors.parentPhone} />
          <TextInput name="parentEmail" label="Parent email" type="email" defaultValue={values.parentEmail} error={fieldErrors.parentEmail} />
          <TextInput name="emergencyContactName" label="Emergency contact name" defaultValue={values.emergencyContactName} error={fieldErrors.emergencyContactName} />
          <TextInput name="emergencyContactPhone" label="Emergency contact phone" defaultValue={values.emergencyContactPhone} error={fieldErrors.emergencyContactPhone} />
          <TextInput name="emergencyContactRelationship" label="Emergency relationship" defaultValue={values.emergencyContactRelationship} error={fieldErrors.emergencyContactRelationship} />
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Equipment</h2>
        <p className="mt-1 text-sm text-slate-500">Sizes are stored as text, so values like 152, 164, S, M or L all work.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <TextInput name="topSize" label="Top / shirt size" defaultValue={values.topSize} error={fieldErrors.topSize} />
          <TextInput name="jacketSize" label="Jacket size" defaultValue={values.jacketSize} error={fieldErrors.jacketSize} />
          <TextInput name="trouserSize" label="Trouser size" defaultValue={values.trouserSize} error={fieldErrors.trouserSize} />
          <TextInput name="shoeSize" label="Shoe size" defaultValue={values.shoeSize} error={fieldErrors.shoeSize} />
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Football profile</h2>
        <div className="mt-4 grid gap-4">
          <TextArea name="clubTrainingSchedule" label="Club training schedule" defaultValue={values.clubTrainingSchedule} error={fieldErrors.clubTrainingSchedule} />
          <TextArea name="developmentGoal" label="Development goal" defaultValue={values.developmentGoal} error={fieldErrors.developmentGoal} />
          <TextArea name="workOn" label="Work on" defaultValue={values.workOn} error={fieldErrors.workOn} />
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Player voice</h2>
        <p className="mt-1 text-sm text-slate-500">Answers from onboarding questionnaires stay separate from coach assessment.</p>
        <div className="mt-4 grid gap-4">
          <TextArea name="hobbies" label="Hobbies and interests" defaultValue={values.hobbies} error={fieldErrors.hobbies} />
          <TextArea name="coachExpectations" label="Expectations and wishes for coaching/training" defaultValue={values.coachExpectations} error={fieldErrors.coachExpectations} />
          <TextArea name="onboardingComments" label="Additional player-provided comments" defaultValue={values.onboardingComments} error={fieldErrors.onboardingComments} />
          <TextArea name="notes" label="Coach notes" defaultValue={values.notes} error={fieldErrors.notes} />
        </div>
      </section>

      <input type="hidden" name="recommendedPlayerName" value={values.recommendedPlayerName} />
      <input type="hidden" name="recommendedPlayerBirthYear" value={values.recommendedPlayerBirthYear} />
      <input type="hidden" name="recommendedPlayerPosition" value={values.recommendedPlayerPosition} />
      <input type="hidden" name="recommendedPlayerClub" value={values.recommendedPlayerClub} />
      <input type="hidden" name="recommendedPlayersRaw" value={values.recommendedPlayersRaw} />

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Onboarding source</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <TextInput name="onboardingSource" label="Source" defaultValue={values.onboardingSource} error={fieldErrors.onboardingSource} />
          <TextInput name="onboardingSubmittedAt" label="Submitted at" type="datetime-local" defaultValue={values.onboardingSubmittedAt} error={fieldErrors.onboardingSubmittedAt} />
          <TextInput name="onboardingImportBatch" label="Import batch" defaultValue={values.onboardingImportBatch} error={fieldErrors.onboardingImportBatch} />
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
    originalClub: player?.originalClub ?? "",
    clubTrainingSchedule: player?.clubTrainingSchedule ?? "",
    externalPlayerId: player?.externalPlayerId ?? "",
    playerType: player?.playerType ?? "roster",
    trialStartDate: player?.trialStartDate ?? "",
    trialDurationMode: player?.trialDurationMode ?? "training_count",
    trialTrainingLimit: player?.trialTrainingLimit ? String(player.trialTrainingLimit) : "",
    trialEndDate: player?.trialEndDate ?? "",
    playerEmail: player?.playerEmail ?? "",
    parentGuardianName: player?.parentGuardianName ?? "",
    parentPhone: player?.parentPhone ?? "",
    playerPhone: player?.playerPhone ?? "",
    parentEmail: player?.parentEmail ?? "",
    emergencyContactName: player?.emergencyContactName ?? "",
    emergencyContactPhone: player?.emergencyContactPhone ?? "",
    emergencyContactRelationship: player?.emergencyContactRelationship ?? "",
    topSize: player?.topSize ?? "",
    jacketSize: player?.jacketSize ?? "",
    trouserSize: player?.trouserSize ?? "",
    shoeSize: player?.shoeSize ?? "",
    preferredPositions: player?.preferredPositions.join(", ") ?? "",
    originalPreferredPositions: player?.originalPreferredPositions ?? "",
    originalStrongFoot: player?.originalStrongFoot ?? "",
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
    coachExpectations: player?.coachExpectations ?? "",
    onboardingComments: player?.onboardingComments ?? "",
    recommendedPlayersRaw: player?.recommendedPlayersRaw ?? "",
    recommendedPlayerName: player?.recommendedPlayerName ?? "",
    recommendedPlayerBirthYear: player?.recommendedPlayerBirthYear ?? "",
    recommendedPlayerPosition: player?.recommendedPlayerPosition ?? "",
    recommendedPlayerClub: player?.recommendedPlayerClub ?? "",
    onboardingSource: player?.onboardingSource ?? "",
    onboardingSubmittedAt: toDatetimeLocal(player?.onboardingSubmittedAt),
    onboardingImportBatch: player?.onboardingImportBatch ?? "",
    notes: player?.notes ?? ""
  };
}

function toDatetimeLocal(value?: string) {
  if (!value) return "";
  return value.slice(0, 16);
}

function calculateTrialSummary({
  trainingDates,
  trialStartDate,
  trialTrainingLimit,
  trialEndDate,
  trialMode
}: {
  trainingDates: string[];
  trialStartDate: string;
  trialTrainingLimit: string;
  trialEndDate: string;
  trialMode: string;
}) {
  if (!trialStartDate) return "Choose a trial start date to preview the trial period.";
  const futureDates = trainingDates.filter((date) => date >= trialStartDate).sort();
  if (trialMode === "training_count") {
    const limit = Number.parseInt(trialTrainingLimit, 10);
    if (!Number.isFinite(limit) || limit < 1) return "Enter how many trainings the trial should include.";
    const finalTraining = futureDates[limit - 1];
    return finalTraining
      ? `${limit} scheduled training${limit === 1 ? "" : "s"} from ${formatDate(trialStartDate)} to approximately ${formatDate(finalTraining)}.`
      : `${limit} training${limit === 1 ? "" : "s"} selected. Add future trainings to calculate an expected end date.`;
  }
  if (!trialEndDate) return "Choose the trial end date.";
  const count = futureDates.filter((date) => date <= trialEndDate).length;
  return `${count} scheduled training${count === 1 ? "" : "s"} between ${formatDate(trialStartDate)} and ${formatDate(trialEndDate)}.`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
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
  type = "text",
  onChange
}: {
  name: SquadPlayerFormField;
  label: string;
  defaultValue: string;
  error?: string;
  required?: boolean;
  type?: string;
  onChange?: (value: string) => void;
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
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
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
