"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, ChevronDown, Loader2, Users } from "lucide-react";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { useSystemText } from "@/components/i18n/use-system-text";
import { Button, ButtonLink } from "@/components/ui/button";
import { createTrainingEvent, updateTrainingEvent, type TrainingEventActionState } from "@/lib/squad/attendance-actions";
import {
  calendarCategoryLabel,
  findCalendarConflicts,
  normalizeCalendarCategory,
  shouldExcludeByDefault,
  summarizeCalendarConflicts,
  type CalendarConflict,
  type CalendarConflictContext
} from "@/lib/squad/regional-calendar";
import { formatPositionLabel } from "@/lib/squad/positions";
import { formatDate, type Locale } from "@/lib/i18n";
import { generateTrainingRecurrenceDates, weekdayForDate } from "@/lib/trainings/utils";
import type { ParticipantSourceMode, Squad, SquadPlayer, SquadTrainingEventDetail } from "@/types/domain";

type Props = {
  sessions: Array<{ id: string; title: string }>;
  squads: Squad[];
  participants: SquadPlayer[];
  event?: SquadTrainingEventDetail;
  mode?: "create" | "edit";
  calendarContext?: CalendarConflictContext;
};

const initialState: TrainingEventActionState = {};

export function TrainingEventForm({ sessions, squads, participants, event, mode = "create", calendarContext }: Props) {
  const locale = useOptionalI18n()?.locale ?? "en";
  const copy = trainingCreationCopy[locale];
  const ui = useSystemText();
  const [state, formAction, isPending] = useActionState(mode === "edit" ? updateTrainingEvent : createTrainingEvent, initialState);
  const [creationToken] = useState(() => typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `series-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const selectedParticipants = useMemo(
    () => new Set(mode === "edit" ? event?.attendance.map((entry) => entry.playerId) ?? [] : participants.map((player) => player.id)),
    [event?.attendance, mode, participants]
  );
  const activeTeam = squads.find((squad) => squad.isActive) ?? squads[0];
  const assignedTeam = (event?.squadId ? squads.find((squad) => squad.id === event.squadId) : undefined) ?? activeTeam;
  const values = useMemo(() => state.values ?? {
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
    editScope: "single",
    participantSourceMode: event?.participantSourceMode ?? "current_squad_sync"
  }, [activeTeam?.id, event, state.values]);
  const errors = state.fieldErrors ?? {};
  const [dateValue, setDateValue] = useState(values.date);
  const [startTime, setStartTime] = useState(values.startTime);
  const [endTime, setEndTime] = useState(values.endTime);
  const [repeatMode, setRepeatMode] = useState(values.repeatMode || "none");
  const [interval, setInterval] = useState(values.repeatIntervalWeeks || "1");
  const [endMode, setEndMode] = useState(values.repeatEndMode || "date");
  const [endDate, setEndDate] = useState(values.repeatEndDate || "");
  const [occurrences, setOccurrences] = useState(values.repeatOccurrenceCount || "10");
  const [selectedPlanId, setSelectedPlanId] = useState(values.linkedTrainingSessionId);
  const [planApplyMode, setPlanApplyMode] = useState(values.planApplyMode === "all" ? "all" : "first");
  const [weekdays, setWeekdays] = useState<Set<string>>(
    () => new Set(values.repeatWeekdays?.length ? values.repeatWeekdays : values.date ? [String(weekdayForDate(values.date))] : [])
  );
  const repeatEnabled = mode === "create" && repeatMode !== "none";
  const recurrenceDates = useMemo(() => repeatEnabled ? generateTrainingRecurrenceDates({
    startDate: dateValue,
    intervalWeeks: repeatMode === "two_weeks" ? 2 : Math.max(1, Number.parseInt(interval, 10) || 1),
    weekdays: Array.from(weekdays).map(Number),
    endMode: endMode === "occurrence_count" ? "occurrence_count" : "date",
    endDate,
    occurrenceCount: Number.parseInt(occurrences, 10) || 0
  }) : [], [dateValue, endDate, endMode, interval, occurrences, repeatEnabled, repeatMode, weekdays]);
  const recurrenceConflicts = useMemo(() => summarizeCalendarConflicts(recurrenceDates, calendarContext), [calendarContext, recurrenceDates]);
  const oneOffConflicts = useMemo(() => repeatEnabled ? [] : findCalendarConflicts(dateValue, calendarContext), [calendarContext, dateValue, repeatEnabled]);
  const defaultExcludedDates = useMemo(() => {
    if (!calendarContext) return [];
    return Array.from(recurrenceConflicts.entries())
      .filter(([, conflicts]) => conflicts.some((conflict) => shouldExcludeByDefault(conflict, calendarContext)))
      .map(([date]) => date);
  }, [calendarContext, recurrenceConflicts]);
  const [excludedDates, setExcludedDates] = useState<Set<string>>(() => new Set(defaultExcludedDates));
  useEffect(() => setExcludedDates(new Set(defaultExcludedDates)), [defaultExcludedDates]);
  const createdCount = Math.max(0, recurrenceDates.length - excludedDates.size);
  const preview = buildRecurrencePreview(recurrenceDates, weekdays, startTime, endTime, locale, copy);
  const errorText = (error?: string) => error ? ui(error) : undefined;

  function toggleRepeat(enabled: boolean) {
    setRepeatMode(enabled ? "weekly" : "none");
    if (enabled && dateValue) setWeekdays(new Set([String(weekdayForDate(dateValue))]));
  }

  function changeDate(value: string) {
    const previousDay = dateValue ? String(weekdayForDate(dateValue)) : undefined;
    setDateValue(value);
    if (value && (!weekdays.size || (weekdays.size === 1 && previousDay && weekdays.has(previousDay)))) {
      setWeekdays(new Set([String(weekdayForDate(value))]));
    }
  }

  return (
    <form action={formAction} noValidate className="mx-auto max-w-5xl space-y-5" data-training-creation-form>
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}
      <input type="hidden" name="creationToken" value={creationToken} />
      <input type="hidden" name="repeatMode" value={repeatEnabled ? repeatMode : "none"} />
      {state.error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{ui(state.error)}</div> : null}

      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5">
        <h2 className="text-lg font-bold text-board-navy">{copy.appointment}</h2>
        <p className="mt-1 text-sm text-slate-500">{copy.appointmentHelp}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput name="date" label={copy.date} type="date" required defaultValue={values.date} error={errorText(errors.date)} onChange={changeDate} />
          <TextInput name="startTime" label={copy.start} type="time" required defaultValue={values.startTime} error={errorText(errors.startTime)} onChange={setStartTime} />
          <TextInput name="endTime" label={copy.end} type="time" defaultValue={values.endTime} onChange={setEndTime} />
          <TextInput name="label" label={copy.title} defaultValue={values.label} error={errorText(errors.label)} placeholder={copy.titlePlaceholder} />
          <div className="md:col-span-2"><TextInput name="location" label={copy.location} defaultValue={values.location} placeholder={copy.locationPlaceholder} /></div>
        </div>
        <input type="hidden" name="squadId" value={values.squadId} />
        <div className="mt-4 grid gap-3 border-t border-board-line pt-4 sm:grid-cols-2">
          <Summary label={copy.team} value={assignedTeam?.name ?? copy.activeTeam} />
          <Summary label={copy.participants} value={normalizeMode(values.participantSourceMode) === "custom_selection" ? copy.customSelection : copy.entireSquad} />
        </div>
        {oneOffConflicts.length ? <CalendarWarning conflicts={oneOffConflicts} copy={copy} ui={ui} /> : null}
      </section>

      <ParticipantSelector participants={participants} selected={selectedParticipants} initialMode={normalizeMode(values.participantSourceMode)} copy={copy} />

      {mode === "create" ? (
        <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5" data-repeat-section>
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="min-w-0"><span className="block font-bold text-board-navy">{copy.repeat}</span><span className="mt-1 block text-sm text-slate-500">{repeatEnabled ? copy.repeatOnHelp : copy.repeatOffHelp}</span></span>
            <input type="checkbox" checked={repeatEnabled} onChange={(e) => toggleRepeat(e.target.checked)} aria-label={copy.repeatTraining} className="h-5 w-5 shrink-0 rounded border-slate-300 text-board-green focus:ring-board-green" />
          </label>
          {repeatEnabled ? (
            <div className="mt-5 space-y-5 border-t border-board-line pt-5">
              <fieldset>
                <legend className="text-sm font-bold text-slate-700">{copy.rhythm}</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(["weekly", "two_weeks", "custom"] as const).map((value) => (
                    <Choice key={value} checked={repeatMode === value} label={value === "weekly" ? copy.everyWeek : value === "two_weeks" ? copy.everyTwoWeeks : copy.custom} onChange={() => setRepeatMode(value)} />
                  ))}
                </div>
              </fieldset>
              {repeatMode === "custom" ? <TextInput name="repeatIntervalWeeks" label={copy.repeatEveryWeeks} type="number" min="1" defaultValue={interval} error={errorText(errors.repeatIntervalWeeks)} onChange={setInterval} /> : <input type="hidden" name="repeatIntervalWeeks" value={repeatMode === "two_weeks" ? "2" : "1"} />}
              <fieldset>
                <legend className="text-sm font-bold text-slate-700">{copy.weekdays}</legend>
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {weekdayOptions[locale].map((day) => (
                    <label key={day.value} className={`flex min-h-10 items-center justify-center rounded-md border px-2 py-2 text-sm font-semibold ${weekdays.has(day.value) ? "border-board-green bg-green-50 text-board-navy" : "border-board-line bg-white text-slate-700"}`}>
                      <input type="checkbox" name="repeatWeekdays" value={day.value} checked={weekdays.has(day.value)} onChange={(e) => {
                        const next = new Set(weekdays); if (e.target.checked) next.add(day.value); else next.delete(day.value); setWeekdays(next);
                      }} className="sr-only" />{day.short}
                    </label>
                  ))}
                </div>
                {errors.repeatWeekdays ? <p className="mt-1 text-sm font-medium text-red-700">{errorText(errors.repeatWeekdays)}</p> : null}
              </fieldset>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block"><span className="text-sm font-bold text-slate-700">{copy.ends}</span><select name="repeatEndMode" value={endMode} onChange={(e) => setEndMode(e.target.value)} className={inputClass}><option value="date">{copy.onDate}</option><option value="occurrence_count">{copy.afterTrainings}</option></select></label>
                {endMode === "date" ? <TextInput name="repeatEndDate" label={copy.endDate} type="date" defaultValue={endDate} error={errorText(errors.repeatEndDate)} onChange={setEndDate} /> : <TextInput name="repeatOccurrenceCount" label={copy.trainingCount} type="number" min="1" defaultValue={occurrences} error={errorText(errors.repeatOccurrenceCount)} onChange={setOccurrences} />}
              </div>
              {preview ? <div className="rounded-md border border-board-line bg-board-paper p-3 text-sm text-board-navy" data-recurrence-preview><p className="font-bold">{preview.count}</p><p className="mt-1">{preview.range}</p><p className="mt-1 text-slate-600">{preview.schedule}</p></div> : null}
              {recurrenceConflicts.size ? <CalendarConflictSelector conflictsByDate={recurrenceConflicts} excludedDates={excludedDates} defaults={defaultExcludedDates} setExcludedDates={setExcludedDates} createdCount={createdCount} totalCount={recurrenceDates.length} sourceLabel={calendarContext?.sourceLabel ?? ""} locale={locale} copy={copy} ui={ui} /> : null}
              {recurrenceDates.length > 0 && createdCount === 0 ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{copy.allExcluded}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <details className="group rounded-lg border border-board-line bg-white shadow-soft" data-more-details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-bold text-board-navy sm:p-5"><span>{copy.moreDetails}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="grid gap-4 border-t border-board-line p-4 sm:p-5 md:grid-cols-2">
          <TextInput name="focus" label={copy.focus} defaultValue={values.focus} placeholder={copy.focusPlaceholder} />
          <label className="block md:col-span-2"><span className="text-sm font-medium text-slate-700">{copy.notes}</span><textarea name="generalNotes" defaultValue={values.generalNotes} rows={3} className={`${inputClass} h-auto min-h-24 py-2`} /></label>
          <div className="md:col-span-2">
            <p className="text-sm font-medium text-slate-700">{copy.trainingPlan}</p>
            {sessions.length ? <select name="linkedTrainingSessionId" value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} className={inputClass}><option value="">{copy.noPlanYet}</option>{sessions.map((session) => <option translate="no" key={session.id} value={session.id}>{session.title}</option>)}</select> : <div className="mt-2 rounded-md border border-dashed border-board-line bg-board-paper p-3"><p className="text-sm text-slate-600">{copy.noPlansAvailable}</p><ButtonLink href="/sessions/new" variant="ghost" className="mt-2 h-8 px-2 text-xs">{copy.createPlan}</ButtonLink></div>}
          </div>
          {repeatEnabled && selectedPlanId ? <fieldset className="md:col-span-2"><legend className="text-sm font-bold text-slate-700">{copy.usePlanFor}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2"><Choice name="planApplyMode" value="first" checked={planApplyMode === "first"} label={copy.firstTrainingOnly} onChange={() => setPlanApplyMode("first")} /><Choice name="planApplyMode" value="all" checked={planApplyMode === "all"} label={copy.allCreatedTrainings} onChange={() => setPlanApplyMode("all")} /></div></fieldset> : <input type="hidden" name="planApplyMode" value="none" />}
        </div>
      </details>

      {event?.recurrenceSeriesId ? <fieldset className="rounded-lg border border-amber-200 bg-amber-50 p-4" data-edit-scope><legend className="px-1 text-sm font-bold text-board-navy">{copy.applyChangesTo}</legend><p className="mt-1 text-xs text-slate-600">{copy.futureScopeHelp}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><Choice name="editScope" value="single" defaultChecked={values.editScope !== "future"} label={copy.onlyThisTraining} /><Choice name="editScope" value="future" defaultChecked={values.editScope === "future"} label={copy.thisAndFollowing} /></div></fieldset> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href={event ? `/trainings/${event.id}` : "/trainings"} variant="secondary" className="justify-center">{copy.cancel}</ButtonLink>
        <Button type="submit" disabled={isPending || (repeatEnabled && recurrenceDates.length > 0 && createdCount === 0)} className="justify-center">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}{mode === "edit" ? copy.save : repeatEnabled ? copy.createTrainings.replace("{count}", String(createdCount)) : copy.createTraining}</Button>
      </div>
    </form>
  );
}

const inputClass = "mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100";
const weekdayOptions: Record<Locale, Array<{ value: string; short: string }>> = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((short, index) => ({ value: String(index + 1), short })),
  de: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((short, index) => ({ value: String(index + 1), short }))
};
const weekdayLong: Record<Locale, string[]> = {
  en: ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"],
  de: ["Montags", "Dienstags", "Mittwochs", "Donnerstags", "Freitags", "Samstags", "Sonntags"]
};

function normalizeMode(value?: string): ParticipantSourceMode { return value === "custom_selection" ? "custom_selection" : "current_squad_sync"; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-md bg-board-paper px-3 py-2"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 truncate font-bold text-board-navy">{value}</p></div>; }
function Choice({ checked, defaultChecked, label, onChange, name, value }: { checked?: boolean; defaultChecked?: boolean; label: string; onChange?: () => void; name?: string; value?: string }) { return <label className={`rounded-md border p-3 text-sm font-semibold text-board-navy ${checked ? "border-board-green bg-green-50" : "border-board-line bg-white"}`}><input type="radio" name={name} value={value} checked={checked} defaultChecked={defaultChecked} onChange={onChange} className="mr-2" />{label}</label>; }

function CalendarWarning({ conflicts, copy, ui }: { conflicts: CalendarConflict[]; copy: Copy; ui: (source: string) => string }) {
  return <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"><p className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4" />{copy.calendarNote}</p><p className="mt-1 text-sm text-amber-900">{conflicts.map((conflict) => `${conflict.event.name} · ${ui(calendarCategoryLabel(conflict.event.category))}${conflict.event.confidence === "suggested" ? ` · ${copy.confirmLocally}` : ""}`).join("; ")}</p></div>;
}

function CalendarConflictSelector({ conflictsByDate, excludedDates, defaults, setExcludedDates, createdCount, totalCount, sourceLabel, locale, copy, ui }: {
  conflictsByDate: Map<string, CalendarConflict[]>; excludedDates: Set<string>; defaults: string[]; setExcludedDates: (value: Set<string>) => void; createdCount: number; totalCount: number; sourceLabel: string; locale: Locale; copy: Copy; ui: (source: string) => string;
}) {
  const rows = Array.from(conflictsByDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  const counts = countCategories(rows);
  return <details className="rounded-md border border-amber-200 bg-amber-50" data-calendar-conflicts>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-bold text-amber-900"><span className="flex min-w-0 items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{copy.conflictSummary.replace("{count}", String(rows.length))}</span><span className="shrink-0 text-xs underline">{copy.reviewDates}</span></summary>
    <div className="border-t border-amber-200 p-3"><p className="text-xs text-amber-900">{copy.createdSummary.replace("{created}", String(createdCount)).replace("{total}", String(totalCount))} {ui(sourceLabel)}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {calendarCategories.map((category) => counts.get(category) ? <button key={category} type="button" onClick={() => { const next = new Set(excludedDates); for (const [date, conflicts] of rows) if (conflicts.some((conflict) => normalizeCalendarCategory(conflict.event.category) === category)) next.add(date); setExcludedDates(next); }} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-xs font-bold text-board-navy hover:border-board-green">{copy.excludeCategory.replace("{category}", ui(calendarCategoryLabel(category)))}<span className="mt-1 block font-medium text-slate-500">{copy.affected.replace("{count}", String(counts.get(category)))}</span></button> : null)}
        <button type="button" onClick={() => setExcludedDates(new Set())} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-xs font-bold text-board-navy hover:border-board-green">{copy.keepAll}</button>
        <button type="button" onClick={() => setExcludedDates(new Set(defaults))} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-xs font-bold text-board-navy hover:border-board-green">{copy.resetDefaults}</button>
      </div>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">{rows.map(([date, conflicts]) => {
        const checked = excludedDates.has(date);
        return <label key={date} className="block rounded-md border border-amber-200 bg-white p-3 text-sm text-board-navy"><span className="flex items-start gap-3"><input name="excludeOccurrenceDate" value={date} type="checkbox" checked={checked} onChange={(e) => { const next = new Set(excludedDates); if (e.target.checked) next.add(date); else next.delete(date); setExcludedDates(next); }} className="mt-1 h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" /><span className="min-w-0"><span className="block font-bold">{formatDate(date, locale)} · {checked ? copy.exclude : copy.keep}</span><span className="mt-1 block text-xs text-slate-600">{conflicts.map((conflict) => <span key={conflict.event.id} className="mr-2 inline-block">{conflict.event.name} ({ui(calendarCategoryLabel(conflict.event.category))}{conflict.event.confidence === "suggested" ? `, ${copy.suggested}` : ""})</span>)}</span></span></span><input type="hidden" name={`excludeOccurrenceReason:${date}`} value={conflicts.map((conflict) => conflict.event.name).join(", ")} /><input type="hidden" name={`excludeOccurrenceType:${date}`} value={normalizeCalendarCategory(conflicts[0]?.event.category ?? "team_custom_exclusion")} /></label>;
      })}</div>
    </div>
  </details>;
}

const calendarCategories = ["statutory_public_holiday", "official_school_holiday", "movable_school_holiday", "local_school_free_day", "team_custom_exclusion"];
function countCategories(rows: Array<[string, CalendarConflict[]]>) { const counts = new Map<string, number>(); for (const [, conflicts] of rows) for (const category of new Set(conflicts.map((conflict) => normalizeCalendarCategory(conflict.event.category)))) counts.set(category, (counts.get(category) ?? 0) + 1); return counts; }

function ParticipantSelector({ participants, selected, initialMode, copy }: { participants: SquadPlayer[]; selected: Set<string>; initialMode: ParticipantSourceMode; copy: Copy }) {
  const [participantMode, setParticipantMode] = useState<ParticipantSourceMode>(initialMode);
  const [expanded, setExpanded] = useState(initialMode === "custom_selection");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(selected));
  const eligible = participants.filter((player) => player.playerType === "roster" || (player.playerType === "trial" && !player.convertedAt));
  const visible = participants.filter((player) => !search.trim() || [player.firstName, player.lastName, player.position, ...player.secondaryPositions].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const submitted = participantMode === "current_squad_sync" ? eligible.map((player) => player.id) : Array.from(selectedIds);
  return <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5" data-participant-selector>
    <input type="hidden" name="participantSourceMode" value={participantMode} />{submitted.map((id) => <input key={id} type="hidden" name="participantIds" value={id} />)}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="flex items-center gap-2 font-bold text-board-navy"><Users className="h-4 w-4" />{copy.participants}</p><p className="mt-1 text-sm font-semibold text-board-navy">{participantMode === "current_squad_sync" ? copy.entireSquad : copy.customSelection}</p><p className="mt-1 text-sm text-slate-500">{participants.length ? (participantMode === "current_squad_sync" ? copy.syncedPlayerCount.replace("{count}", String(eligible.length)) : copy.selectedPlayerCount.replace("{count}", String(selectedIds.size))) : copy.emptySquad}</p>{!participants.length ? <ButtonLink href="/squad/players/new" variant="ghost" className="mt-2 h-8 px-2 text-xs">{copy.addPlayers}</ButtonLink> : null}</div><Button type="button" variant="secondary" className="h-9 shrink-0 px-3 text-xs" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>{expanded ? copy.closeParticipantSettings : copy.adjustParticipants}</Button></div>
    {expanded ? <div className="mt-4 border-t border-board-line pt-4"><fieldset><legend className="sr-only">{copy.participants}</legend><div className="grid gap-2 sm:grid-cols-2"><Choice checked={participantMode === "current_squad_sync"} label={copy.entireSquad} onChange={() => setParticipantMode("current_squad_sync")} /><Choice checked={participantMode === "custom_selection"} label={copy.customSelection} onChange={() => setParticipantMode("custom_selection")} /></div></fieldset>{participantMode === "custom_selection" ? <div className="mt-4"><input value={search} onChange={(e) => setSearch(e.target.value)} aria-label={copy.searchPlayers} placeholder={copy.searchPlayers} className={`${inputClass} mt-0`} /><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={() => setSelectedIds((current) => new Set([...current, ...visible.map((player) => player.id)]))}>{copy.selectVisible}</Button><Button type="button" variant="ghost" className="h-9 px-3 text-xs" onClick={() => setSelectedIds(new Set())}>{copy.clearSelection}</Button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visible.map((player) => <label key={player.id} className="flex min-w-0 items-center gap-3 rounded-md border border-board-line bg-white px-3 py-2 text-sm font-semibold text-board-navy"><input type="checkbox" checked={selectedIds.has(player.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(player.id)) next.delete(player.id); else next.add(player.id); return next; })} className="h-4 w-4 shrink-0 rounded border-slate-300 text-board-green focus:ring-board-green" /><span className="min-w-0 flex-1 break-words">{[player.firstName, player.lastName].filter(Boolean).join(" ")}{player.position ? <span className="font-medium text-slate-500"> · {formatPositionLabel(player.position) ?? player.position}</span> : null}</span>{player.playerType === "trial" ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{copy.trial}</span> : null}</label>)}</div></div> : null}</div> : null}
  </section>;
}

function buildRecurrencePreview(dates: string[], weekdays: Set<string>, start: string, end: string, locale: Locale, copy: Copy) {
  if (!dates.length) return null;
  const dayLabels = Array.from(weekdays).sort((a, b) => Number(a) - Number(b)).map((day) => weekdayLong[locale][Number(day) - 1]).filter(Boolean).join(", ");
  return { count: copy.trainingUnits.replace("{count}", String(dates.length)), range: `${formatDate(dates[0], locale)} – ${formatDate(dates.at(-1), locale)}`, schedule: `${dayLabels}${start ? ` · ${start}${end ? `–${end}` : ""}` : ""}` };
}

function TextInput({ name, label, type = "text", required, defaultValue, error, placeholder, onChange, min }: { name: string; label: string; type?: string; required?: boolean; defaultValue: string; error?: string; placeholder?: string; onChange?: (value: string) => void; min?: string }) {
  return <label className="block min-w-0"><span className="text-sm font-medium text-slate-700">{label}{required ? <span className="ml-1 text-red-600">*</span> : null}</span><input name={name} type={type} min={min} defaultValue={defaultValue} onChange={onChange ? (e) => onChange(e.target.value) : undefined} placeholder={placeholder} aria-invalid={Boolean(error)} className={`${inputClass} ${error ? "border-red-300 ring-1 ring-red-100" : ""}`} />{error ? <p className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}</label>;
}

type Copy = { [Key in keyof typeof trainingCreationCopy.en]: string };
const trainingCreationCopy = {
  en: {
    appointment: "Training appointment", appointmentHelp: "Add the date and time. Everything else is optional.", date: "Date", start: "Start", end: "End", title: "Title", location: "Location", titlePlaceholder: "e.g. Regional selection", locationPlaceholder: "e.g. Main pitch", team: "Team", activeTeam: "Active Team", participants: "Participants", entireSquad: "Entire Squad", customSelection: "Custom selection", calendarNote: "Calendar note", confirmLocally: "Suggestion – confirm locally", repeat: "Repeat", repeatTraining: "Repeat Training", repeatOnHelp: "Create concrete future Trainings from this schedule.", repeatOffHelp: "Does not repeat", rhythm: "Rhythm", everyWeek: "Every week", everyTwoWeeks: "Every 2 weeks", custom: "Custom", repeatEveryWeeks: "Repeat every X weeks", weekdays: "Weekdays", ends: "Ends", onDate: "On date", afterTrainings: "After number of Trainings", endDate: "End date", trainingCount: "Number of Trainings", trainingUnits: "{count} Trainings", conflictSummary: "{count} dates fall in holidays or school breaks.", reviewDates: "Review dates", createdSummary: "{created} of {total} Trainings will be created.", excludeCategory: "Exclude {category}", affected: "{count} affected", keepAll: "Keep all", resetDefaults: "Reset to defaults", exclude: "Exclude", keep: "Keep", suggested: "suggestion – confirm locally", allExcluded: "All dates are excluded. Keep at least one date or change the recurrence.", moreDetails: "More details", focus: "Training focus", focusPlaceholder: "e.g. Offensive 1v1", notes: "General notes", trainingPlan: "Training Plan", noPlanYet: "No Plan yet", noPlansAvailable: "No Training Plans available yet.", createPlan: "Create Training Plan", usePlanFor: "Use Plan for", firstTrainingOnly: "First Training only", allCreatedTrainings: "All created Trainings", applyChangesTo: "Apply changes to", futureScopeHelp: "Updates shared details on this and following non-completed Trainings. The recurrence pattern is unchanged.", onlyThisTraining: "This Training only", thisAndFollowing: "This and following Trainings", syncedPlayerCount: "{count} Players are taken from the current Squad and kept in sync until Training.", selectedPlayerCount: "{count} Players selected for this Training.", adjustParticipants: "Adjust participants", closeParticipantSettings: "Close participant settings", searchPlayers: "Search Players", selectVisible: "Select all visible", clearSelection: "Clear selection", emptySquad: "No Players are in the Squad yet. You can still create the Training and add Players later.", addPlayers: "Add Players", trial: "Trial", cancel: "Cancel", save: "Save", createTraining: "Create Training", createTrainings: "Create {count} Trainings"
  },
  de: {
    appointment: "Trainingstermin", appointmentHelp: "Trage Datum und Uhrzeit ein. Alles Weitere ist optional.", date: "Datum", start: "Beginn", end: "Ende", title: "Titel", location: "Ort", titlePlaceholder: "z. B. Regionalauswahl", locationPlaceholder: "z. B. Hauptplatz", team: "Mannschaft", activeTeam: "Aktive Mannschaft", participants: "Teilnehmer", entireSquad: "Gesamte Mannschaft", customSelection: "Eigene Auswahl", calendarNote: "Hinweis zum Kalender", confirmLocally: "Vorschlag – lokal prüfen", repeat: "Wiederholen", repeatTraining: "Training wiederholen", repeatOnHelp: "Erstelle konkrete zukünftige Trainings aus diesem Rhythmus.", repeatOffHelp: "Keine Wiederholung", rhythm: "Rhythmus", everyWeek: "Jede Woche", everyTwoWeeks: "Alle 2 Wochen", custom: "Benutzerdefiniert", repeatEveryWeeks: "Alle X Wochen wiederholen", weekdays: "Wochentage", ends: "Endet", onDate: "Am Datum", afterTrainings: "Nach Anzahl Trainingseinheiten", endDate: "Enddatum", trainingCount: "Anzahl Trainingseinheiten", trainingUnits: "{count} Trainingseinheiten", conflictSummary: "{count} Termine liegen in Ferien oder auf Feiertagen.", reviewDates: "Termine prüfen", createdSummary: "{created} von {total} Trainings werden erstellt.", excludeCategory: "{category} ausschließen", affected: "{count} betroffen", keepAll: "Alle beibehalten", resetDefaults: "Auf Standard zurücksetzen", exclude: "Ausschließen", keep: "Beibehalten", suggested: "Vorschlag – lokal prüfen", allExcluded: "Alle Termine sind ausgeschlossen. Behalte mindestens einen Termin oder ändere die Wiederholung.", moreDetails: "Weitere Angaben", focus: "Trainingsschwerpunkt", focusPlaceholder: "z. B. offensives 1-gegen-1", notes: "Notizen", trainingPlan: "Trainingsplan", noPlanYet: "Noch kein Trainingsplan", noPlansAvailable: "Noch keine Trainingspläne vorhanden.", createPlan: "Trainingsplan erstellen", usePlanFor: "Plan verwenden für", firstTrainingOnly: "Nur erstes Training", allCreatedTrainings: "Alle erstellten Trainings", applyChangesTo: "Änderungen anwenden auf", futureScopeHelp: "Aktualisiert gemeinsame Angaben dieses und der folgenden nicht abgeschlossenen Trainings. Der Wiederholungsrhythmus bleibt unverändert.", onlyThisTraining: "Nur dieses Training", thisAndFollowing: "Dieses und folgende Trainings", syncedPlayerCount: "{count} Spieler werden aus dem aktuellen Kader übernommen und bis zum Training synchron gehalten.", selectedPlayerCount: "{count} Spieler für dieses Training ausgewählt.", adjustParticipants: "Teilnehmer anpassen", closeParticipantSettings: "Teilnehmerauswahl schließen", searchPlayers: "Spieler suchen", selectVisible: "Alle sichtbaren auswählen", clearSelection: "Auswahl löschen", emptySquad: "Noch keine Spieler im Kader. Du kannst das Training trotzdem erstellen und Spieler später hinzufügen.", addPlayers: "Spieler hinzufügen", trial: "Probetraining", cancel: "Abbrechen", save: "Speichern", createTraining: "Training erstellen", createTrainings: "{count} Trainingseinheiten erstellen"
  }
} as const;
