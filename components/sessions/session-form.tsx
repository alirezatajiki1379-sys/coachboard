"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import { ageGroups, drillTypes, mainFocuses, trainingBlocks } from "@/config/options";
import { Button, ButtonLink } from "@/components/ui/button";
import { SessionDrillPreview } from "@/components/sessions/session-drill-preview";
import { MaterialSummaryList } from "@/components/sessions/material-summary-list";
import { useUnsavedChangesProtection } from "@/components/shared/use-unsaved-changes-protection";
import { useLocalDraft } from "@/components/shared/local-draft";
import { cn } from "@/lib/utils";
import {
  calculateSessionMaterials,
  calculateSessionDuration,
  defaultSessionGroups,
  durationDeltaLabel,
  effectiveStationDuration,
  groupByTrainingBlock,
  normalizeSimultaneousGroup,
  normalizeGroupRef,
  normalizeGroupRefs,
  playerGroupName,
  resolveGroupName,
  stationSetLabel,
  stationSetOptions,
  type SessionFormDrill,
  type SessionFormValues
} from "@/lib/sessions/utils";
import type { createSession, updateSession, SessionActionState } from "@/lib/sessions/actions";
import type { TrainingSessionDetail } from "@/lib/sessions/queries";
import { materialSummary } from "@/lib/drills/materials";
import type { Drill, SessionPlayerGroup } from "@/types/domain";
import type { DrillEditorState } from "@/types/editor";

type BuilderDrill = Drill & { graphic?: DrillEditorState };

type SessionFormProps = {
  action: typeof createSession | typeof updateSession;
  mode: "create" | "edit";
  drills: BuilderDrill[];
  session?: TrainingSessionDetail;
};

type DropTarget = {
  block: string;
  timingMode?: "sequential" | "simultaneous";
  simultaneousGroup?: string;
  beforeId?: string;
};

type VisibleBlockGroup = {
  block: string;
  duration: number;
  stationSets: Array<{ name: string; duration: number }>;
  items: SessionFormDrill[];
};

const initialActionState: SessionActionState = {};

export function SessionForm({ action, mode, drills, session }: SessionFormProps) {
  const [actionState, formAction, isPending] = useActionState(action, initialActionState);
  const initialFormValues = useMemo(() => initialValues(session), [session]);
  const [values, setValues] = useState<SessionFormValues>(() => actionState.values ?? initialFormValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnTo, setReturnTo] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const returnToInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [mainFocus, setMainFocus] = useState("");
  const [trainingBlock, setTrainingBlock] = useState("");
  const [drillType, setDrillType] = useState("");
  const [draggedDrillId, setDraggedDrillId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggedDrillIdRef = useRef<string | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const dragStateTimerRef = useRef<number | null>(null);
  const initialSnapshotRef = useRef<string | null>(null);
  if (initialSnapshotRef.current === null) initialSnapshotRef.current = sessionValuesSnapshot(initialFormValues);
  const isDirty = sessionValuesSnapshot(values) !== initialSnapshotRef.current;
  const draftKey = `coachboard:draft:session:${session?.id ?? "new"}`;
  const readDraftData = useCallback(() => values, [values]);
  const {
    clearDraft,
    indicator: autosaveIndicator,
    recoveryDialog
  } = useLocalDraft<SessionFormValues>({
    draftKey,
    entityType: "session",
    entityId: session?.id,
    baseUpdatedAt: session?.updatedAt,
    isDirty,
    initialData: initialFormValues,
    getData: readDraftData,
    onRecover: (draftValues) => setValues(draftValues)
  });

  const { dialog: unsavedChangesDialog, dismissDialog: dismissUnsavedChangesDialog } = useUnsavedChangesProtection({
    isDirty,
    isSaving: isSubmitting || isPending,
    onSaveAndLeave: (href) => {
      if (returnToInputRef.current) returnToInputRef.current.value = href;
      setReturnTo(href);
      setIsSubmitting(true);
      window.setTimeout(() => formRef.current?.requestSubmit(), 0);
    }
  });

  useEffect(() => {
    if (actionState.values) setValues(actionState.values);
  }, [actionState.values]);

  useEffect(() => {
    if (actionState.error) {
      setIsSubmitting(false);
      setReturnTo("");
      dismissUnsavedChangesDialog();
    }
  }, [actionState.error, actionState.submissionId, dismissUnsavedChangesDialog]);

  useEffect(
    () => () => {
      if (dragStateTimerRef.current) window.clearTimeout(dragStateTimerRef.current);
      dragPreviewRef.current?.remove();
    },
    []
  );

  useEffect(() => {
    if (!isSubmitting) return;

    const handlePageHide = () => {
      clearDraft();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [clearDraft, isSubmitting]);

  const drillMap = useMemo(() => new Map(drills.map((drill) => [drill.id, drill])), [drills]);
  const total = calculateSessionDuration(values.drills);
  const target = Number.parseInt(values.durationTargetMinutes, 10);
  const targetLabel = durationDeltaLabel(total, Number.isFinite(target) ? target : undefined);
  const materials = calculateSessionMaterials(
    values.drills
      .map((item) => {
        const drill = drillMap.get(item.drillId);
        return drill ? { drill, timingMode: item.timingMode, simultaneousGroup: item.simultaneousGroup } : null;
      })
      .filter((item): item is { drill: BuilderDrill; timingMode: SessionFormDrill["timingMode"]; simultaneousGroup: string } => item !== null)
  );
  const blockGroups = groupByTrainingBlock(values.drills);
  const visibleBlockGroups = visibleTrainingBlocks(blockGroups, Boolean(draggedDrillId));
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of values.drills) counts.set(item.drillId, (counts.get(item.drillId) ?? 0) + 1);
    return counts;
  }, [values.drills]);

  const filteredDrills = drills.filter((drill) => {
    const matchesSearch = !search || drill.title.toLowerCase().includes(search.toLowerCase());
    return (
      matchesSearch &&
      (!ageGroup || drill.ageGroups.includes(ageGroup as Drill["ageGroups"][number])) &&
      (!mainFocus || drill.mainFocus === mainFocus) &&
      (!trainingBlock || drill.trainingBlocks.includes(trainingBlock as Drill["trainingBlocks"][number])) &&
      (!drillType || drill.drillType === drillType)
    );
  });

  function updateField<K extends keyof SessionFormValues>(key: K, value: SessionFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function addDrill(drill: BuilderDrill) {
    setValues((current) => ({
      ...current,
      drills: [
        ...current.drills,
        {
          id: crypto.randomUUID(),
          drillId: drill.id,
          block: drill.trainingBlocks[0] ?? "Main part 1",
          plannedDurationMinutes: drill.durationMinutes,
          coachNotes: "",
          orderIndex: current.drills.length,
          timingMode: "sequential",
          simultaneousGroup: "set-1",
          participatingGroups: [],
          startingGroup: ""
        }
      ]
    }));
  }

  function updateSessionDrill(id: string, patch: Partial<SessionFormDrill>) {
    setValues((current) => ({
      ...current,
      drills: current.drills.map((item) => (item.id === id ? { ...item, ...patch } : item))
    }));
  }

  function updatePlayerGroups(nextGroups: SessionPlayerGroup[]) {
    setValues((current) => ({
      ...current,
      playerGroups: nextGroups,
      drills: current.drills.map((item) => {
        const participatingGroups = normalizeGroupRefs(item.participatingGroups, nextGroups).filter((groupId) => nextGroups.some((group) => group.id === groupId));
        const startingGroup = normalizeGroupRef(item.startingGroup, nextGroups);
        return {
          ...item,
          participatingGroups,
          startingGroup: participatingGroups.includes(startingGroup) ? startingGroup : participatingGroups[0] ?? ""
        };
      })
    }));
  }

  function addPlayerGroup() {
    const nextNumber = values.playerGroups.length + 1;
    updatePlayerGroups([...values.playerGroups, { id: `group-${crypto.randomUUID()}`, name: playerGroupName(nextNumber - 1), notes: "" }]);
  }

  function updatePlayerGroup(id: string, patch: Partial<SessionPlayerGroup>) {
    updatePlayerGroups(values.playerGroups.map((group) => (group.id === id ? { ...group, ...patch } : group)));
  }

  function deletePlayerGroup(id: string, index: number) {
    const isUsed = values.drills.some((item) => item.participatingGroups.includes(id) || item.startingGroup === id);
    if (isUsed) {
      window.alert("This player group is used by one or more station drills. Remove it from those drills before deleting the group.");
      return;
    }
    updatePlayerGroups(values.playerGroups.filter((group, groupIndex) => group.id !== id || groupIndex !== index));
  }

  function updateTimingMode(item: SessionFormDrill, timingMode: "sequential" | "simultaneous") {
    updateSessionDrill(item.id, {
      timingMode,
      simultaneousGroup: timingMode === "simultaneous" ? normalizeSimultaneousGroup(item.simultaneousGroup) : item.simultaneousGroup,
      participatingGroups: timingMode === "simultaneous" ? item.participatingGroups : [],
      startingGroup: timingMode === "simultaneous" ? item.startingGroup : ""
    });
  }

  function updateParticipatingGroup(item: SessionFormDrill, groupId: string, selected: boolean) {
    const nextGroups = selected ? Array.from(new Set([...item.participatingGroups, groupId])) : item.participatingGroups.filter((current) => current !== groupId);
    updateSessionDrill(item.id, {
      participatingGroups: nextGroups,
      startingGroup: nextGroups.includes(item.startingGroup) ? item.startingGroup : nextGroups[0] ?? ""
    });
  }

  function playerGroupOptions() {
    return values.playerGroups;
  }

  function blockSections(block: string, items: SessionFormDrill[]) {
    const stationSections = stationSetOptions
      .map((set) => ({
        id: set.id,
        label: set.label,
        target: { block, timingMode: "simultaneous" as const, simultaneousGroup: set.id },
        items: items.filter((item) => item.timingMode === "simultaneous" && normalizeSimultaneousGroup(item.simultaneousGroup) === set.id),
        isDefaultVisible: set.id === "set-1" || set.id === "set-2"
      }));
    const sequentialItems = items.filter((item) => item.timingMode !== "simultaneous");
    return {
      stationSections,
      sequentialSection: {
        id: "sequential",
        label: "Sequential drills",
        target: { block, timingMode: "sequential" as const },
        items: sequentialItems
      }
    };
  }

  function removeDrill(id: string) {
    setValues((current) => ({ ...current, drills: current.drills.filter((item) => item.id !== id) }));
  }

  function moveDrill(index: number, direction: -1 | 1) {
    setValues((current) => {
      const next = [...current.drills];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, drills: next.map((item, orderIndex) => ({ ...item, orderIndex })) };
    });
  }

  function moveDraggedDrill(target: DropTarget) {
    const activeDrillId = draggedDrillIdRef.current ?? draggedDrillId;
    if (!activeDrillId) return;
    setValues((current) => {
      const dragged = current.drills.find((item) => item.id === activeDrillId);
      if (!dragged) return current;
      if (target.beforeId === activeDrillId && dragged.block === target.block) return current;
      const moved = {
        ...dragged,
        block: target.block,
        timingMode: target.timingMode ?? dragged.timingMode,
        simultaneousGroup: target.timingMode === "simultaneous" ? normalizeSimultaneousGroup(target.simultaneousGroup) : dragged.simultaneousGroup
      };
      const withoutDragged = current.drills.filter((item) => item.id !== activeDrillId);
      const targetIndex = target.beforeId ? withoutDragged.findIndex((item) => item.id === target.beforeId) : -1;
      const insertIndex = targetIndex >= 0 ? targetIndex : findSectionInsertIndex(withoutDragged, target);
      const next = [...withoutDragged];
      next.splice(insertIndex, 0, moved);
      return { ...current, drills: next.map((item, orderIndex) => ({ ...item, orderIndex })) };
    });
    resetDragState();
  }

  function beginDrillDrag(event: DragEvent<HTMLElement>, item: SessionFormDrill, title: string) {
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, button, summary, label")) {
      event.preventDefault();
      return;
    }
    resetDragState();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    const dragPreview = document.createElement("div");
    dragPreview.className = "w-72 rounded-lg border border-board-line bg-white p-3 shadow-2xl";
    dragPreview.innerHTML = `<p style="margin:0;color:#0f172a;font-size:14px;font-weight:800;">${escapeHtml(title)}</p><p style="margin:4px 0 0;color:#64748b;font-size:12px;font-weight:700;">${escapeHtml(item.block)} · ${item.plannedDurationMinutes} min</p>`;
    dragPreview.style.position = "fixed";
    dragPreview.style.top = "-1000px";
    dragPreview.style.left = "-1000px";
    document.body.appendChild(dragPreview);
    dragPreviewRef.current = dragPreview;
    event.dataTransfer.setDragImage(dragPreview, 18, 18);
    draggedDrillIdRef.current = item.id;
    dragStateTimerRef.current = window.setTimeout(() => {
      setDraggedDrillId(item.id);
      dragStateTimerRef.current = null;
    }, 0);
  }

  function resetDragState() {
    if (dragStateTimerRef.current) window.clearTimeout(dragStateTimerRef.current);
    dragStateTimerRef.current = null;
    draggedDrillIdRef.current = null;
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
    setDraggedDrillId(null);
    setDropTarget(null);
  }

  function updateBlockDropTarget(event: DragEvent<HTMLElement>, targetSection: DropTarget) {
    event.preventDefault();
    if (!draggedDrillIdRef.current && !draggedDrillId) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-session-drill-card='true']")) return;
    setStableDropTarget(targetSection);
  }

  function updateCardDropTarget(event: DragEvent<HTMLElement>, targetSection: DropTarget, item: SessionFormDrill, sectionItems: SessionFormDrill[]) {
    event.preventDefault();
    const activeDrillId = draggedDrillIdRef.current ?? draggedDrillId;
    if (!activeDrillId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const isUpperHalf = event.clientY < rect.top + rect.height / 2;
    if (isUpperHalf) {
      setStableDropTarget({ ...targetSection, beforeId: item.id });
      return;
    }
    const itemIndex = sectionItems.findIndex((blockItem) => blockItem.id === item.id);
    const nextItem = sectionItems.slice(itemIndex + 1).find((blockItem) => blockItem.id !== activeDrillId);
    setStableDropTarget({ ...targetSection, beforeId: nextItem?.id });
  }

  function setStableDropTarget(next: DropTarget) {
    setDropTarget((current) =>
      current?.block === next.block &&
      current.timingMode === next.timingMode &&
      current.simultaneousGroup === next.simultaneousGroup &&
      current.beforeId === next.beforeId
        ? current
        : next
    );
  }

  function isSameDropSection(current: DropTarget | null, target: DropTarget) {
    return current?.block === target.block && current.timingMode === target.timingMode && current.simultaneousGroup === target.simultaneousGroup;
  }

  function finishDrop(fallback: DropTarget) {
    const target = dropTarget?.block === fallback.block ? dropTarget : fallback;
    moveDraggedDrill(target);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6" onSubmitCapture={() => setIsSubmitting(true)}>
      {session ? <input type="hidden" name="sessionId" value={session.id} /> : null}
      <input ref={returnToInputRef} type="hidden" name="returnTo" value={returnTo} readOnly />
      <input type="hidden" name="sessionPayload" value={JSON.stringify(values)} />
      {unsavedChangesDialog}
      {recoveryDialog}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <p className="text-sm text-slate-600">
          Fields marked with <span className="font-bold text-red-600">*</span> are required.
        </p>
        {actionState.error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionState.error}</p> : null}
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Session details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput label="Title" required value={values.title} error={actionState.fieldErrors?.title} onChange={(value) => updateField("title", value)} />
          <TextInput label="Date" type="date" value={values.sessionDate} onChange={(value) => updateField("sessionDate", value)} />
          <TextInput label="Start time" type="time" value={values.startTime} onChange={(value) => updateField("startTime", value)} />
          <SelectInput label="Team / age group" value={values.teamAgeGroup} options={ageGroups} onChange={(value) => updateField("teamAgeGroup", value)} />
          <SelectInput label="Main focus" value={values.mainFocus} options={mainFocuses} onChange={(value) => updateField("mainFocus", value)} />
          <TextInput label="Secondary focus" value={values.secondaryFocus} onChange={(value) => updateField("secondaryFocus", value)} />
          <TextInput label="Expected players" type="number" value={values.expectedPlayers} onChange={(value) => updateField("expectedPlayers", value)} />
          <TextInput label="Target duration in minutes" type="number" value={values.durationTargetMinutes} onChange={(value) => updateField("durationTargetMinutes", value)} />
          <TextInput label="Location" value={values.location} onChange={(value) => updateField("location", value)} />
        </div>
        <TextArea label="Notes" value={values.notes} onChange={(value) => updateField("notes", value)} />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <details>
          <summary className="cursor-pointer text-lg font-bold text-board-navy">Player groups</summary>
          <p className="mt-2 text-sm text-slate-500">
            Player groups can be assigned to stations and rotated during the session. Notes can hold player names, levels, or quick coaching reminders.
          </p>
          <div className="mt-4 space-y-3">
            {values.playerGroups.length ? (
              values.playerGroups.map((group, index) => (
                <div key={group.id} className="grid gap-3 rounded-md border border-board-line bg-board-paper p-3 lg:grid-cols-[190px_minmax(0,1fr)_auto] lg:items-end">
                  <TextInput label="Group name" value={group.name} onChange={(name) => updatePlayerGroup(group.id, { name })} />
                  <TextInput label="Notes / player names" value={group.notes ?? ""} onChange={(notes) => updatePlayerGroup(group.id, { notes })} />
                  <Button type="button" variant="danger" className="h-11 px-3" onClick={() => deletePlayerGroup(group.id, index)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-board-line bg-board-paper p-4 text-sm font-medium text-slate-500">
                No player groups yet. Add a group if you want to organize station rotations.
              </div>
            )}
          </div>
          <Button type="button" variant="secondary" className="mt-4" onClick={addPlayerGroup}>
            <Plus className="h-4 w-4" />
            Add player group
          </Button>
        </details>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4 rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <h2 className="text-lg font-bold text-board-navy">Session drills</h2>
            <div className="text-sm font-semibold text-slate-600">
              {total} min {targetLabel ? `- ${targetLabel}` : ""}
            </div>
          </div>
          <p className="text-sm leading-6 text-slate-500">
            Add saved drills, group station work into sets, then drag cards between blocks or station sets to shape the timeline.
          </p>
          {visibleBlockGroups.length ? (
            <div className="space-y-4">
              {visibleBlockGroups.map((group) => {
                const block = group.block;
                const items = group.items;
                const sections = blockSections(block, items);
                const showEmptyDropSections = Boolean(draggedDrillId);
                const showSequentialSection = sections.sequentialSection.items.length > 0 || showEmptyDropSections || items.length === 0;
                const hasSimultaneousDrills = sections.stationSections.some((section) => section.items.length > 0);
                const visibleStationSections = sections.stationSections.filter(
                  (section) => section.items.length > 0 || (section.isDefaultVisible && (showEmptyDropSections || hasSimultaneousDrills))
                );
                const visibleSections = showEmptyDropSections
                  ? [...visibleStationSections, sections.sequentialSection]
                  : [
                      ...visibleStationSections,
                      ...(showSequentialSection ? [sections.sequentialSection] : [])
                    ];
                return (
                  <section
                    key={block}
                    className={cn(
                      "relative rounded-lg border border-board-line bg-board-paper p-3 transition-colors",
                      draggedDrillId && dropTarget?.block === block ? "border-board-green bg-green-50/70" : ""
                    )}
                    onDragOver={(event) => updateBlockDropTarget(event, { block })}
                    onDrop={(event) => {
                      event.preventDefault();
                      finishDrop({ block });
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 px-1 pb-3">
                      <h3 className="font-bold text-board-navy">{block}</h3>
                      <span className="text-xs font-semibold text-slate-500">{group.duration} min</span>
                    </div>
                    <div className="space-y-4">
                      {visibleSections.map((section) => (
                        <section
                          key={section.id}
                          className={cn(
                            "relative rounded-md border border-board-line bg-white/60 p-3",
                            draggedDrillId &&
                              isSameDropSection(dropTarget, section.target)
                              ? "border-board-green bg-green-50"
                              : ""
                          )}
                          onDragOver={(event) => {
                            event.stopPropagation();
                            updateBlockDropTarget(event, section.target);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            finishDrop(section.target);
                          }}
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-board-navy">{section.label}</p>
                            {section.target.timingMode === "simultaneous" ? (
                              <span className="rounded-full bg-board-paper px-2 py-1 text-xs font-semibold text-slate-500">Station set</span>
                            ) : null}
                          </div>
                          <div className="space-y-3">
                            {section.items.length ? (
                              section.items.map((item) => {
                                const drill = drillMap.get(item.drillId);
                                const index = values.drills.findIndex((sessionDrill) => sessionDrill.id === item.id);
                                if (!drill) return null;
                                const showIndicatorBefore =
                                  isSameDropSection(dropTarget, section.target) &&
                                  dropTarget?.beforeId === item.id &&
                                  (draggedDrillIdRef.current ?? draggedDrillId) !== item.id;
                                return (
                                  <div key={item.id} className="relative">
                                    {showIndicatorBefore ? <DropIndicator /> : null}
                                    <article
                                      data-session-drill-card="true"
                                      draggable
                                      onDragStart={(event) => beginDrillDrag(event, item, drill.title)}
                                      onDragEnd={resetDragState}
                                      onDragOver={(event) => {
                                        event.stopPropagation();
                                        updateCardDropTarget(event, section.target, item, section.items);
                                      }}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        finishDrop({ ...section.target, beforeId: item.id });
                                      }}
                                      className={cn("cursor-grab select-none rounded-lg border border-board-line bg-white p-3 shadow-sm transition-opacity active:cursor-grabbing sm:p-4", draggedDrillId === item.id ? "opacity-55" : "opacity-100")}
                                    >
                                      <div className="flex flex-col gap-4 lg:flex-row">
                                      <div className="w-full overflow-hidden rounded-md border border-board-line bg-white lg:w-[320px] xl:w-[360px]">
                                        <SessionDrillPreview graphic={drill.graphic} />
                                      </div>
                                      <div className="min-w-0 flex-1 space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-xs font-bold uppercase text-board-green">#{index + 1} {item.block}</p>
                                            <h3 className="text-lg font-bold text-board-navy">{drill.title}</h3>
                                            <p className="text-sm text-slate-600">{drill.minPlayers}-{drill.maxPlayers} players - original {drill.durationMinutes} min - {materialSummary(drill.materials)}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                              {item.timingMode === "simultaneous" ? `${item.plannedDurationMinutes} min × ${Math.max(1, item.participatingGroups.length)} groups = ${effectiveStationDuration(item)} min` : "Runs sequentially"}
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveDrill(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button>
                                            <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveDrill(index, 1)} disabled={index === values.drills.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                                            <Button type="button" variant="danger" className="h-9 px-3" onClick={() => removeDrill(item.id)}><Trash2 className="h-4 w-4" /></Button>
                                          </div>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                                          <div>
                                            <SelectInput label="Training block" value={item.block} options={trainingBlocks} onChange={(nextBlock) => updateSessionDrill(item.id, { block: nextBlock })} />
                                            <p className="mt-1 text-xs text-slate-500">Blocks keep the session readable on detail and print pages.</p>
                                          </div>
                                          <TextInput label="Planned duration" type="number" value={String(item.plannedDurationMinutes)} onChange={(value) => updateSessionDrill(item.id, { plannedDurationMinutes: Math.max(1, Number.parseInt(value, 10) || 1) })} />
                                          <div>
                                            <SelectInput
                                              label="Run mode"
                                              value={item.timingMode}
                                              options={["sequential", "simultaneous"]}
                                              onChange={(timingMode) =>
                                                updateTimingMode(item, timingMode === "simultaneous" ? "simultaneous" : "sequential")
                                              }
                                              emptyLabel={null}
                                            />
                                            <p className="mt-1 text-xs text-slate-500">Sequential runs one after another. Simultaneous runs as stations.</p>
                                          </div>
                                          {item.timingMode === "simultaneous" ? (
                                            <div>
                                              <SelectInput label="Station set" value={normalizeSimultaneousGroup(item.simultaneousGroup)} options={stationSetOptions.map((option) => option.id)} onChange={(simultaneousGroup) => updateSessionDrill(item.id, { simultaneousGroup: normalizeSimultaneousGroup(simultaneousGroup) })} emptyLabel={null} optionLabel={stationSetLabel} />
                                              <p className="mt-1 text-xs text-slate-500">Drills in the same station set run at the same time.</p>
                                            </div>
                                          ) : null}
                                        </div>
                                        {item.timingMode === "simultaneous" ? (
                                          <div className="grid gap-3 rounded-md border border-board-line bg-board-paper p-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                                            <fieldset>
                                              <legend className="text-xs font-semibold text-slate-500">Participating player groups</legend>
                                              <p className="mt-1 text-xs text-slate-500">Player groups can be assigned to stations and rotated during the session.</p>
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                {playerGroupOptions().map((group) => (
                                                  <label key={group.id} className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-board-line">
                                                    <input
                                                      type="checkbox"
                                                      checked={item.participatingGroups.includes(group.id)}
                                                      onChange={(event) => updateParticipatingGroup(item, group.id, event.target.checked)}
                                                      className="h-3.5 w-3.5 accent-board-green"
                                                    />
                                                    {group.name}
                                                  </label>
                                                ))}
                                              </div>
                                            </fieldset>
                                            <SelectInput
                                              label="Starting player group"
                                              value={item.startingGroup}
                                              options={item.participatingGroups}
                                              onChange={(startingGroup) => updateSessionDrill(item.id, { startingGroup })}
                                              emptyLabel="None"
                                              optionLabel={(groupId) => resolveGroupName(values.playerGroups, groupId)}
                                            />
                                            <p className="text-xs text-slate-500 lg:col-start-2">Choose which group starts at this station.</p>
                                          </div>
                                        ) : null}
                                        <details className="rounded-md border border-board-line bg-white px-3 py-2">
                                          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Coach notes for this drill</summary>
                                          <TextArea label="Notes" value={item.coachNotes} onChange={(coachNotes) => updateSessionDrill(item.id, { coachNotes })} compact />
                                        </details>
                                      </div>
                                      </div>
                                    </article>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="rounded-md border border-dashed border-board-line bg-white/70 p-4 text-center text-sm font-medium text-slate-500">
                                {section.target.timingMode === "simultaneous" ? `Drop drills into ${section.label}` : "Drop drills here"}
                              </div>
                            )}
                          </div>
                          {draggedDrillId &&
                          isSameDropSection(dropTarget, section.target) &&
                          !dropTarget?.beforeId ? (
                            <DropIndicator label="Drop at end" position="end" />
                          ) : null}
                        </section>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center">
              <p className="font-semibold text-board-navy">No drills added yet.</p>
              <p className="mt-2 text-sm text-slate-500">Search your drill library and add the blocks for this session.</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Material summary</h2>
            <p className="mt-1 text-xs text-slate-500">Calculated based on simultaneous and sequential drill usage.</p>
            <div className="mt-3 text-sm text-slate-600">
              <MaterialSummaryList materials={materials} />
            </div>
          </section>
          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Block structure</h2>
            <div className="mt-3 space-y-2">
              {blockGroups.length ? (
                blockGroups.map((group) => (
                  <div key={group.block} className="rounded-md bg-board-paper px-3 py-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-board-navy">{group.block}</span>
                      <span className="text-slate-600">{group.items.length} drills - {group.duration} min</span>
                    </div>
                    {group.stationSets.map((set) => (
                      <p key={`${group.block}-${set.name}`} className="mt-1 text-xs font-semibold text-slate-500">{set.name}: {set.duration} min</p>
                    ))}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Blocks appear after you add drills.</p>
              )}
            </div>
          </section>
        </aside>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Add drills from library</h2>
        <p className="mt-1 text-sm text-slate-500">Only saved drills appear here. Create drills first, then add them to this session.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <label className="md:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Search</span>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </div>
          </label>
          <SelectInput label="Age group" value={ageGroup} options={ageGroups} onChange={setAgeGroup} />
          <SelectInput label="Focus" value={mainFocus} options={mainFocuses} onChange={setMainFocus} />
          <SelectInput label="Block" value={trainingBlock} options={trainingBlocks} onChange={setTrainingBlock} />
          <SelectInput label="Drill type" value={drillType} options={drillTypes} onChange={setDrillType} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {filteredDrills.length ? filteredDrills.map((drill) => (
            <article key={drill.id} className="rounded-lg border border-board-line bg-board-paper p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-board-navy">{drill.title}</h3>
                    {selectedCounts.get(drill.id) ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-board-green">Added</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{drill.durationMinutes} min - {drill.mainFocus} - {drill.trainingBlocks.join(", ")}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{drill.minPlayers}-{drill.maxPlayers} players - {materialSummary(drill.materials)}</p>
                </div>
                <Button type="button" variant={selectedCounts.get(drill.id) ? "secondary" : "primary"} className="h-9 justify-center px-3 sm:shrink-0" onClick={() => addDrill(drill)}>
                  <Plus className="h-4 w-4" />
                  {selectedCounts.get(drill.id) ? "Add again" : "Add"}
                </Button>
              </div>
            </article>
          )) : (
            <div className="rounded-lg border border-dashed border-board-line bg-board-paper p-6 text-center text-sm text-slate-500 lg:col-span-2">
              No drills match these filters. Clear the filters or create a drill in the library first.
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        {autosaveIndicator}
        <ButtonLink href={session ? `/sessions/${session.id}` : "/sessions"} variant="secondary" className="justify-center">Cancel</ButtonLink>
        <Button type="submit" disabled={isPending} className="justify-center">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "Create session" : "Save session"}
        </Button>
      </div>
    </form>
  );
}

function DropIndicator({ label = "Drop here", position = "before" }: { label?: string; position?: "before" | "end" }) {
  return (
    <div
      className={cn(
        "pointer-events-none z-10 flex items-center gap-3 text-xs font-bold uppercase text-board-green",
        position === "before" ? "absolute -top-2 left-0 right-0" : "absolute bottom-2 left-3 right-3"
      )}
    >
      <span className="h-0.5 flex-1 rounded-full bg-board-green" />
      <span className="rounded-full bg-green-100 px-2 py-1 shadow-sm">{label}</span>
      <span className="h-0.5 flex-1 rounded-full bg-board-green" />
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function findSectionInsertIndex(items: SessionFormDrill[], target: DropTarget) {
  const lastInSection = items.reduce((lastIndex, item, index) => {
    if (item.block !== target.block) return lastIndex;
    if (target.timingMode === "simultaneous") {
      return item.timingMode === "simultaneous" && normalizeSimultaneousGroup(item.simultaneousGroup) === target.simultaneousGroup ? index : lastIndex;
    }
    if (target.timingMode === "sequential") return item.timingMode !== "simultaneous" ? index : lastIndex;
    return index;
  }, -1);
  if (lastInSection >= 0) return lastInSection + 1;

  const lastInBlock = items.reduce((lastIndex, item, index) => (item.block === target.block ? index : lastIndex), -1);
  if (lastInBlock >= 0) return lastInBlock + 1;
  const targetBlockIndex = trainingBlocks.indexOf(target.block as (typeof trainingBlocks)[number]);
  if (targetBlockIndex < 0) return items.length;
  const firstLaterBlock = items.findIndex((item) => {
    const blockIndex = trainingBlocks.indexOf(item.block as (typeof trainingBlocks)[number]);
    return blockIndex > targetBlockIndex;
  });
  return firstLaterBlock >= 0 ? firstLaterBlock : items.length;
}

function visibleTrainingBlocks(groups: VisibleBlockGroup[], isDragging: boolean): VisibleBlockGroup[] {
  const groupsByBlock = new Map(groups.map((group) => [group.block, group]));
  const visibleBlocks = new Set(groups.map((group) => group.block));
  if (isDragging) {
    visibleBlocks.add("Warm-up");
    visibleBlocks.add("Main part 1");
  }

  const blockOrder = new Map<string, number>(trainingBlocks.map((block, index) => [block, index]));
  return Array.from(visibleBlocks)
    .sort((blockA, blockB) => {
      const a = blockOrder.get(blockA) ?? Number.MAX_SAFE_INTEGER;
      const b = blockOrder.get(blockB) ?? Number.MAX_SAFE_INTEGER;
      return a - b || blockA.localeCompare(blockB);
    })
    .map((block) => groupsByBlock.get(block) ?? { block, duration: 0, stationSets: [], items: [] });
}

function sessionValuesSnapshot(values: SessionFormValues) {
  return JSON.stringify(values);
}

function initialValues(session?: TrainingSessionDetail): SessionFormValues {
  const playerGroups = session?.playerGroups?.length ? session.playerGroups : defaultSessionGroups();
  return {
    title: session?.title ?? "",
    sessionDate: session?.date ?? "",
    startTime: session?.startTime ?? "",
    teamAgeGroup: session?.teamAgeGroup ?? "",
    mainFocus: session?.mainFocus ?? "",
    secondaryFocus: session?.secondaryFocus ?? "",
    expectedPlayers: String(session?.expectedPlayers ?? ""),
    durationTargetMinutes: String(session?.durationTargetMinutes ?? ""),
    location: session?.location ?? "",
    notes: session?.notes ?? "",
    playerGroups,
    drills: session?.drills.map((item, index) => {
      const participatingGroups = normalizeGroupRefs(item.participatingGroups, playerGroups);
      const startingGroup = normalizeGroupRef(item.startingGroup, playerGroups);
      return {
        id: item.id,
        drillId: item.drillId,
        block: item.block,
        plannedDurationMinutes: item.plannedDurationMinutes,
        coachNotes: item.coachNotes ?? "",
        orderIndex: index,
        timingMode: item.timingMode ?? "sequential",
        simultaneousGroup: normalizeSimultaneousGroup(item.simultaneousGroup),
        participatingGroups,
        startingGroup: participatingGroups.includes(startingGroup) ? startingGroup : participatingGroups[0] ?? ""
      };
    }) ?? []
  };
}

function TextInput({ label, value, onChange, type = "text", required, error }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; error?: string }) {
  return (
    <label className="block">
      <span className="whitespace-nowrap text-sm font-medium text-slate-700">{label}{required ? <span className="ml-1 font-bold text-red-600">*</span> : null}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={`mt-1 h-11 w-full rounded-md border bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100 ${error ? "border-red-300" : "border-board-line"}`} />
      {error ? <p className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}
    </label>
  );
}

function TextArea({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={compact ? 2 : 4} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
  emptyLabel = "Any",
  optionLabel = (option: string) => option
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  emptyLabel?: string | null;
  optionLabel?: (option: string) => string;
}) {
  return (
    <label className="block">
      <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
        {emptyLabel !== null ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
      </select>
    </label>
  );
}
