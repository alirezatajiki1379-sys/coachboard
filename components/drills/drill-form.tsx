"use client";

import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { ageGroups, drillTypes, mainFocuses, trainingBlocks } from "@/config/options";
import { Button, ButtonLink } from "@/components/ui/button";
import { DrillEditor } from "@/components/drills/drill-editor";
import { useUnsavedChangesProtection } from "@/components/shared/use-unsaved-changes-protection";
import { useLocalDraft } from "@/components/shared/local-draft";
import { parseEditorJsonString } from "@/lib/drills/editor";
import { detectMaterialsFromGraphic, materialCategoryLabel, materialDisplayGroups, materialLineLabel, materialsToJson, parseMaterials, serializeMaterials } from "@/lib/drills/materials";
import { parseSetupNumberInput } from "@/lib/drills/setup";
import type { DrillActionState } from "@/lib/drills/actions";
import { snapshotDrillFormValues, validateDrillFormFields, type DrillFormField, type DrillFormValues, type DrillValidationErrors } from "@/lib/drills/form";
import { formatCustomAgeRange } from "@/lib/drills/age-suitability";
import type { Drill, MaterialColor, MaterialItem, MaterialType } from "@/types/domain";

type DrillFormProps = {
  action: (state: DrillActionState, formData: FormData) => Promise<DrillActionState>;
  drill?: Drill;
  mode: "create" | "edit";
  graphicJson?: string;
  defaultReturnTo?: string;
  cancelHref?: string;
  hiddenFields?: Record<string, string>;
  contextBanner?: ReactNode;
};

const initialActionState: DrillActionState = {};
const materialTypes: MaterialType[] = ["balls", "cones", "flat_markers", "bibs", "rings", "goals", "mini_goals", "poles", "mannequins", "other"];
const materialColors: Array<MaterialColor | ""> = ["", "Red", "Blue", "Yellow", "Green", "White", "Black", "Orange", "Purple"];
const materialVariantOptions: Partial<Record<MaterialType, string[]>> = {
  balls: ["football", "small football", "tennis ball", "basketball"],
  cones: ["striped"],
  bibs: ["classic", "tall"],
  goals: ["normal goal", "youth goal"]
};

const validationFieldOrder: DrillFormField[] = [
  "title",
  "subFocus",
  "mainFocus",
  "drillType",
  "durationMinutes",
  "minPlayers",
  "maxPlayers",
  "shortDescription",
  "ageGroups",
  "minimumAge",
  "maximumAge",
  "trainingBlocks",
  "organization",
  "coachingPoints",
  "variations",
  "easierVersion",
  "harderVersion",
  "materials",
  "setupAreaLength",
  "setupAreaWidth",
  "setupParameters",
  "setupNotes",
  "difficultyLevel",
  "intensityLevel",
  "tags",
  "isFavorite"
];

const fieldLabels: Partial<Record<DrillFormField, string>> = {
  title: "Drill title",
  mainFocus: "Main focus",
  drillType: "Drill type",
  durationMinutes: "Duration",
  minPlayers: "Minimum players",
  maxPlayers: "Maximum players",
  ageGroups: "Age suitability",
  minimumAge: "Minimum age",
  maximumAge: "Maximum age",
  trainingBlocks: "Training section",
  tags: "Tags"
};

type SetupParameterRow = {
  id: string;
  label: string;
  value: string;
};

export function DrillForm({ action, drill, mode, graphicJson, defaultReturnTo = "", cancelHref, hiddenFields, contextBanner }: DrillFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  const initialValues = useMemo(() => getInitialValues(drill, graphicJson), [drill, graphicJson]);
  const [values, setValues] = useState<DrillFormValues>(() => state.values ?? initialValues);
  const [formRevision, setFormRevision] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnTo, setReturnTo] = useState(defaultReturnTo);
  const [clientErrors, setClientErrors] = useState<DrillValidationErrors | null>(null);
  const [validationMessage, setValidationMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const returnToInputRef = useRef<HTMLInputElement>(null);
  const fieldErrors = clientErrors ?? state.fieldErrors ?? {};
  const orderedErrorEntries = orderedDrillErrorEntries(fieldErrors);
  const draftKey = `coachboard:draft:drill:${drill?.id ?? "new"}`;

  const readDraftData = useCallback(
    () => getCurrentDrillFormValues(formRef.current, values),
    [values]
  );

  const {
    clearDraft,
    indicator: autosaveIndicator,
    recoveryDialog,
    saveDraftNow
  } = useLocalDraft<DrillFormValues>({
    draftKey,
    entityType: "drill",
    entityId: drill?.id,
    baseUpdatedAt: drill?.updatedAt,
    isDirty,
    initialData: initialValues,
    getData: readDraftData,
    hasMeaningfulDraft: hasMeaningfulDrillDraft,
    recoveryTitle: "Continue your unfinished Drill?",
    recoveryDescription: "CoachBoard found unsaved changes from your previous Drill editing session.",
    recoverLabel: "Continue draft",
    discardLabel: "Discard draft",
    onRecover: (draftValues) => {
      setValues(draftValues);
      setFormRevision((current) => current + 1);
      setIsDirty(true);
    }
  });

  const { dialog: unsavedChangesDialog, dismissDialog: dismissUnsavedChangesDialog } = useUnsavedChangesProtection({
    isDirty,
    isSaving: isSubmitting || isPending,
    onSaveDraftAndLeave: (href) => {
      const form = formRef.current;
      if (!form) {
        saveDraftNow();
        window.location.href = href;
        return;
      }
      const formData = new FormData(form);
      formData.set("intent", "saveDraft");
      formData.set("returnTo", href);
      setIsSubmitting(true);
      startTransition(() => {
        void action(initialActionState, formData);
      });
    }
  });

  useEffect(() => {
    setValues(state.values ?? initialValues);
    setFormRevision((current) => current + 1);
  }, [initialValues, state.values]);

  useEffect(() => {
    const nextErrors = state.fieldErrors;
    if (!nextErrors) return;
    setClientErrors(nextErrors);
    setValidationMessage(validationSummaryMessage(nextErrors, mode));
    window.setTimeout(() => navigateToFirstValidationError(formRef.current, nextErrors), 0);
  }, [mode, state.fieldErrors, state.submissionId]);

  useEffect(() => {
    if (state.error) {
      setIsSubmitting(false);
      setIsDirty(true);
      setReturnTo("");
      dismissUnsavedChangesDialog();
    }
  }, [state.error, state.submissionId, dismissUnsavedChangesDialog]);

  useEffect(() => {
    if (!isSubmitting) return;

    const handlePageHide = () => {
      clearDraft();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [clearDraft, isSubmitting]);

  function markDirty() {
    setIsDirty(true);
  }

  function refreshValidationErrors() {
    const form = formRef.current;
    if (!form || !clientErrors) return;
    window.setTimeout(() => {
      const nextErrors = validateDrillFormFields(new FormData(form));
      setClientErrors(Object.keys(nextErrors).length ? nextErrors : {});
      setValidationMessage(Object.keys(nextErrors).length ? validationSummaryMessage(nextErrors, mode) : "");
    }, 0);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter.value : "";
    if (intent === "saveDraft") {
      setIsSubmitting(true);
      return;
    }

    const form = event.currentTarget;
    const nextErrors = validateDrillFormFields(new FormData(form));
    if (Object.keys(nextErrors).length) {
      event.preventDefault();
      event.stopPropagation();
      setIsSubmitting(false);
      setClientErrors(nextErrors);
      setValidationMessage(validationSummaryMessage(nextErrors, mode));
      window.setTimeout(() => navigateToFirstValidationError(form, nextErrors), 0);
      return;
    }

    setClientErrors({});
    setValidationMessage("");
    setIsSubmitting(true);
  }

  return (
    <form
      key={`${state.submissionId ?? 0}-${formRevision}-${drill?.id ?? "new-drill"}`}
      ref={formRef}
      action={formAction}
      noValidate
      className="space-y-6"
      onInputCapture={() => {
        markDirty();
        refreshValidationErrors();
      }}
      onChangeCapture={() => {
        markDirty();
        refreshValidationErrors();
      }}
      onSubmit={handleSubmit}
    >
      {drill ? <input type="hidden" name="drillId" value={drill.id} /> : null}
      <input ref={returnToInputRef} type="hidden" name="returnTo" value={returnTo} readOnly />
      {hiddenFields ? Object.entries(hiddenFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} readOnly />) : null}
      {unsavedChangesDialog}
      {recoveryDialog}
      {contextBanner}

      <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <p className="text-sm text-slate-600">
          Fields marked with <span className="font-bold text-red-600">*</span> are required.
        </p>
        {state?.error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
      </div>

      {state?.error ? (
        <div className="sr-only" role="alert">
          {state.error}
        </div>
      ) : null}

      {orderedErrorEntries.length ? (
        <ValidationSummary
          message={validationMessage || validationSummaryMessage(fieldErrors, mode)}
          errors={orderedErrorEntries}
          onNavigate={(field) => navigateToValidationField(formRef.current, field)}
        />
      ) : null}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Core details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput name="title" label="Title" required defaultValue={values.title} error={fieldErrors.title} />
          <TextInput name="subFocus" label="Sub focus" defaultValue={values.subFocus} error={fieldErrors.subFocus} />
          <SelectInput
            name="mainFocus"
            label="Main focus"
            required
            defaultValue={values.mainFocus}
            options={mainFocuses}
            error={fieldErrors.mainFocus}
          />
          <SelectInput
            name="drillType"
            label="Drill type"
            required
            defaultValue={values.drillType}
            options={drillTypes}
            error={fieldErrors.drillType}
          />
          <NumberInput
            name="durationMinutes"
            label="Duration in minutes"
            required
            defaultValue={values.durationMinutes}
            min={1}
            error={fieldErrors.durationMinutes}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberInput
              name="minPlayers"
              label="Minimum players"
              required
              defaultValue={values.minPlayers}
              min={1}
              error={fieldErrors.minPlayers}
            />
            <NumberInput
              name="maxPlayers"
              label="Maximum players"
              required
              defaultValue={values.maxPlayers}
              min={1}
              error={fieldErrors.maxPlayers}
            />
          </div>
        </div>
        <TextArea name="shortDescription" label="Short description" rows={3} defaultValue={values.shortDescription} />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Categorization</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <AgeSuitabilityInput
            selectedMode={values.ageMode}
            selectedPresets={values.ageGroups ?? []}
            minimumAge={values.minimumAge ?? ""}
            maximumAge={values.maximumAge ?? ""}
            error={fieldErrors.ageGroups}
            minimumError={fieldErrors.minimumAge}
            maximumError={fieldErrors.maximumAge}
            onDirty={markDirty}
          />
          <CheckboxGroup
            name="trainingBlocks"
            label="Training blocks"
            required
            options={trainingBlocks}
            selected={values.trainingBlocks}
            error={fieldErrors.trainingBlocks}
          />
        </div>
      </section>

      <DrillEditor initialValue={values.graphicJson} onDirty={markDirty} />

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Setup</h2>
        <p className="mt-1 text-sm text-slate-500">
          Optional pitch-side details for print, PDF and Field View. Measurements are only shown when you enter them.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <NumberInput
            name="setupAreaLength"
            label="Area length in meters"
            defaultValue={values.setupAreaLength}
            min={0}
            step="0.1"
          />
          <NumberInput
            name="setupAreaWidth"
            label="Area width in meters"
            defaultValue={values.setupAreaWidth}
            min={0}
            step="0.1"
          />
        </div>
        <SetupParametersEditor initialValue={values.setupParametersJson} onDirty={markDirty} />
        <TextArea name="setupNotes" label="Setup notes" rows={3} defaultValue={values.setupNotes} help="Practical setup instructions that should appear on printable coaching sheets." />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Coaching content</h2>
        <div className="mt-4 grid gap-4">
          <TextArea name="organization" label="Detailed organization" rows={5} defaultValue={values.organization} />
          <TextArea name="coachingPoints" label="Coaching points" rows={4} defaultValue={values.coachingPoints} />
          <TextArea name="variations" label="Variations" rows={4} defaultValue={values.variations} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextArea name="easierVersion" label="Easier version" rows={4} defaultValue={values.easierVersion} />
            <TextArea name="harderVersion" label="Harder version" rows={4} defaultValue={values.harderVersion} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Materials and levels</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <MaterialListEditor initialMaterialsText={values.materials} initialMaterialsJson={values.materialsJson} initialGraphicJson={values.graphicJson} onDirty={markDirty} />
          </div>
          <div className="grid gap-4 md:col-span-2 md:grid-cols-2 lg:grid-cols-4">
            <NumberInput name="difficultyLevel" label="Difficulty level" defaultValue={values.difficultyLevel} min={1} max={5} />
            <NumberInput name="intensityLevel" label="Intensity level" defaultValue={values.intensityLevel} min={1} max={5} />
            <TagsInput defaultValue={values.tags} error={fieldErrors.tags} onDirty={markDirty} />
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="isFavorite"
                defaultChecked={values.isFavorite}
                className="h-4 w-4 rounded border-board-line text-board-green"
              />
              Mark as favorite
            </label>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        {autosaveIndicator}
        <ButtonLink href={cancelHref ?? (drill ? `/drills/${drill.id}` : "/drills")} variant="secondary" className="justify-center">
          Cancel
        </ButtonLink>
        <Button type="submit" name="intent" value="saveDraft" variant="secondary" disabled={isPending} className="justify-center">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save draft
        </Button>
        {drill?.status === "draft" ? (
          <Button type="submit" name="intent" value="publish" disabled={isPending} className="justify-center">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Publish Drill
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending} className="justify-center">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "Create drill" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

type MaterialRow = MaterialItem & { id: string };

function getCurrentDrillFormValues(form: HTMLFormElement | null, fallback: DrillFormValues) {
  if (!form) return fallback;
  return snapshotDrillFormValues(new FormData(form));
}

function hasMeaningfulDrillDraft(draft: DrillFormValues, initial: DrillFormValues) {
  return stableDraftString(normalizeDrillDraftValues(draft, initial)) !== stableDraftString(normalizeDrillDraftValues(initial, initial));
}

function normalizeDrillDraftValues(values: DrillFormValues, fallback: DrillFormValues) {
  const ageMode = values.ageMode === "preset" || values.ageMode === "custom_range" ? values.ageMode : "all_ages";
  const graphic = parseEditorJsonString(values.graphicJson);

  return {
    title: normalizedText(values.title),
    shortDescription: normalizedText(values.shortDescription),
    organization: normalizedText(values.organization),
    coachingPoints: normalizedText(values.coachingPoints),
    variations: normalizedText(values.variations),
    easierVersion: normalizedText(values.easierVersion),
    harderVersion: normalizedText(values.harderVersion),
    ageMode,
    ageGroups: ageMode === "preset" ? normalizedList(values.ageGroups) : [],
    minimumAge: ageMode === "custom_range" ? normalizedOptionalAge(values.minimumAge) : null,
    maximumAge: ageMode === "custom_range" ? normalizedOptionalAge(values.maximumAge) : null,
    mainFocus: normalizedText(values.mainFocus),
    subFocus: normalizedText(values.subFocus),
    trainingBlocks: normalizedList(values.trainingBlocks),
    drillType: normalizedText(values.drillType),
    durationMinutes: normalizedNumber(values.durationMinutes, normalizedNumber(fallback.durationMinutes, 10)),
    minPlayers: normalizedNumber(values.minPlayers, normalizedNumber(fallback.minPlayers, 1)),
    maxPlayers: normalizedNumber(values.maxPlayers, normalizedNumber(fallback.maxPlayers, 12)),
    materials: normalizedMaterials(values),
    setupAreaLength: normalizedSetupNumber(values.setupAreaLength),
    setupAreaWidth: normalizedSetupNumber(values.setupAreaWidth),
    setupParameters: normalizedSetupParameters(values.setupParametersJson),
    setupNotes: normalizedText(values.setupNotes),
    difficultyLevel: normalizedNumber(values.difficultyLevel, normalizedNumber(fallback.difficultyLevel, 3)),
    intensityLevel: normalizedNumber(values.intensityLevel, normalizedNumber(fallback.intensityLevel, 3)),
    tags: parseTagInput(values.tags).map((tag) => tag.toLowerCase()).sort(),
    isFavorite: Boolean(values.isFavorite),
    graphic: {
      pitch: graphic.pitch,
      pitchStyle: graphic.pitchStyle,
      objects: graphic.objects.map((object) => {
        const normalized: Record<string, unknown> = { ...object };
        delete normalized.id;
        delete normalized.groupId;
        return normalized;
      })
    }
  };
}

function normalizedText(value: string | undefined) {
  return value?.trim() ?? "";
}

function normalizedList(values: readonly string[] | undefined) {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).sort();
}

function normalizedNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedOptionalAge(value: string | undefined) {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedSetupNumber(value: string | undefined) {
  return parseSetupNumberInput(value ?? "") ?? null;
}

function normalizedSetupParameters(value: string | undefined) {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item) => ({
        label: typeof item.label === "string" ? item.label.trim() : "",
        value: typeof item.value === "string" ? normalizedSetupNumber(item.value) : typeof item.value === "number" ? normalizedSetupNumber(String(item.value)) : null
      }))
      .filter((item) => item.label && item.value != null)
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

function normalizedMaterials(values: DrillFormValues) {
  return materialsToJson(parseMaterialsJsonSafe(values.materialsJson) ?? parseMaterials(values.materials));
}

function stableDraftString(value: unknown) {
  return JSON.stringify(value);
}

function ValidationSummary({
  message,
  errors,
  onNavigate
}: {
  message: string;
  errors: Array<{ field: DrillFormField; label: string; message: string }>;
  onNavigate: (field: DrillFormField) => void;
}) {
  return (
    <section
      role="alert"
      aria-live="polite"
      className="scroll-mt-28 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-soft"
    >
      <h2 className="font-bold text-red-900">{message}</h2>
      <ul className="mt-2 space-y-1">
        {errors.map((error) => (
          <li key={error.field}>
            <button
              type="button"
              onClick={() => onNavigate(error.field)}
              className="rounded text-left font-medium underline decoration-red-300 underline-offset-4 outline-none transition hover:text-red-950 focus:ring-2 focus:ring-red-300"
            >
              {error.label}: {error.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function orderedDrillErrorEntries(errors: DrillValidationErrors) {
  return validationFieldOrder
    .filter((field) => Boolean(errors[field]))
    .map((field) => ({
      field,
      label: fieldLabels[field] ?? "Field",
      message: errors[field] ?? ""
    }));
}

function validationSummaryMessage(errors: DrillValidationErrors, mode: "create" | "edit") {
  const count = orderedDrillErrorEntries(errors).length;
  const action = mode === "create" ? "creating" : "saving";
  return `Please correct ${count} ${count === 1 ? "field" : "fields"} before ${action} this Drill.`;
}

function navigateToFirstValidationError(form: HTMLFormElement | null, errors: DrillValidationErrors) {
  const firstField = orderedDrillErrorEntries(errors)[0]?.field;
  if (firstField) navigateToValidationField(form, firstField);
}

function navigateToValidationField(form: HTMLFormElement | null, field: DrillFormField) {
  if (!form) return;
  const target = validationTarget(form, field);
  if (!target) return;

  target.container.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center"
  });

  window.setTimeout(() => target.control.focus({ preventScroll: true }), 250);
}

function validationTarget(form: HTMLFormElement, field: DrillFormField) {
  const fieldsToTry = targetFieldCandidates(field);
  for (const targetField of fieldsToTry) {
    const container = form.querySelector<HTMLElement>(`[data-validation-field="${targetField}"]`);
    const control = container?.querySelector<HTMLElement>("[data-validation-control]");
    if (container && control) return { container, control };
  }
  return null;
}

function targetFieldCandidates(field: DrillFormField): DrillFormField[] {
  if (field === "ageGroups") return ["minimumAge", "ageGroups"];
  return [field];
}

function MaterialListEditor({
  initialMaterialsText,
  initialMaterialsJson,
  initialGraphicJson,
  onDirty
}: {
  initialMaterialsText: string;
  initialMaterialsJson: string;
  initialGraphicJson: string;
  onDirty: () => void;
}) {
  const initialRows = useMemo(() => toMaterialRows(parseMaterialsJsonSafe(initialMaterialsJson) ?? parseMaterials(initialMaterialsText)), [initialMaterialsJson, initialMaterialsText]);
  const initialDetected = useMemo(() => detectFromJson(initialGraphicJson), [initialGraphicJson]);
  const [rows, setRows] = useState<MaterialRow[]>(initialRows);
  const [detected, setDetected] = useState<MaterialItem[]>(initialDetected);
  const materials = rows.map(stripMaterialRowId);
  const rowGroups = groupMaterialRows(rows);
  const detectedGroups = groupMaterialItems(detected);

  function updateFromGraphic() {
    const input = document.querySelector<HTMLInputElement>('input[name="graphicJson"]');
    const nextDetected = detectFromJson(input?.value ?? initialGraphicJson);
    setDetected(nextDetected);
    setRows(toMaterialRows(nextDetected));
    onDirty();
  }

  function updateRow(id: string, patch: Partial<MaterialItem>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch, source: row.source ?? "manual" } : row)));
    onDirty();
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: "other",
        quantity: 1,
        label: "",
        source: "manual"
      }
    ]);
    onDirty();
  }

  function deleteRow(id: string) {
    setRows((current) => current.filter((item) => item.id !== id));
    onDirty();
  }

  return (
    <div>
      <input type="hidden" name="materialsJson" value={JSON.stringify(materialsToJson(materials))} readOnly />
      <textarea name="materials" value={serializeMaterials(materials)} readOnly hidden />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Required materials</h3>
          <p className="mt-1 text-xs text-slate-500">
            Edit the final list used by sessions and print plans. “Update from graphic” replaces this list with equipment detected on the pitch.
          </p>
        </div>
        <Button type="button" variant="secondary" className="h-9 px-3" onClick={updateFromGraphic}>
          <RefreshCw className="h-4 w-4" />
          Update from graphic
        </Button>
      </div>

      <div className="mt-3 rounded-md border border-board-line bg-board-paper p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Auto-detected from graphic</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {detectedGroups.length ? (
            detectedGroups.map((group) => (
              <div key={group.category} className="rounded-md bg-white p-3 ring-1 ring-board-line">
                <p className="text-xs font-bold uppercase text-slate-500">{materialCategoryLabel(group.category)}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                  {group.items.map((item) => (
                    <span key={`${item.type}-${item.color ?? ""}-${item.variant ?? ""}-${item.label ?? ""}`} className="rounded-full bg-board-paper px-2 py-1">
                      {materialLineLabel(item)}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <span className="text-sm text-slate-500">No material objects detected yet. Add cones, balls, goals, bibs, poles, markers, rings, or mannequins to the graphic.</span>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-4">
        {rowGroups.length ? (
          rowGroups.map((group) => (
            <section key={group.category} className="rounded-md border border-board-line bg-board-paper p-3">
              <h4 className="text-sm font-bold text-board-navy">{materialCategoryLabel(group.category)}</h4>
              <div className="mt-3 space-y-3">
                {group.items.map((row) => (
                  <MaterialRowEditor key={row.id} row={row} onUpdate={updateRow} onDelete={deleteRow} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-board-line bg-white p-4 text-sm text-slate-500">
            No final materials yet. Add a custom row or update from the graphic after drawing the drill setup.
          </div>
        )}
      </div>

      <Button type="button" variant="secondary" className="mt-3" onClick={addRow}>
        <Plus className="h-4 w-4" />
        Add material
      </Button>
    </div>
  );
}

function SetupParametersEditor({ initialValue, onDirty }: { initialValue: string; onDirty: () => void }) {
  const [rows, setRows] = useState<SetupParameterRow[]>(() => parseSetupParameterRows(initialValue));
  const normalizedRows = rows
    .map((row) => ({
      id: row.id,
      label: row.label.trim(),
      value: parseSetupNumberInput(row.value),
      unit: "m" as const
    }))
    .filter((row) => row.label && row.value != null);

  function updateRow(id: string, patch: Partial<SetupParameterRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    onDirty();
  }

  function addRow() {
    setRows((current) => [...current, { id: crypto.randomUUID(), label: "", value: "" }]);
    onDirty();
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    onDirty();
  }

  return (
    <div className="mt-4">
      <input type="hidden" name="setupParametersJson" value={JSON.stringify(normalizedRows)} readOnly />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Setup parameters</h3>
          <p className="mt-1 text-xs text-slate-500">Add distances like cone distance, gate width or line spacing. No distances are guessed from the drawing.</p>
        </div>
        <Button type="button" variant="secondary" className="h-9 px-3" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add parameter
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="grid gap-2 rounded-md border border-board-line bg-board-paper p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
            <label>
              <span className="text-xs font-semibold text-slate-500">Label</span>
              <input
                value={row.label}
                onChange={(event) => updateRow(row.id, { label: event.target.value })}
                placeholder="Cone distance"
                className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
              />
            </label>
            <label>
              <span className="text-xs font-semibold text-slate-500">Meters</span>
              <input
                value={row.value}
                onChange={(event) => updateRow(row.id, { value: event.target.value })}
                inputMode="decimal"
                placeholder="5"
                className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
              />
            </label>
            <Button type="button" variant="danger" className="h-10 px-3" onClick={() => removeRow(row.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )) : (
          <p className="rounded-md border border-dashed border-board-line bg-board-paper p-3 text-sm text-slate-500">No setup parameters yet.</p>
        )}
      </div>
    </div>
  );
}

function parseSetupParameterRows(value: string): SetupParameterRow[] {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const label = typeof item.label === "string" ? item.label : "";
      const rawValue = typeof item.value === "number" ? String(item.value) : typeof item.value === "string" ? item.value : "";
      return [{ id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(), label, value: rawValue }];
    });
  } catch {
    return [];
  }
}

function MaterialRowEditor({
  row,
  onUpdate,
  onDelete
}: {
  row: MaterialRow;
  onUpdate: (id: string, patch: Partial<MaterialItem>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-board-line bg-white p-3 lg:grid-cols-[80px_minmax(140px,1fr)_120px_minmax(130px,1fr)_minmax(130px,1fr)_auto] lg:items-end">
      <label className="min-w-0">
        <span className="text-xs font-semibold text-slate-500">Qty</span>
        <input
          type="number"
          min={1}
          value={row.quantity}
          onChange={(event) => onUpdate(row.id, { quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1), source: "manual" })}
          className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
        />
      </label>
      <label className="min-w-0">
        <span className="text-xs font-semibold text-slate-500">Material</span>
        <select
          value={row.type}
          onChange={(event) => onUpdate(row.id, materialTypePatch(row, event.target.value as MaterialType))}
          className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
        >
          {materialTypes.map((type) => (
            <option key={type} value={type}>{materialCategoryLabel(type)}</option>
          ))}
        </select>
      </label>
      <label className="min-w-0">
        <span className="text-xs font-semibold text-slate-500">Color</span>
        <select
          value={row.color ?? ""}
          onChange={(event) => onUpdate(row.id, { color: event.target.value ? (event.target.value as MaterialColor) : undefined, source: "manual" })}
          className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
        >
          {materialColors.map((color) => (
            <option key={color || "none"} value={color}>{color || "None"}</option>
          ))}
        </select>
      </label>
      <VariantInput row={row} onUpdate={onUpdate} />
      <label className="min-w-0">
        <span className="text-xs font-semibold text-slate-500">Label</span>
        <input
          value={row.label ?? ""}
          onChange={(event) => onUpdate(row.id, { label: event.target.value || undefined, source: "manual" })}
          placeholder="optional note"
          className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
        />
      </label>
      <Button type="button" variant="danger" className="h-10 px-3" onClick={() => onDelete(row.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function VariantInput({
  row,
  onUpdate
}: {
  row: MaterialRow;
  onUpdate: (id: string, patch: Partial<MaterialItem>) => void;
}) {
  const options = materialVariantOptions[row.type];
  if (!options) {
    if (row.type !== "other") {
      return (
        <label className="min-w-0">
          <span className="text-xs font-semibold text-slate-500">Variant</span>
          <input
            value=""
            disabled
            placeholder="None"
            className="mt-1 h-10 w-full rounded-md border border-board-line bg-slate-50 px-3 text-sm text-slate-400"
          />
        </label>
      );
    }
    return (
      <label className="min-w-0">
        <span className="text-xs font-semibold text-slate-500">Variant</span>
        <input
          value={row.variant ?? ""}
          onChange={(event) => onUpdate(row.id, { variant: event.target.value || undefined, source: "manual" })}
          placeholder="optional"
          className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
        />
      </label>
    );
  }

  return (
    <label className="min-w-0">
      <span className="text-xs font-semibold text-slate-500">Variant</span>
      <select
        value={options.includes(row.variant ?? "") ? row.variant ?? "" : ""}
        onChange={(event) => onUpdate(row.id, { variant: event.target.value || undefined, source: "manual" })}
        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
      >
        <option value="">None / default</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function materialTypePatch(row: MaterialRow, nextType: MaterialType): Partial<MaterialItem> {
  const nextVariants = materialVariantOptions[nextType] ?? [];
  const nextVariant = nextVariants.includes(row.variant ?? "") ? row.variant : nextType === "balls" ? "football" : undefined;
  return {
    type: nextType,
    variant: nextVariant,
    label: shouldClearMaterialLabel(row) ? undefined : row.label,
    source: "manual"
  };
}

function shouldClearMaterialLabel(row: MaterialRow) {
  if (!row.label) return false;
  const label = row.label.trim().toLowerCase();
  if (row.source === "graphic") return true;
  return label === "custom material" || label === "custom label";
}

function detectFromJson(graphicJson: string) {
  return detectMaterialsFromGraphic(parseEditorJsonString(graphicJson));
}

function groupMaterialRows(rows: MaterialRow[]) {
  return materialDisplayGroups(rows);
}

function groupMaterialItems(items: MaterialItem[]) {
  return materialDisplayGroups(items);
}

function toMaterialRows(materials: MaterialItem[]): MaterialRow[] {
  return materials.map((material) => ({ ...material, id: crypto.randomUUID() }));
}

function parseMaterialsJsonSafe(value: string) {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item): MaterialItem => ({
        type: materialTypes.includes(item.type as MaterialType) ? (item.type as MaterialType) : "other",
        color: materialColors.includes(item.color as MaterialColor) ? (item.color as MaterialColor) : undefined,
        label: typeof item.label === "string" ? item.label : undefined,
        variant: typeof item.variant === "string" ? item.variant : undefined,
        source: item.source === "graphic" || item.source === "manual" ? item.source : undefined,
        quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1
      }));
  } catch {
    return null;
  }
}

function stripMaterialRowId(row: MaterialRow): MaterialItem {
  return {
    type: row.type,
    color: row.color,
    label: row.label,
    variant: row.variant,
    source: row.source,
    quantity: row.quantity
  };
}

function getInitialValues(drill?: Drill, graphicJson = ""): DrillFormValues {
  return {
    title: drill?.title ?? "",
    shortDescription: drill?.shortDescription ?? "",
    organization: drill?.organization ?? "",
    coachingPoints: drill?.coachingPoints ?? "",
    variations: drill?.variations ?? "",
    easierVersion: drill?.easierVersion ?? "",
    harderVersion: drill?.harderVersion ?? "",
    ageMode: drill?.ageMode ?? "all_ages",
    ageGroups: drill?.ageMode === "preset" ? drill.ageGroups : [],
    minimumAge: drill?.minimumAge ? String(drill.minimumAge) : "",
    maximumAge: drill?.maximumAge ? String(drill.maximumAge) : "",
    mainFocus: drill?.mainFocus ?? "",
    subFocus: drill?.subFocus ?? "",
    trainingBlocks: drill?.trainingBlocks ?? [],
    drillType: drill?.drillType ?? "",
    durationMinutes: String(drill?.durationMinutes ?? 10),
    minPlayers: String(drill?.minPlayers ?? 1),
    maxPlayers: String(drill?.maxPlayers ?? 12),
    materials: drill ? serializeMaterials(drill.materials) : "",
    materialsJson: drill ? JSON.stringify(materialsToJson(drill.materials)) : "",
    setupAreaLength: drill?.setupArea?.length ? String(drill.setupArea.length) : "",
    setupAreaWidth: drill?.setupArea?.width ? String(drill.setupArea.width) : "",
    setupParametersJson: drill ? JSON.stringify(drill.setupParameters) : "",
    setupNotes: drill?.setupNotes ?? "",
    difficultyLevel: String(drill?.difficultyLevel ?? 3),
    intensityLevel: String(drill?.intensityLevel ?? 3),
    tags: drill?.tags.join(", ") ?? "",
    isFavorite: drill?.isFavorite ?? false,
    graphicJson
  };
}

function AgeSuitabilityInput({
  selectedMode,
  selectedPresets,
  minimumAge,
  maximumAge,
  error,
  minimumError,
  maximumError,
  onDirty
}: {
  selectedMode?: string;
  selectedPresets: readonly string[];
  minimumAge?: string;
  maximumAge?: string;
  error?: string;
  minimumError?: string;
  maximumError?: string;
  onDirty: () => void;
}) {
  const [mode, setMode] = useState(() => selectedMode === "preset" || selectedMode === "custom_range" ? selectedMode : "all_ages");
  const [minAge, setMinAge] = useState(minimumAge ?? "");
  const [maxAge, setMaxAge] = useState(maximumAge ?? "");
  const rangeSummary = mode === "custom_range" ? formatCustomAgeRange(Number(minAge) || null, Number(maxAge) || null) : null;
  const groupErrorId = fieldErrorId("ageGroups");

  function selectMode(nextMode: "all_ages" | "preset" | "custom_range") {
    setMode(nextMode);
    onDirty();
  }

  return (
    <fieldset data-validation-field="ageGroups" className="scroll-mt-28" aria-describedby={`age-suitability-help ${groupErrorId}`}>
      <legend className="text-sm font-semibold text-slate-700">
        Age suitability
        <RequiredMark />
      </legend>
      <p id="age-suitability-help" className="mt-1 text-xs text-slate-500">Choose which age groups this Drill is suitable for.</p>
      <input type="hidden" name="ageMode" value={mode} readOnly />
      <div className="mt-3 grid gap-2">
        <label className={`rounded-md border px-3 py-2 text-sm ${mode === "all_ages" ? "border-board-green bg-green-50 text-board-navy" : "border-board-line text-slate-700"}`}>
          <span className="flex items-start gap-2">
            <input data-validation-control type="radio" name="ageModeOption" checked={mode === "all_ages"} onChange={() => selectMode("all_ages")} className="mt-0.5 h-4 w-4 border-board-line text-board-green" />
            <span>
              <span className="block font-bold">All ages</span>
              <span className="block text-xs text-slate-500">Suitable for Players of any age.</span>
            </span>
          </span>
        </label>

        <label className={`rounded-md border px-3 py-2 text-sm ${mode === "preset" ? "border-board-green bg-green-50 text-board-navy" : "border-board-line text-slate-700"}`}>
          <span className="flex items-start gap-2">
            <input type="radio" name="ageModeOption" checked={mode === "preset"} onChange={() => selectMode("preset")} className="mt-0.5 h-4 w-4 border-board-line text-board-green" />
            <span className="font-bold">Age presets</span>
          </span>
        </label>
        {mode === "preset" ? (
          <div className="grid gap-2 rounded-md border border-board-line bg-slate-50 p-3 sm:grid-cols-2">
            {ageGroups.map((option) => (
              <label key={option} className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-board-line">
                <input
                  type="checkbox"
                  name="ageGroups"
                  value={option}
                  defaultChecked={selectedPresets.includes(option)}
                  onChange={onDirty}
                  className="h-4 w-4 rounded border-board-line text-board-green"
                />
                {option}
              </label>
            ))}
          </div>
        ) : null}

        <label className={`rounded-md border px-3 py-2 text-sm ${mode === "custom_range" ? "border-board-green bg-green-50 text-board-navy" : "border-board-line text-slate-700"}`}>
          <span className="flex items-start gap-2">
            <input type="radio" name="ageModeOption" checked={mode === "custom_range"} onChange={() => selectMode("custom_range")} className="mt-0.5 h-4 w-4 border-board-line text-board-green" />
            <span className="font-bold">Custom range</span>
          </span>
        </label>
        {mode === "custom_range" ? (
          <div className="rounded-md border border-board-line bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <AgeNumberInput name="minimumAge" label="Minimum age" value={minAge} error={minimumError} onChange={(value) => { setMinAge(value); onDirty(); }} />
              <AgeNumberInput name="maximumAge" label="Maximum age" value={maxAge} error={maximumError} onChange={(value) => { setMaxAge(value); onDirty(); }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-board-navy ring-1 ring-board-line">{rangeSummary}</span>
            </div>
          </div>
        ) : null}
      </div>
      <FieldError id={groupErrorId} error={error} />
    </fieldset>
  );
}

function AgeNumberInput({ name, label, value, error, onChange }: { name: "minimumAge" | "maximumAge"; label: string; value: string; error?: string; onChange: (value: string) => void }) {
  const errorId = fieldErrorId(name);
  return (
    <label data-validation-field={name} className="block scroll-mt-28">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        data-validation-control
        name={name}
        type="number"
        min={3}
        max={99}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${
          error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"
        }`}
      />
      <FieldError id={errorId} error={error} />
    </label>
  );
}

function RequiredMark() {
  return (
    <span className="ml-1 font-bold text-red-600" aria-hidden="true">
      *
    </span>
  );
}

function fieldErrorId(field: DrillFormField) {
  return `drill-form-${field}-error`;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <p id={id} className="mt-1 text-sm font-medium text-red-700">{error}</p> : null;
}

function TagsInput({ defaultValue, error, onDirty }: { defaultValue?: string; error?: string; onDirty: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState(() => parseTagInput(defaultValue ?? ""));
  const [draft, setDraft] = useState("");
  const errorId = fieldErrorId("tags");

  function addTag() {
    const nextTag = draft.trim();
    if (!nextTag) {
      setDraft("");
      inputRef.current?.focus();
      return;
    }

    setTags((current) => {
      if (current.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return current;
      return [...current, nextTag];
    });
    setDraft("");
    onDirty();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function removeTag(tagToRemove: string) {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
    onDirty();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div data-validation-field="tags" className="scroll-mt-28">
      <input type="hidden" name="tags" value={tags.join(", ")} readOnly />
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Tags</span>
        <input
          data-validation-control
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            onDirty();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            addTag();
          }}
          onBlur={() => {
            if (draft.trim()) addTag();
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="Type tag and press Enter"
          className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${
            error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"
          }`}
        />
      </label>
      {tags.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-board-green ring-1 ring-green-100 transition hover:bg-green-100"
              title="Remove tag"
            >
              {tag} ×
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Add tags one by one with Enter.</p>
      )}
      <FieldError id={errorId} error={error} />
    </div>
  );
}

function parseTagInput(value: string) {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function TextInput({
  name,
  label,
  defaultValue,
  required = false,
  placeholder,
  error
}: {
  name: DrillFormField;
  label: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
}) {
  const errorId = fieldErrorId(name);
  return (
    <label data-validation-field={name} className="block scroll-mt-28">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <input
        data-validation-control
        name={name}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${
          error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"
        }`}
      />
      <FieldError id={errorId} error={error} />
    </label>
  );
}

function NumberInput({
  name,
  label,
  defaultValue,
  min,
  max,
  step,
  required = false,
  error
}: {
  name: DrillFormField;
  label: string;
  defaultValue: string;
  min?: number;
  max?: number;
  step?: number | string;
  required?: boolean;
  error?: string;
}) {
  const errorId = fieldErrorId(name);
  return (
    <label data-validation-field={name} className="block scroll-mt-28">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <input
        data-validation-control
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        defaultValue={defaultValue}
        className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${
          error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"
        }`}
      />
      <FieldError id={errorId} error={error} />
    </label>
  );
}

function SelectInput({
  name,
  label,
  defaultValue,
  options,
  required = false,
  error
}: {
  name: DrillFormField;
  label: string;
  defaultValue?: string;
  options: readonly string[];
  required?: boolean;
  error?: string;
}) {
  const errorId = fieldErrorId(name);
  return (
    <label data-validation-field={name} className="block scroll-mt-28">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <select
        data-validation-control
        name={name}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        defaultValue={defaultValue ?? ""}
        className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${
          error ? "border-red-300 ring-1 ring-red-100" : "border-board-line"
        }`}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <FieldError id={errorId} error={error} />
    </label>
  );
}

function TextArea({
  name,
  label,
  defaultValue,
  rows,
  help
}: {
  name: DrillFormField;
  label: string;
  defaultValue?: string;
  rows: number;
  help?: string;
}) {
  return (
    <label data-validation-field={name} className="mt-4 block scroll-mt-28">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        data-validation-control
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
      />
      {help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
    </label>
  );
}

function CheckboxGroup({
  name,
  label,
  options,
  selected,
  required = false,
  error
}: {
  name: DrillFormField;
  label: string;
  options: readonly string[];
  selected: readonly string[];
  required?: boolean;
  error?: string;
}) {
  const errorId = fieldErrorId(name);
  return (
    <fieldset data-validation-field={name} className="scroll-mt-28" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-semibold text-slate-700">
        {label}
        {required ? <RequiredMark /> : null}
      </legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-slate-700 ${
              error ? "border-red-200 bg-red-50" : "border-board-line"
            }`}
          >
            <input
              data-validation-control={option === options[0] ? "" : undefined}
              type="checkbox"
              name={name}
              value={option}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              defaultChecked={selected.includes(option)}
              className="h-4 w-4 rounded border-board-line text-board-green"
            />
            {option}
          </label>
        ))}
      </div>
      <FieldError id={errorId} error={error} />
    </fieldset>
  );
}
