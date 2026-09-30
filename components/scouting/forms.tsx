"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Locale } from "@/lib/i18n";
import { scoutingActions, scoutingContexts, scoutingCopy, scoutingPriorities, scoutingStatuses, scoutingTargetStatuses } from "@/lib/scouting/copy";
import type { ScoutingFormState } from "@/lib/scouting/actions";
import { canonicalPositionLabels } from "@/lib/squad/positions";
import type { ScoutingObservationRow, ScoutingPlayerRow, ScoutingTargetRow } from "@/types/database";
import type { Squad } from "@/types/domain";

type Action = (state: ScoutingFormState, form: FormData) => Promise<ScoutingFormState>;
const input = "min-h-11 w-full min-w-0 rounded-md border border-board-line bg-white px-3 py-2 text-sm text-board-navy focus:border-board-green focus:outline-none focus:ring-2 focus:ring-board-green/20";
const label = "block min-w-0 text-sm font-semibold text-board-navy";
const field = "grid min-w-0 gap-1";

function Submit({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-board-green px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? "..." : text}</button>;
}

function ErrorMessage({ state, locale }: { state: ScoutingFormState; locale: Locale }) {
  if (!state.error) return null;
  return <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{locale === "de" ? scoutingCopy(locale).saveFailed : state.error}</p>;
}

function Field({ name, text, children }: { name: string; text: string; children: React.ReactNode }) {
  return <label className={field} htmlFor={name}><span>{text}</span>{children}</label>;
}

export function ScoutingPlayerForm({ action, initial, locale }: { action: Action; initial?: ScoutingPlayerRow; locale: Locale }) {
  const [state, formAction] = useActionState(action, {});
  const c = scoutingCopy(locale);
  return <form action={formAction} className="space-y-6">
    <ErrorMessage state={state} locale={locale} />
    {state.duplicates?.length ? <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
      <strong className="text-board-navy">{c.possibleDuplicate}</strong>
      <p className="mt-1 text-slate-700">{c.duplicateHint}</p>
      <ul className="mt-2 list-inside list-disc">
        {state.duplicates.map((item) => <li key={`${item.kind}-${item.id}`}><Link href={item.kind === "scouting" ? `/scouting/players/${item.id}` : `/squad/players/${item.id}`} className="font-bold text-board-green underline">{item.name}</Link></li>)}
      </ul>
      <label className="mt-3 flex items-center gap-2 font-semibold"><input type="checkbox" name="confirmDuplicate" value="yes" required />{c.createAnyway}</label>
    </div> : null}
    <section>
      <h2 className="mb-3 text-lg font-bold text-board-navy">{c.profileOverview}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="firstName" text={c.firstName}><input id="firstName" name="firstName" required maxLength={120} defaultValue={initial?.first_name} className={input} /></Field>
        <Field name="lastName" text={c.lastName}><input id="lastName" name="lastName" maxLength={120} defaultValue={initial?.last_name ?? ""} className={input} /></Field>
        <Field name="birthDate" text={c.birthDate}><input id="birthDate" name="birthDate" type="date" defaultValue={initial?.date_of_birth ?? ""} className={input} /></Field>
        <Field name="currentClub" text={c.club}><input id="currentClub" name="currentClub" defaultValue={initial?.current_club ?? ""} className={input} /></Field>
        <Field name="currentTeam" text={c.team}><input id="currentTeam" name="currentTeam" defaultValue={initial?.current_team ?? ""} className={input} /></Field>
        <Field name="source" text={c.source}><input id="source" name="source" defaultValue={initial?.source ?? ""} className={input} /></Field>
      </div>
    </section>
    <section>
      <h2 className="mb-3 text-lg font-bold text-board-navy">{c.position}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="primaryPosition" text={c.position}><select id="primaryPosition" name="primaryPosition" defaultValue={initial?.primary_position ?? ""} className={input}>
          <option value="">{c.unknown}</option>{Object.entries(canonicalPositionLabels).map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
        </select></Field>
        <Field name="secondaryPositions" text={c.secondaryPositions}><input id="secondaryPositions" name="secondaryPositions" defaultValue={initial?.secondary_positions.join(", ") ?? ""} placeholder="RW, ST" className={input} /></Field>
        <Field name="strongFoot" text={c.foot}><select id="strongFoot" name="strongFoot" defaultValue={initial?.strong_foot ?? ""} className={input}>
          <option value="">{c.unknown}</option>{(["left", "right", "both"] as const).map((value) => <option key={value} value={value}>{c[value]}</option>)}
        </select></Field>
        <Field name="heightCm" text={c.height}><input id="heightCm" name="heightCm" type="number" min="0" max="300" step="0.1" defaultValue={initial?.height_cm ?? ""} className={input} /></Field>
        <Field name="weightKg" text={c.weight}><input id="weightKg" name="weightKg" type="number" min="0" max="500" step="0.1" defaultValue={initial?.weight_kg ?? ""} className={input} /></Field>
      </div>
    </section>
    <section>
      <h2 className="mb-3 text-lg font-bold text-board-navy">{c.status}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="status" text={c.status}><select id="status" name="status" defaultValue={initial?.status ?? "identified"} className={input}>
          {scoutingStatuses.filter((value) => value !== "added_to_squad" || initial?.linked_squad_player_id).map((value) => <option key={value} value={value}>{c[value]}</option>)}
        </select></Field>
        <Field name="priority" text={c.priority}><select id="priority" name="priority" defaultValue={initial?.priority ?? "medium"} className={input}>
          {scoutingPriorities.map((value) => <option key={value} value={value}>{c[value]}</option>)}
        </select></Field>
        <Field name="nextAction" text={c.nextAction}><select id="nextAction" name="nextAction" defaultValue={initial?.next_action ?? ""} className={input}>
          <option value="">{c.none}</option>{scoutingActions.map((value) => <option key={value} value={value}>{c[value === "none" ? "no_action" : value]}</option>)}
        </select></Field>
        <Field name="nextActionDate" text={c.nextActionDate}><input id="nextActionDate" name="nextActionDate" type="date" defaultValue={initial?.next_action_date ?? ""} className={input} /></Field>
      </div>
      <label className={`${label} mt-4`} htmlFor="notes">{c.notes}</label>
      <textarea id="notes" name="notes" rows={4} defaultValue={initial?.notes ?? ""} className={input} />
    </section>
    <div className="flex flex-wrap gap-2"><Submit text={c.save} /><Link href={initial ? `/scouting/players/${initial.id}` : "/scouting/players"} className="inline-flex min-h-11 items-center px-4 text-sm font-bold text-slate-600">{c.cancel}</Link></div>
  </form>;
}

export function ScoutingObservationForm({ action, playerId, initial, locale }: { action: Action; playerId: string; initial?: ScoutingObservationRow; locale: Locale }) {
  const [state, formAction] = useActionState(action, {});
  const c = scoutingCopy(locale);
  return <form action={formAction} className="space-y-5">
    <ErrorMessage state={state} locale={locale} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="observedOn" text={c.observedOn}><input id="observedOn" name="observedOn" type="date" required defaultValue={initial?.observed_on ?? new Date().toISOString().slice(0, 10)} className={input} /></Field>
      <Field name="context" text={c.context}><select id="context" name="context" defaultValue={initial?.context ?? "match"} className={input}>
        {scoutingContexts.map((value) => <option key={value} value={value}>{c[value]}</option>)}
      </select></Field>
      <Field name="observedPosition" text={c.observedPosition}><input id="observedPosition" name="observedPosition" defaultValue={initial?.observed_position ?? ""} className={input} /></Field>
      <Field name="eventLabel" text={c.event}><input id="eventLabel" name="eventLabel" defaultValue={initial?.event_label ?? ""} className={input} /></Field>
      <Field name="minutesObserved" text={c.minutes}><input id="minutesObserved" name="minutesObserved" type="number" min="0" max="300" step="1" defaultValue={initial?.minutes_observed ?? ""} className={input} /></Field>
      <Field name="observer" text={c.observer}><input id="observer" name="observer" defaultValue={initial?.observer ?? ""} className={input} /></Field>
    </div>
    <Field name="summary" text={c.summary}><textarea id="summary" name="summary" rows={3} required maxLength={4000} defaultValue={initial?.summary ?? ""} className={input} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="strengths" text={c.strengths}><textarea id="strengths" name="strengths" rows={3} defaultValue={initial?.strengths ?? ""} className={input} /></Field>
      <Field name="development" text={c.development}><textarea id="development" name="development" rows={3} defaultValue={initial?.development_considerations ?? ""} className={input} /></Field>
    </div>
    <Field name="nextAction" text={c.nextAction}><input id="nextAction" name="nextAction" defaultValue={initial?.next_action ?? ""} className={input} /></Field>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {([
        ["ratingTechnical", c.technical, initial?.rating_technical],
        ["ratingTactical", c.tactical, initial?.rating_tactical],
        ["ratingPhysical", c.physical, initial?.rating_physical],
        ["ratingMental", c.mental, initial?.rating_mental]
      ] as const).map(([name, text, value]) => <Field key={name} name={name} text={text}><select id={name} name={name} defaultValue={value ?? ""} className={input}>
        <option value="">{c.unknown}</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
      </select></Field>)}
    </div>
    <div className="flex flex-wrap gap-2"><Submit text={c.save} /><Link href={`/scouting/players/${playerId}?tab=observations`} className="inline-flex min-h-11 items-center px-4 text-sm font-bold text-slate-600">{c.cancel}</Link></div>
  </form>;
}

export function ScoutingTargetForm({ action, teams, initial, locale }: { action: Action; teams: Squad[]; initial?: ScoutingTargetRow; locale: Locale }) {
  const [state, formAction] = useActionState(action, {});
  const c = scoutingCopy(locale);
  return <form action={formAction} className="space-y-5">
    <ErrorMessage state={state} locale={locale} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="title" text={c.title}><input id="title" name="title" required maxLength={160} defaultValue={initial?.title} className={input} /></Field>
      <Field name="squadId" text={c.targetTeam}><select id="squadId" name="squadId" defaultValue={initial?.squad_id ?? ""} className={input}>
        <option value="">{c.none}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select></Field>
      <Field name="priority" text={c.priority}><select id="priority" name="priority" defaultValue={initial?.priority ?? "medium"} className={input}>
        {scoutingPriorities.map((value) => <option key={value} value={value}>{c[value]}</option>)}
      </select></Field>
      <Field name="status" text={c.status}><select id="status" name="status" defaultValue={initial?.status ?? "active"} className={input}>
        {scoutingTargetStatuses.map((value) => <option key={value} value={value}>{c[value]}</option>)}
      </select></Field>
      <Field name="positions" text={c.positions}><input id="positions" name="positions" defaultValue={initial?.positions.join(", ") ?? ""} placeholder="CB, LB" className={input} /></Field>
      <Field name="preferredFoot" text={c.foot}><select id="preferredFoot" name="preferredFoot" defaultValue={initial?.preferred_foot ?? ""} className={input}>
        <option value="">{c.none}</option>{(["left", "right", "both"] as const).map((value) => <option key={value} value={value}>{c[value]}</option>)}
      </select></Field>
      <Field name="birthYearFrom" text={c.fromYear}><input id="birthYearFrom" name="birthYearFrom" type="number" min="1900" max="2100" step="1" defaultValue={initial?.birth_year_from ?? ""} className={input} /></Field>
      <Field name="birthYearTo" text={c.toYear}><input id="birthYearTo" name="birthYearTo" type="number" min="1900" max="2100" step="1" defaultValue={initial?.birth_year_to ?? ""} className={input} /></Field>
      <Field name="targetNumber" text={c.targetNumber}><input id="targetNumber" name="targetNumber" type="number" min="1" max="100" step="1" defaultValue={initial?.target_number ?? ""} className={input} /></Field>
      <Field name="deadline" text={c.deadline}><input id="deadline" name="deadline" type="date" defaultValue={initial?.deadline ?? ""} className={input} /></Field>
    </div>
    <Field name="desiredProfile" text={c.desiredProfile}><textarea id="desiredProfile" name="desiredProfile" rows={5} defaultValue={initial?.desired_profile ?? ""} className={input} /></Field>
    <Field name="notes" text={c.notes}><textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} className={input} /></Field>
    <div className="flex flex-wrap gap-2"><Submit text={c.save} /><Link href={initial ? `/scouting/targets/${initial.id}` : "/scouting/targets"} className="inline-flex min-h-11 items-center px-4 text-sm font-bold text-slate-600">{c.cancel}</Link></div>
  </form>;
}

export function TrialInviteForm({ action, teams, locale }: { action: Action; teams: Squad[]; locale: Locale }) {
  const [state, formAction] = useActionState(action, {});
  const c = scoutingCopy(locale);
  return <form action={formAction} className="grid gap-3 rounded-md border border-board-line p-4 sm:grid-cols-2">
    <ErrorMessage state={state} locale={locale} />
    <Field name="squadId" text={c.targetTeam}><select id="squadId" name="squadId" required className={input}>
      <option value="">{c.missingTeam}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
    </select></Field>
    <Field name="startDate" text={c.trialStart}><input id="startDate" name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={input} /></Field>
    <Field name="durationMode" text={c.trialDuration}><select id="durationMode" name="durationMode" defaultValue="training_count" className={input}>
      <option value="training_count">{c.trialTrainings}</option><option value="end_date">{c.trialUntil}</option>
    </select></Field>
    <Field name="trainingLimit" text={c.trainingCount}><input id="trainingLimit" name="trainingLimit" type="number" min="1" max="100" defaultValue="3" className={input} /></Field>
    <Field name="endDate" text={c.endDate}><input id="endDate" name="endDate" type="date" className={input} /></Field>
    <div className="self-end"><Submit text={c.inviteTrial} /></div>
  </form>;
}
