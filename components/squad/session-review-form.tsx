"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Star } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { saveTrainingSessionReview, type SessionReviewActionState } from "@/lib/squad/session-review-actions";
import { drillFeedbackStatusLabels, objectiveOutcomeLabels } from "@/lib/squad/session-review";
import { formatDateLabel, trainingTimeRange } from "@/lib/trainings/utils";
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
  workedWell: string;
  needsImprovement: string;
  nextTrainingNote: string;
  drills: Record<string, DrillReviewValue>;
};

type ClientErrors = Partial<Record<"objectiveOutcome" | "overallQuality" | "intensity", string>>;

export function SessionReviewForm({
  event,
  review,
  drills,
  attendanceSummary,
  ratingsSummary,
  observationCount,
  planTitle
}: {
  event: SquadTrainingEventDetail;
  review: TrainingSessionReview | null;
  drills: ReviewDrill[];
  attendanceSummary: { present: number; absent: number; late: number; total: number };
  ratingsSummary: { rated: number; rateable: number };
  observationCount: number;
  planTitle?: string;
}) {
  const [state, formAction, isPending] = useActionState<SessionReviewActionState, FormData>(saveTrainingSessionReview, {});
  const [values, setValues] = useState<ReviewFormValues>(() => initialValues(review, drills));
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});
  const objectiveRef = useRef<HTMLDivElement>(null);
  const qualityRef = useRef<HTMLDivElement>(null);
  const intensityRef = useRef<HTMLDivElement>(null);
  const [baselineSignature, setBaselineSignature] = useState(() => JSON.stringify(initialValues(review, drills)));
  const currentSignature = useMemo(() => JSON.stringify(values), [values]);
  const isDirty = currentSignature !== baselineSignature;

  useEffect(() => {
    if (!isDirty || isPending) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "You have unsaved changes.";
      return "You have unsaved changes.";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isPending]);

  useEffect(() => {
    if (!isDirty || isPending) return;
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target || link.download || link.origin !== window.location.origin) return;
      if (link.href === window.location.href || link.href.startsWith(`${window.location.href}#`)) return;
      if (!window.confirm("You have unsaved review changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty, isPending]);

  useEffect(() => {
    if (!state.success) return;
    setBaselineSignature(currentSignature);
    setClientErrors({});
  }, [currentSignature, state.success, state.submissionId]);

  const mergedErrors = { ...state.fieldErrors, ...clientErrors };

  function validate() {
    const nextErrors: ClientErrors = {};
    if (!values.objectiveOutcome) nextErrors.objectiveOutcome = "Choose an outcome.";
    if (!values.overallQuality) nextErrors.overallQuality = "Choose a quality rating.";
    if (!values.intensity) nextErrors.intensity = "Choose an intensity rating.";
    setClientErrors(nextErrors);
    const first = Object.keys(nextErrors)[0] as keyof ClientErrors | undefined;
    if (first) {
      const refs = { objectiveOutcome: objectiveRef, overallQuality: qualityRef, intensity: intensityRef };
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
        if (!validate()) event.preventDefault();
      }}
      className="space-y-6"
    >
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="objectiveOutcome" value={values.objectiveOutcome} />
      <input type="hidden" name="overallQuality" value={values.overallQuality} />
      <input type="hidden" name="intensity" value={values.intensity} />
      <textarea hidden readOnly name="workedWell" value={values.workedWell} />
      <textarea hidden readOnly name="needsImprovement" value={values.needsImprovement} />
      <textarea hidden readOnly name="nextTrainingNote" value={values.nextTrainingNote} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/trainings/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
          <ArrowLeft className="h-4 w-4" />
          Back to training
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty ? <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Unsaved changes</span> : null}
          {state.success ? <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-green-700"><CheckCircle2 className="h-4 w-4" />Saved</span> : null}
          <ButtonLink href={`/trainings/${event.id}`} variant="secondary">Cancel</ButtonLink>
          <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save review"}</Button>
        </div>
      </div>

      {state.error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p> : null}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold uppercase text-board-green">CoachBoard Session Review &amp; Coach Reflection</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{event.label || "Training review"}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-slate-600">
          <span className="rounded-md bg-slate-100 px-2 py-1">{formatDateLabel(event.date)} · {trainingTimeRange(event)}</span>
          <span className="rounded-md bg-slate-100 px-2 py-1">{event.squadName ?? "Active Team"}</span>
          {event.focus ? <span className="rounded-md bg-slate-100 px-2 py-1">{event.focus}</span> : null}
          {planTitle ? <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">Plan: {planTitle}</span> : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Attendance" value={`${attendanceSummary.present + attendanceSummary.late}/${attendanceSummary.total}`} helper={`${attendanceSummary.absent} absent · ${attendanceSummary.late} late`} />
        <SummaryCard label="Ratings" value={`${ratingsSummary.rated}/${ratingsSummary.rateable}`} helper="Present players rated" />
        <SummaryCard label="Observations" value={String(observationCount)} helper="Player observations linked to this training" />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-xl font-bold text-board-navy"><ClipboardCheck className="h-5 w-5" />Session outcome</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <RequiredChoice
            refTarget={objectiveRef}
            label="Objective outcome"
            error={mergedErrors.objectiveOutcome}
            options={objectiveOutcomes.map((option) => ({ value: option, label: objectiveOutcomeLabels[option] }))}
            value={values.objectiveOutcome}
            onChange={(value) => setValues((current) => ({ ...current, objectiveOutcome: value as TrainingSessionObjectiveOutcome }))}
          />
          <RatingPicker refTarget={qualityRef} label="Overall quality" value={values.overallQuality} error={mergedErrors.overallQuality} onChange={(value) => setValues((current) => ({ ...current, overallQuality: value }))} />
          <RatingPicker refTarget={intensityRef} label="Intensity" value={values.intensity} error={mergedErrors.intensity} onChange={(value) => setValues((current) => ({ ...current, intensity: value }))} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <TextArea label="What worked well?" value={values.workedWell} onChange={(value) => setValues((current) => ({ ...current, workedWell: value }))} />
          <TextArea label="Needs improvement" value={values.needsImprovement} onChange={(value) => setValues((current) => ({ ...current, needsImprovement: value }))} />
          <TextArea label="Next training note" value={values.nextTrainingNote} onChange={(value) => setValues((current) => ({ ...current, nextTrainingNote: value }))} />
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-board-navy">Drill feedback</h2>
            <p className="text-sm text-slate-600">Optional feedback for the drill instances used in this training.</p>
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{drills.length} drill{drills.length === 1 ? "" : "s"}</span>
        </div>
        {drills.length ? (
          <div className="mt-4 space-y-3">
            {drills.map((drill) => {
              const value = values.drills[drill.id] ?? emptyDrillReview();
              return (
                <article key={drill.id} className="rounded-lg border border-board-line bg-board-paper p-4">
                  <input type="hidden" name="drillInstanceId" value={drill.id} />
                  <input type="hidden" name={`drillStatus:${drill.id}`} value={value.feedbackStatus} />
                  <input type="hidden" name={`drillRating:${drill.id}`} value={value.effectivenessRating} />
                  <textarea hidden readOnly name={`drillNote:${drill.id}`} value={value.note} />
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                    <div>
                      <h3 className="font-bold text-board-navy">{drill.title}</h3>
                      <p className="text-xs font-semibold text-slate-500">{drill.block ?? "Training block"}{drill.plannedDurationMinutes ? ` · ${drill.plannedDurationMinutes} min` : ""}</p>
                    </div>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Feedback</span>
                      <select
                        value={value.feedbackStatus}
                        onChange={(event) => updateDrillValue(setValues, drill.id, { feedbackStatus: event.target.value as DrillReviewValue["feedbackStatus"] })}
                        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
                      >
                        <option value="">No status</option>
                        {feedbackStatuses.map((status) => <option key={status} value={status}>{drillFeedbackStatusLabels[status]}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Effectiveness</span>
                      <select
                        value={value.effectivenessRating}
                        onChange={(event) => updateDrillValue(setValues, drill.id, { effectivenessRating: event.target.value ? Number.parseInt(event.target.value, 10) : "" })}
                        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
                      >
                        <option value="">No rating</option>
                        {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}
                      </select>
                    </label>
                  </div>
                  <TextArea
                    className="mt-3"
                    label="Drill note"
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
            <h3 className="font-bold text-board-navy">No session drills found</h3>
            <p className="mt-1 text-sm text-slate-600">You can still save the overall coach reflection.</p>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {isDirty ? <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Unsaved changes</span> : null}
        <ButtonLink href={`/trainings/${event.id}`} variant="secondary">Cancel</ButtonLink>
        <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save review"}</Button>
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

function RatingPicker({
  refTarget,
  label,
  value,
  error,
  onChange
}: {
  refTarget: RefObject<HTMLDivElement | null>;
  label: string;
  value: number | "";
  error?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div ref={refTarget} tabIndex={-1} className="rounded-md focus:outline-none focus:ring-4 focus:ring-green-100">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(rating)}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-md border text-sm font-black transition ${value === rating ? "border-board-green bg-green-50 text-board-green" : "border-board-line bg-white text-board-navy hover:border-board-green"}`}
            aria-label={`${label} ${rating}`}
          >
            <Star className={`h-4 w-4 ${value === rating ? "fill-current" : ""}`} />
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 4, className = "" }: { label: string; value: string; onChange: (value: string) => void; rows?: number; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
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
