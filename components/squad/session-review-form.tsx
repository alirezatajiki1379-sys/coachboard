"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Star } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { saveTrainingSessionReview, type SessionReviewActionState } from "@/lib/squad/session-review-actions";
import {
  sessionReviewRatingLabel,
  sessionReviewStarFillStates,
  type SessionReviewRatingKind
} from "@/lib/squad/session-review";
import { formatDateLabel, trainingTimeRange } from "@/lib/trainings/utils";
import type { Locale } from "@/lib/i18n";
import type {
  SquadTrainingEventDetail,
  TrainingSessionDrillFeedbackStatus,
  TrainingSessionObjectiveOutcome,
  TrainingSessionReview
} from "@/types/domain";

type ReviewDrill = {
  id: string;
  title: string;
  block?: string;
  plannedDurationMinutes?: number;
};

type DrillReviewValue = {
  feedbackStatus: "" | TrainingSessionDrillFeedbackStatus;
  effectivenessRating: number | "";
  note: string;
};

type ReviewFormValues = {
  objectiveOutcome: "" | TrainingSessionObjectiveOutcome;
  overallQuality: number | "";
  intensity: number | "";
  playerResponse: number | "";
  workedWell: string;
  needsImprovement: string;
  nextTrainingNote: string;
  drills: Record<string, DrillReviewValue>;
};

type ClientErrors = Partial<Record<"objectiveOutcome" | "overallQuality" | "intensity" | "playerResponse", string>>;

export function SessionReviewForm({
  event,
  review,
  drills,
  attendanceSummary,
  ratingsSummary,
  observationCount,
  planTitle,
  locale = "en"
}: {
  event: SquadTrainingEventDetail;
  review: TrainingSessionReview | null;
  drills: ReviewDrill[];
  attendanceSummary: { present: number; absent: number; late: number; total: number };
  ratingsSummary: { rated: number; rateable: number };
  observationCount: number;
  planTitle?: string;
  locale?: Locale;
}) {
  const copy = reviewCopy[locale];
  const [state, formAction, isPending] = useActionState<SessionReviewActionState, FormData>(async (previous, data) => {
    try {
      return await saveTrainingSessionReview(previous, data);
    } catch {
      return { error: copy.saveFailed, submissionId: Date.now() };
    }
  }, {});
  const [values, setValues] = useState<ReviewFormValues>(() => initialValues(review, drills));
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});
  const objectiveRef = useRef<HTMLDivElement>(null);
  const qualityRef = useRef<HTMLDivElement>(null);
  const intensityRef = useRef<HTMLDivElement>(null);
  const playerResponseRef = useRef<HTMLDivElement>(null);
  const [baselineSignature, setBaselineSignature] = useState(() => JSON.stringify(initialValues(review, drills)));
  const currentSignature = useMemo(() => JSON.stringify(values), [values]);
  const isDirty = currentSignature !== baselineSignature;
  const submittedSignature = useRef(baselineSignature);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = copy.unsaved;
      return copy.unsaved;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [copy.unsaved, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target || link.download || link.origin !== window.location.origin) return;
      if (link.href === window.location.href || link.href.startsWith(`${window.location.href}#`)) return;
      if (!window.confirm(copy.leaveConfirmation)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [copy.leaveConfirmation, isDirty]);

  useEffect(() => {
    if (!state.success) return;
    setBaselineSignature(submittedSignature.current);
    setClientErrors({});
  }, [state.success, state.submissionId]);

  const mergedErrors = { ...state.fieldErrors, ...clientErrors };

  function validate() {
    const nextErrors: ClientErrors = {};
    if (!values.objectiveOutcome) nextErrors.objectiveOutcome = copy.errors.objectiveOutcome;
    if (!values.overallQuality) nextErrors.overallQuality = copy.errors.overallQuality;
    if (!values.intensity) nextErrors.intensity = copy.errors.intensity;
    if (!values.playerResponse) nextErrors.playerResponse = copy.errors.playerResponse;
    setClientErrors(nextErrors);
    const first = Object.keys(nextErrors)[0] as keyof ClientErrors | undefined;
    if (first) {
      const refs = { objectiveOutcome: objectiveRef, overallQuality: qualityRef, intensity: intensityRef, playerResponse: playerResponseRef };
      refs[first].current?.scrollIntoView({ behavior: "smooth", block: "center" });
      refs[first].current?.focus();
      return false;
    }
    return true;
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (isPending || !validate()) event.preventDefault();
        else submittedSignature.current = currentSignature;
      }}
      className="space-y-6"
    >
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="objectiveOutcome" value={values.objectiveOutcome} />
      <input type="hidden" name="overallQuality" value={values.overallQuality} />
      <input type="hidden" name="intensity" value={values.intensity} />
      <input type="hidden" name="playerResponse" value={values.playerResponse} />
      <textarea hidden readOnly name="workedWell" value={values.workedWell} />
      <textarea hidden readOnly name="needsImprovement" value={values.needsImprovement} />
      <textarea hidden readOnly name="nextTrainingNote" value={values.nextTrainingNote} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/trainings/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
          <ArrowLeft className="h-4 w-4" />
          {copy.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty ? <span className="text-xs font-bold uppercase tracking-wide text-amber-700">{copy.unsaved}</span> : null}
          {state.success && !isDirty ? <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-green-700"><CheckCircle2 className="h-4 w-4" />{copy.saved}</span> : null}
          <ButtonLink href={`/trainings/${event.id}`} variant="secondary">{copy.cancel}</ButtonLink>
          <Button type="submit" disabled={isPending}>{isPending ? copy.saving : copy.save}</Button>
        </div>
      </div>

      {state.error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p> : null}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold uppercase text-board-green">{copy.eyebrow}</p>
        <h1 className="mt-2 break-words text-2xl font-bold tracking-normal text-board-navy sm:text-3xl">{event.label || copy.fallbackTitle}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-slate-600">
          <span className="rounded-md bg-slate-100 px-2 py-1">{formatDateLabel(event.date)} · {trainingTimeRange(event)}</span>
          <span className="rounded-md bg-slate-100 px-2 py-1">{event.squadName ?? copy.activeTeam}</span>
          {event.focus ? <span className="rounded-md bg-slate-100 px-2 py-1">{event.focus}</span> : null}
          {planTitle ? <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">{copy.plan}: {planTitle}</span> : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label={copy.summary.attendance} value={`${attendanceSummary.present}/${attendanceSummary.total}`} helper={copy.summary.attendanceHelper(attendanceSummary.absent, attendanceSummary.late)} />
        <SummaryCard label={copy.summary.ratings} value={`${ratingsSummary.rated}/${ratingsSummary.rateable}`} helper={copy.summary.ratingsHelper} />
        <SummaryCard label={copy.summary.observations} value={String(observationCount)} helper={copy.summary.observationsHelper} />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-3 shadow-soft sm:p-5">
        <h2 className="flex items-center gap-2 text-xl font-bold text-board-navy"><ClipboardCheck className="h-5 w-5" />{copy.sectionTitle}</h2>
        {event.focus ? (
          <div className="mt-4 rounded-lg border border-board-line bg-board-paper p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{copy.trainingObjective}</p>
            <p className="mt-1 text-sm font-semibold text-board-navy">{event.focus}</p>
          </div>
        ) : null}
        <div className="mt-5 grid gap-5 lg:grid-cols-4">
          <RequiredChoice
            refTarget={objectiveRef}
            label={copy.objectiveOutcome}
            error={mergedErrors.objectiveOutcome}
            options={objectiveOutcomes.map((option) => ({ value: option, label: copy.objectiveLabels[option] }))}
            value={values.objectiveOutcome}
            onChange={(value) => setValues((current) => ({ ...current, objectiveOutcome: value as TrainingSessionObjectiveOutcome }))}
          />
          <StarRating refTarget={qualityRef} kind="quality" label={copy.overallQuality} value={values.overallQuality} error={mergedErrors.overallQuality} locale={locale} onChange={(value) => setValues((current) => ({ ...current, overallQuality: value }))} />
          <StarRating refTarget={intensityRef} kind="intensity" label={copy.intensity} value={values.intensity} error={mergedErrors.intensity} locale={locale} onChange={(value) => setValues((current) => ({ ...current, intensity: value }))} />
          <StarRating
            refTarget={playerResponseRef}
            kind="playerResponse"
            label={copy.playerResponse}
            helper={copy.playerResponseHelper}
            value={values.playerResponse}
            error={mergedErrors.playerResponse}
            locale={locale}
            onChange={(value) => setValues((current) => ({ ...current, playerResponse: value }))}
          />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <TextArea label={copy.workedWell} helper={copy.workedWellHelper} value={values.workedWell} onChange={(value) => setValues((current) => ({ ...current, workedWell: value }))} />
          <TextArea label={copy.needsImprovement} helper={copy.needsImprovementHelper} value={values.needsImprovement} onChange={(value) => setValues((current) => ({ ...current, needsImprovement: value }))} />
          <TextArea label={copy.nextTrainingNote} helper={copy.nextTrainingNoteHelper} value={values.nextTrainingNote} onChange={(value) => setValues((current) => ({ ...current, nextTrainingNote: value }))} />
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-3 shadow-soft sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-board-navy">{copy.drillFeedback}</h2>
            <p className="text-sm text-slate-600">{copy.drillFeedbackHelper}</p>
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{copy.drillCount(drills.length)}</span>
        </div>
        {drills.length ? (
          <div className="mt-4 space-y-3">
            {drills.map((drill) => {
              const value = values.drills[drill.id] ?? emptyDrillReview();
              return (
                <article key={drill.id} className="rounded-lg border border-board-line bg-board-paper p-3 sm:p-4">
                  <input type="hidden" name="drillInstanceId" value={drill.id} />
                  <input type="hidden" name={`drillStatus:${drill.id}`} value={value.feedbackStatus} />
                  <input type="hidden" name={`drillRating:${drill.id}`} value={value.effectivenessRating} />
                  <textarea hidden readOnly name={`drillNote:${drill.id}`} value={value.note} />
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                    <div>
                      <h3 translate="no" className="font-bold text-board-navy">{drill.title}</h3>
                      <p className="text-xs font-semibold text-slate-500">{drill.block ?? copy.trainingBlock}{drill.plannedDurationMinutes ? ` · ${drill.plannedDurationMinutes} min` : ""}</p>
                    </div>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{copy.feedback}</span>
                      <select
                        value={value.feedbackStatus}
                        onChange={(event) => updateDrillValue(setValues, drill.id, { feedbackStatus: event.target.value as DrillReviewValue["feedbackStatus"] })}
                        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
                      >
                        <option value="">{copy.noStatus}</option>
                        {feedbackStatuses.map((status) => <option key={status} value={status}>{copy.feedbackLabels[status]}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{copy.effectiveness}</span>
                      <select
                        value={value.effectivenessRating}
                        onChange={(event) => updateDrillValue(setValues, drill.id, { effectivenessRating: event.target.value ? Number.parseInt(event.target.value, 10) : "" })}
                        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
                      >
                        <option value="">{copy.noRating}</option>
                        {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}
                      </select>
                    </label>
                  </div>
                  <TextArea
                    className="mt-3"
                    label={copy.drillNote}
                    value={value.note}
                    onChange={(note) => updateDrillValue(setValues, drill.id, { note })}
                    rows={2}
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-board-line bg-board-paper p-5">
            <h3 className="font-bold text-board-navy">{copy.noDrills}</h3>
            <p className="mt-1 text-sm text-slate-600">{copy.noDrillsHelper}</p>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {isDirty ? <span className="text-xs font-bold uppercase tracking-wide text-amber-700">{copy.unsaved}</span> : null}
        <ButtonLink href={`/trainings/${event.id}`} variant="secondary">{copy.cancel}</ButtonLink>
        <Button type="submit" disabled={isPending}>{isPending ? copy.saving : copy.save}</Button>
      </div>
    </form>
  );
}

function initialValues(review: TrainingSessionReview | null, drills: ReviewDrill[]): ReviewFormValues {
  const reviewByInstance = new Map(review?.drillReviews.map((item) => [item.sessionDrillInstanceId, item]) ?? []);
  return {
    objectiveOutcome: review?.objectiveOutcome ?? "",
    overallQuality: review?.overallQuality ?? "",
    intensity: review?.intensity ?? "",
    playerResponse: review?.playerResponse ?? "",
    workedWell: review?.workedWell ?? "",
    needsImprovement: review?.needsImprovement ?? "",
    nextTrainingNote: review?.nextTrainingNote ?? "",
    drills: Object.fromEntries(drills.map((drill) => {
      const drillReview = reviewByInstance.get(drill.id);
      return [drill.id, {
        feedbackStatus: drillReview?.feedbackStatus ?? "",
        effectivenessRating: drillReview?.effectivenessRating ?? "",
        note: drillReview?.note ?? ""
      }];
    }))
  };
}

function RequiredChoice({
  refTarget,
  label,
  value,
  options,
  error,
  onChange
}: {
  refTarget: RefObject<HTMLDivElement | null>;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div ref={refTarget} tabIndex={-1} className="rounded-md focus:outline-none focus:ring-4 focus:ring-green-100">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 grid gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md border px-3 py-2 text-left text-sm font-bold transition ${value === option.value ? "border-board-green bg-green-50 text-board-green" : "border-board-line bg-white text-board-navy hover:border-board-green"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}

function StarRating({
  refTarget,
  kind,
  label,
  helper,
  value,
  error,
  locale,
  onChange
}: {
  refTarget: RefObject<HTMLDivElement | null>;
  kind: SessionReviewRatingKind;
  label: string;
  helper?: string;
  value: number | "";
  error?: string;
  locale: Locale;
  onChange: (value: number) => void;
}) {
  const [hoverValue, setHoverValue] = useState<number>();
  const fillStates = sessionReviewStarFillStates(value, hoverValue);
  const displayValue = hoverValue ?? value;
  const displayLabel = typeof displayValue === "number" ? sessionReviewRatingLabel(kind, displayValue, locale) : "";

  return (
    <div ref={refTarget} tabIndex={-1} onPointerLeave={() => setHoverValue(undefined)} className="rounded-md focus:outline-none focus:ring-4 focus:ring-green-100">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {helper ? <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5].map((rating, index) => {
          const active = fillStates[index] ?? false;
          const anchor = sessionReviewRatingLabel(kind, rating, locale);
          return (
            <button
              key={rating}
              type="button"
              onClick={() => onChange(rating)}
              onPointerEnter={() => setHoverValue(rating)}
              onFocus={() => setHoverValue(rating)}
              onBlur={() => setHoverValue(undefined)}
              aria-pressed={value === rating}
              aria-label={`${label}: ${rating}/5 - ${anchor}`}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-green-100 ${active ? "border-board-green bg-green-50 text-board-green" : "border-board-line bg-white text-slate-400 hover:border-board-green hover:text-board-navy"}`}
            >
              <Star className={`h-4 w-4 ${active ? "fill-current" : ""}`} />
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-5 text-sm font-semibold text-slate-600" aria-live="polite">
        {typeof displayValue === "number" ? `${displayValue}/5 · ${displayLabel}` : "-"}
      </p>
      {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}

function TextArea({ label, helper, value, onChange, rows = 4, className = "" }: { label: string; helper?: string; value: string; onChange: (value: string) => void; rows?: number; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {helper ? <span className="mt-1 block text-xs font-semibold text-slate-500">{helper}</span> : null}
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-board-line px-3 py-2 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
      />
    </label>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-board-navy">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{helper}</p>
    </div>
  );
}

function emptyDrillReview(): DrillReviewValue {
  return { feedbackStatus: "", effectivenessRating: "", note: "" };
}

function updateDrillValue(
  setValues: Dispatch<SetStateAction<ReviewFormValues>>,
  drillId: string,
  patch: Partial<DrillReviewValue>
) {
  setValues((current) => ({
    ...current,
    drills: {
      ...current.drills,
      [drillId]: {
        ...(current.drills[drillId] ?? emptyDrillReview()),
        ...patch
      }
    }
  }));
}

const objectiveOutcomes: TrainingSessionObjectiveOutcome[] = ["achieved", "partly_achieved", "not_achieved"];
const feedbackStatuses: TrainingSessionDrillFeedbackStatus[] = ["worked_well", "needs_adjustment", "not_effective"];

const reviewCopy = {
  en: {
    back: "Back to training",
    unsaved: "Unsaved changes",
    saved: "Saved",
    saveFailed: "Review could not be saved. Your changes are still here. Please try again.",
    leaveConfirmation: "You have unsaved review changes. Leave without saving?",
    cancel: "Cancel",
    saving: "Saving...",
    save: "Save review",
    drillFeedback: "Drill feedback",
    drillFeedbackHelper: "Optional feedback for the drill instances used in this training.",
    drillCount: (count: number) => `${count} ${count === 1 ? "drill" : "drills"}`,
    trainingBlock: "Training block",
    feedback: "Feedback",
    feedbackLabels: { worked_well: "Worked well", needs_adjustment: "Needs adjustment", not_effective: "Not effective" },
    noStatus: "No status",
    effectiveness: "Effectiveness",
    noRating: "No rating",
    drillNote: "Drill note",
    noDrills: "No session drills found",
    noDrillsHelper: "You can still save the overall coach reflection.",
    eyebrow: "Session Review",
    fallbackTitle: "Training review",
    activeTeam: "Active Team",
    plan: "Plan",
    sectionTitle: "Coach reflection",
    trainingObjective: "Training objective",
    objectiveOutcome: "Objective outcome",
    overallQuality: "Overall quality",
    intensity: "Intensity",
    playerResponse: "Player response",
    playerResponseHelper: "How well did the players engage with, understand and apply the Training focus?",
    workedWell: "What worked well?",
    workedWellHelper: "What should you repeat?",
    needsImprovement: "What needs adjustment?",
    needsImprovementHelper: "What did not work as intended, and why?",
    nextTrainingNote: "Take into next Training",
    nextTrainingNoteHelper: "One concrete point to continue, change or revisit.",
    objectiveLabels: {
      achieved: "Achieved",
      partly_achieved: "Partly achieved",
      not_achieved: "Not achieved"
    },
    errors: {
      objectiveOutcome: "Choose an outcome.",
      overallQuality: "Choose a quality rating.",
      intensity: "Choose an intensity rating.",
      playerResponse: "Choose a player response rating."
    },
    summary: {
      attendance: "Attendance",
      attendanceHelper: (absent: number, late: number) => `${absent} absent · ${late} late`,
      ratings: "Ratings",
      ratingsHelper: "Present players rated",
      observations: "Observations",
      observationsHelper: "Player observations linked to this training"
    }
  },
  de: {
    back: "Zurück zum Training",
    unsaved: "Ungespeicherte Änderungen",
    saved: "Gespeichert",
    saveFailed: "Die Rückschau konnte nicht gespeichert werden. Deine Änderungen sind noch vorhanden. Bitte versuche es erneut.",
    leaveConfirmation: "Du hast ungespeicherte Änderungen an der Rückschau. Ohne Speichern verlassen?",
    cancel: "Abbrechen",
    saving: "Speichern...",
    save: "Reflexion speichern",
    drillFeedback: "Übungsrückmeldung",
    drillFeedbackHelper: "Optionale Rückmeldung zu den Übungen in diesem Training.",
    drillCount: (count: number) => `${count} ${count === 1 ? "Übung" : "Übungen"}`,
    trainingBlock: "Trainingsblock",
    feedback: "Rückmeldung",
    feedbackLabels: { worked_well: "Gut funktioniert", needs_adjustment: "Anpassung nötig", not_effective: "Nicht wirksam" },
    noStatus: "Kein Status",
    effectiveness: "Wirksamkeit",
    noRating: "Keine Bewertung",
    drillNote: "Übungsnotiz",
    noDrills: "Keine Trainingsübungen gefunden",
    noDrillsHelper: "Du kannst die Trainerreflexion trotzdem speichern.",
    eyebrow: "Trainingsreflexion",
    fallbackTitle: "Trainingsreflexion",
    activeTeam: "Aktive Mannschaft",
    plan: "Plan",
    sectionTitle: "Trainerreflexion",
    trainingObjective: "Trainingsziel",
    objectiveOutcome: "Zielerreichung",
    overallQuality: "Gesamtqualität",
    intensity: "Intensität",
    playerResponse: "Reaktion der Spieler",
    playerResponseHelper: "Wie gut haben die Spieler den Trainingsschwerpunkt angenommen, verstanden und umgesetzt?",
    workedWell: "Was hat gut funktioniert?",
    workedWellHelper: "Was würdest du wieder so machen?",
    needsImprovement: "Was möchtest du anpassen?",
    needsImprovementHelper: "Was hat nicht wie geplant funktioniert - und warum?",
    nextTrainingNote: "Für das nächste Training mitnehmen",
    nextTrainingNoteHelper: "Ein konkreter Punkt, den du fortführen, verändern oder erneut aufgreifen möchtest.",
    objectiveLabels: {
      achieved: "Erreicht",
      partly_achieved: "Teilweise erreicht",
      not_achieved: "Nicht erreicht"
    },
    errors: {
      objectiveOutcome: "Wähle eine Zielerreichung.",
      overallQuality: "Wähle eine Bewertung für die Gesamtqualität.",
      intensity: "Wähle eine Bewertung für die Intensität.",
      playerResponse: "Wähle eine Bewertung für die Reaktion der Spieler."
    },
    summary: {
      attendance: "Anwesenheit",
      attendanceHelper: (absent: number, late: number) => `${absent} abwesend · ${late} zu spät`,
      ratings: "Bewertungen",
      ratingsHelper: "Anwesende Spieler bewertet",
      observations: "Beobachtungen",
      observationsHelper: "Spielerbeobachtungen zu diesem Training"
    }
  }
} satisfies Record<Locale, {
  back: string;
  unsaved: string;
  saved: string;
  saveFailed: string;
  leaveConfirmation: string;
  cancel: string;
  saving: string;
  save: string;
  drillFeedback: string;
  drillFeedbackHelper: string;
  drillCount: (count: number) => string;
  trainingBlock: string;
  feedback: string;
  feedbackLabels: Record<TrainingSessionDrillFeedbackStatus, string>;
  noStatus: string;
  effectiveness: string;
  noRating: string;
  drillNote: string;
  noDrills: string;
  noDrillsHelper: string;
  eyebrow: string;
  fallbackTitle: string;
  activeTeam: string;
  plan: string;
  sectionTitle: string;
  trainingObjective: string;
  objectiveOutcome: string;
  overallQuality: string;
  intensity: string;
  playerResponse: string;
  playerResponseHelper: string;
  workedWell: string;
  workedWellHelper: string;
  needsImprovement: string;
  needsImprovementHelper: string;
  nextTrainingNote: string;
  nextTrainingNoteHelper: string;
  objectiveLabels: Record<TrainingSessionObjectiveOutcome, string>;
  errors: Record<"objectiveOutcome" | "overallQuality" | "intensity" | "playerResponse", string>;
  summary: {
    attendance: string;
    attendanceHelper: (absent: number, late: number) => string;
    ratings: string;
    ratingsHelper: string;
    observations: string;
    observationsHelper: string;
  };
}>;
