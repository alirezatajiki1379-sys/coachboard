"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Archive, Copy, Goal, GripVertical, Plus, RotateCcw, Shield, Star, Trash2, Users } from "lucide-react";
import {
  addDepthAssignment,
  addAllEligibleDepthAssignments,
  assignStartingPlayer,
  archiveTacticalPlan,
  autoFillTacticalPlan,
  clearStartingXi,
  createTacticalPlan,
  deleteTacticalPlan,
  duplicateTacticalPlan,
  moveDepthAssignment,
  moveDepthAssignmentToRank,
  removeDepthAssignment,
  restoreTacticalPlan,
  setDefaultTacticalPlan,
  setPreferredStarter,
  saveCustomFormation,
  updatePlayerPlanState,
  updateTacticalPlan
} from "@/lib/squad/tactical-planner-actions";
import {
  evaluatePlayerSlotFit,
  autoFillEligibilityLabel,
  isFitAllowedByAutoFillEligibility,
  playerName,
  playerPositionText,
  tacticalPlayerRoleOptions,
  tacticalRoleLabel,
  tacticalRoleScore,
  type AutoFillEligibility,
  type TacticalPlannerData,
  type TacticalPlanSlot,
  type TacticalFitType
} from "@/lib/squad/tactical-planner";
import { tacticalFormations, slot as makeSlotDefinition } from "@/lib/squad/tactical-formations";
import { canonicalPositionLabels } from "@/lib/squad/positions";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPositionFamily, positionFamilyMeta, positionFamilyOrder, type PositionFamily } from "@/lib/squad/positions";
import type { SquadPlayer } from "@/types/domain";

type PlannerMode = "formation" | "depth";
type AutoFillMode = "empty_xi" | "xi_depth" | "xi_all_depth" | "rebuild_xi" | "rebuild_all";
type TacticalAssignment = TacticalPlannerData["assignments"][number];
type OptimisticSlotUpdate =
  | { type: "remove"; assignmentId: string }
  | { type: "move"; assignmentId: string; direction: "up" | "down" }
  | { type: "moveToRank"; assignmentId: string; targetRank: number }
  | { type: "starter"; assignmentId: string }
  | { type: "add"; slot: TacticalPlanSlot; player: SquadPlayer };

const fitMeta: Record<TacticalFitType, { label: string; className: string }> = {
  natural: { label: "Natural", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  secondary: { label: "Secondary", className: "border-amber-200 bg-amber-50 text-amber-800" },
  compatible: { label: "Compatible", className: "border-sky-200 bg-sky-50 text-sky-800" },
  out_of_position: { label: "Out of position", className: "border-red-200 bg-red-50 text-red-700" },
  no_data: { label: "No data", className: "border-slate-200 bg-slate-50 text-slate-600" }
};

const tacticalStatusOptions = [
  { value: "", label: "No tactical role" },
  ...tacticalPlayerRoleOptions
];

const plannerCopy = {
  en: {
    heading: "Squad Planner", nameRequired: "Name the custom formation.",
    edit: "Edit formation", add: "Add position", remove: "Remove position", save: "Save formation", reset: "Reset changes", cancel: "Cancel",
    duplicate: "Duplicate as custom", custom: "Custom formation", available: "Available players", unassigned: "Unassigned", drop: "Drop player here",
    assign: "Assign", selectPlayer: "Select a player, then tap a position.", selectPosition: "Select a position to inspect its depth.", depthOptions: "options", removeFromXi: "Remove from XI", changeFailed: "Could not update formation.",
    name: "Formation name", label: "Display label", position: "Position", eleven: "A formation needs 11 positions before it can be saved.",
    starters: "starters", depthAssignments: "depth assignments", included: "included", excluded: "excluded", plan: "Plan", board: "Formation board", depthBoard: "Depth board", playerPool: "Player pool",
    removeWarning: "Removing this position returns its player to the available pool. Continue?", saving: "Saving...", saved: "Saved", unsaved: "Unsaved changes", editHint: "Drag positions to change the layout.", dropInvalid: "Drop the player on a position or Unassigned.", outOfPosition: "Out of position"
  },
  de: {
    heading: "Kaderplaner", nameRequired: "Bitte einen Namen für die Formation eingeben.",
    edit: "Formation bearbeiten", add: "Position hinzufügen", remove: "Position entfernen", save: "Formation speichern", reset: "Änderungen zurücksetzen", cancel: "Abbrechen",
    duplicate: "Als individuelle Formation duplizieren", custom: "Individuelle Formation", available: "Verfügbare Spieler", unassigned: "Nicht zugeordnet", drop: "Spieler hier ablegen",
    assign: "Zuweisen", selectPlayer: "Spieler auswählen und dann eine Position antippen.", selectPosition: "Position auswählen, um die Besetzung zu sehen.", depthOptions: "Optionen", removeFromXi: "Aus Startelf entfernen", changeFailed: "Formation konnte nicht aktualisiert werden.",
    name: "Name der Formation", label: "Anzeigename", position: "Position", eleven: "Eine Formation braucht 11 Positionen, bevor sie gespeichert werden kann.",
    starters: "Startspieler", depthAssignments: "Positionszuordnungen", included: "einbezogen", excluded: "ausgeschlossen", plan: "Plan", board: "Formationstafel", depthBoard: "Positionsbesetzung", playerPool: "Spielerpool",
    removeWarning: "Beim Entfernen dieser Position wird ihr Spieler wieder verfügbar. Fortfahren?", saving: "Wird gespeichert...", saved: "Gespeichert", unsaved: "Ungespeicherte Änderungen", editHint: "Positionen ziehen, um die Anordnung zu ändern.", dropInvalid: "Spieler auf eine Position oder Nicht zugeordnet ziehen.", outOfPosition: "Positionsfremd"
  }
} as const;

export function SquadTacticalPlanner({ data, startEditing = false }: { data: TacticalPlannerData; startEditing?: boolean }) {
  const router = useRouter();
  const locale = useOptionalI18n()?.locale ?? "en";
  const copy = plannerCopy[locale];
  const [mode, setMode] = useState<PlannerMode>("formation");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [dragPlayerId, setDragPlayerId] = useState<string | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverSlotId, setHoverSlotId] = useState<string | null>(null);
  const [editingFormation, setEditingFormation] = useState(startEditing);
  const [draftSlots, setDraftSlots] = useState(data.slots);
  const [formationName, setFormationName] = useState(data.selectedPlan?.name ?? "");
  const [savingFormation, setSavingFormation] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const acceptedDrop = useRef(false);
  const [showTrials, setShowTrials] = useState(false);
  const [search, setSearch] = useState("");
  const [poolFilter, setPoolFilter] = useState<"all" | "unassigned" | "excluded">("unassigned");
  const [roleFilter, setRoleFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");

  useEffect(() => {
    setDraftSlots(data.slots);
    setFormationName(data.selectedPlan?.name ?? "");
    setEditingFormation(startEditing);
  }, [data.selectedPlan?.id, data.selectedPlan?.name, data.slots, startEditing]);
  const visibleSlots = editingFormation ? draftSlots : data.slots;
  const selectedSlot = selectedSlotId ? visibleSlots.find((slot) => slot.id === selectedSlotId) : undefined;
  const playersById = useMemo(() => new Map(data.players.map((player) => [player.id, player])), [data.players]);
  const statesByPlayer = useMemo(() => new Map(data.playerStates.map((state) => [state.playerId, state])), [data.playerStates]);
  const excludedPlayerIds = useMemo(
    () => new Set(data.playerStates.filter((state) => state.inclusionStatus === "excluded").map((state) => state.playerId)),
    [data.playerStates]
  );
  const serverActiveAssignments = useMemo(
    () => uniqueDepthAssignments(data.assignments.filter((assignment) => !excludedPlayerIds.has(assignment.playerId) && playersById.has(assignment.playerId))),
    [data.assignments, excludedPlayerIds, playersById]
  );
  const [activeAssignments, setActiveAssignments] = useState(serverActiveAssignments);
  useEffect(() => {
    setActiveAssignments(serverActiveAssignments);
  }, [serverActiveAssignments]);
  const assignmentsBySlot = new Map<string, typeof data.assignments>();
  for (const assignment of activeAssignments) {
    assignmentsBySlot.set(assignment.slotId, [...(assignmentsBySlot.get(assignment.slotId) ?? []), assignment]);
  }
  for (const [slotId, assignments] of assignmentsBySlot) {
    assignmentsBySlot.set(slotId, [...assignments].sort((a, b) => Number(b.isPreferredStarter) - Number(a.isPreferredStarter) || a.depthOrder - b.depthOrder));
  }
  const assignedPlayerIds = useMemo(() => new Set(activeAssignments.map((assignment) => assignment.playerId)), [activeAssignments]);
  const includedPlayers = data.players.filter((player) => {
    if (excludedPlayerIds.has(player.id)) return false;
    if (player.playerType === "trial" && !showTrials) return false;
    return matchesSearch(player, search);
  });
  const startingPlayerIds = new Set(activeAssignments.filter((assignment) => assignment.isPreferredStarter).map((assignment) => assignment.playerId));
  const unassignedPlayers = includedPlayers.filter((player) => !startingPlayerIds.has(player.id));
  const selectedSlotDepth = selectedSlot ? (assignmentsBySlot.get(selectedSlot.id) ?? []) : [];
  const starters = activeAssignments.filter((assignment) => assignment.isPreferredStarter);
  const activePlans = data.plans.filter((plan) => plan.status === "active");
  const archivedPlans = data.plans.filter((plan) => plan.status === "archived");
  const applyOptimisticUpdate = (update: OptimisticSlotUpdate) => {
    setActiveAssignments((current) => applyOptimisticSlotUpdate(current, data.selectedPlan?.id ?? "", update));
  };
  const assignPlayer = async (playerId: string, slotId: string | null) => {
    if (!data.selectedPlan || assigning || editingFormation || excludedPlayerIds.has(playerId)) return;
    const player = playersById.get(playerId);
    if (!player) return;
    const before = activeAssignments;
    acceptedDrop.current = true;
    setPlannerError("");
    setSelectedPlayerId(null);
    setSelectedSlotId(null);
    setHoverSlotId(null);
    setDragPlayerId(null);
    setDragPoint(null);
    setAssigning(true);
    setActiveAssignments(optimisticStartingXi(before, data.selectedPlan.id, player, slotId, data.slots));
    try {
      const result = await assignStartingPlayer(data.selectedPlan.id, playerId, slotId);
      if (!result.ok || !result.assignments) throw new Error(locale === "de" ? copy.changeFailed : result.error || copy.changeFailed);
      setActiveAssignments(result.assignments);
    } catch (error) {
      setActiveAssignments(before);
      setPlannerError(locale === "de" ? copy.changeFailed : error instanceof Error ? error.message : copy.changeFailed);
    } finally {
      setAssigning(false);
    }
  };
  const startPlayerDrag = (event: React.DragEvent<HTMLElement>, playerId: string) => {
    if (editingFormation || assigning) { event.preventDefault(); return; }
    event.dataTransfer.setData("text/plain", playerId);
    acceptedDrop.current = false;
    event.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("canvas");
    ghost.width = 1;
    ghost.height = 1;
    event.dataTransfer.setDragImage(ghost, 0, 0);
    setDragPlayerId(playerId);
    setDragPoint({ x: event.clientX, y: event.clientY });
    setSelectedSlotId(null);
  };
  const finishPlayerDrag = () => {
    if (!acceptedDrop.current) setPlannerError(copy.dropInvalid);
    acceptedDrop.current = true;
    setDragPlayerId(null);
    setDragPoint(null);
    setHoverSlotId(null);
  };
  useEffect(() => {
    if (!dragPlayerId) return;
    const follow = (event: DragEvent) => {
      if (event.clientX || event.clientY) setDragPoint({ x: event.clientX, y: event.clientY });
    };
    document.addEventListener("dragover", follow);
    const end = () => { if (!acceptedDrop.current) setPlannerError(copy.dropInvalid); acceptedDrop.current = true; setDragPlayerId(null); setDragPoint(null); setHoverSlotId(null); };
    document.addEventListener("dragend", end);
    document.addEventListener("drop", end);
    return () => { document.removeEventListener("dragover", follow); document.removeEventListener("dragend", end); document.removeEventListener("drop", end); };
  }, [copy.dropInvalid, dragPlayerId]);
  const saveFormation = async () => {
    if (!data.selectedPlan || savingFormation) return;
    setPlannerError("");
    if (!formationName.trim()) { setPlannerError(copy.nameRequired); return; }
    setSavingFormation(true);
    try {
      const result = await saveCustomFormation(data.selectedPlan.id, formationName, draftSlots.map((slot) => ({ id: slot.id, code: slot.code, label: slot.label, x: slot.x, y: slot.y })));
      if (!result.ok) {
        const message = locale === "de"
          ? result.error === "A tactical formation needs exactly 11 positions." ? copy.eleven : copy.changeFailed
          : result.error || copy.changeFailed;
        throw new Error(message);
      }
      router.replace(`/squad/planner?plan=${data.selectedPlan.id}`);
      router.refresh();
      setSavingFormation(false);
    } catch (error) {
      setPlannerError(locale === "de" ? copy.changeFailed : error instanceof Error ? error.message : copy.changeFailed);
      setSavingFormation(false);
    }
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedSlotId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  if (!data.selectedPlan) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-board-navy">Create your first tactical plan</h2>
          <p className="mt-2 text-sm text-slate-600">Start with a formation, then assign your squad to starting slots and depth roles.</p>
          <CreatePlanForm className="mt-4" />
        </section>
        <PlannerHelp />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-board-green">{copy.heading} · {data.squad.name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PlanSelect plans={activePlans} selectedPlanId={data.selectedPlan.id} />
              {data.selectedPlan.isDefault ? <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-green-700">Default</span> : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {data.selectedPlan.formationCode === "Custom" ? copy.custom : data.selectedPlan.formationCode} · {starters.length}/{visibleSlots.length} {copy.starters} · {activeAssignments.length} {copy.depthAssignments}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form action={updateTacticalPlan} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="planId" value={data.selectedPlan.id} />
              <input type="hidden" name="name" value={data.selectedPlan.name} />
              <input type="hidden" name="notes" value={data.selectedPlan.notes ?? ""} />
              <input type="hidden" name="includeNewPlayersAutomatically" value={data.selectedPlan.includeNewPlayersAutomatically ? "on" : ""} />
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                Formation
                <select
                  name="formationCode"
                  defaultValue={data.selectedPlan.formationCode}
                  disabled={editingFormation}
                  className="h-10 rounded-md border border-board-line px-3 text-sm font-semibold"
                  onChange={(event) => {
                    const currentAssignments = activeAssignments.length;
                    if ((currentAssignments > 0 || data.selectedPlan?.formationCode === "Custom") && !window.confirm("Change formation? The current slot layout will be replaced. Compatible Player assignments will be preserved where possible.")) {
                      event.currentTarget.value = data.selectedPlan?.formationCode ?? "4-3-3";
                      return;
                    }
                    event.currentTarget.form?.requestSubmit();
                  }}
                >
                  {tacticalFormations.filter((formation) => formation.code !== "Custom" || data.selectedPlan?.formationCode === "Custom").map((formation) => (
                    <option key={formation.code} value={formation.code}>{formation.name}</option>
                  ))}
                </select>
              </label>
            </form>
            {(["formation", "depth"] as PlannerMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={cn(
                  "h-10 rounded-md px-3 text-sm font-bold transition",
                  mode === item ? "bg-board-navy text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {item === "formation" ? "Formation" : "Depth"}
              </button>
            ))}
            <span className="self-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500" aria-live="polite">
              {savingFormation || assigning ? copy.saving : editingFormation ? copy.unsaved : copy.saved}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-board-line pt-4">
          <details className="group rounded-md border border-board-line bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-bold text-board-navy">Rename / notes</summary>
          <form action={updateTacticalPlan} className="mt-3 hidden gap-3 group-open:grid md:grid-cols-2">
            <input type="hidden" name="planId" value={data.selectedPlan.id} />
            <input type="hidden" name="formationCode" value={data.selectedPlan.formationCode} />
            <label className="space-y-1 text-sm font-semibold text-slate-700">
              Plan name
              <input name="name" defaultValue={data.selectedPlan.name} className="h-10 w-full rounded-md border border-board-line px-3 text-sm font-normal" />
            </label>
            <label className="flex items-center gap-2 rounded-md border border-board-line px-3 text-sm font-semibold text-slate-700">
              <input name="includeNewPlayersAutomatically" type="checkbox" defaultChecked={data.selectedPlan.includeNewPlayersAutomatically} />
              Include new roster players
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-700 md:col-span-2">
              Plan notes
              <textarea name="notes" defaultValue={data.selectedPlan.notes ?? ""} rows={2} className="w-full rounded-md border border-board-line px-3 py-2 text-sm font-normal" />
            </label>
            <Button type="submit" className="self-end">Save</Button>
          </form>
          </details>
            <details className="group rounded-md border border-board-line bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-bold text-board-navy">New plan</summary>
              <div className="mt-3 hidden group-open:block"><CreatePlanForm compact /></div>
            </details>
            {data.selectedPlan.formationCode === "Custom" ? (
              <Button type="button" variant="secondary" onClick={() => { setDraftSlots(data.slots); setFormationName(data.selectedPlan?.name ?? ""); setEditingFormation(true); setMode("formation"); setSelectedSlotId(null); }}>
                {copy.edit}
              </Button>
            ) : (
              <form action={duplicateTacticalPlan}>
                <input type="hidden" name="planId" value={data.selectedPlan.id} />
                <input type="hidden" name="asCustom" value="on" />
                <Button type="submit" variant="secondary"><Copy className="h-4 w-4" />{copy.duplicate}</Button>
              </form>
            )}
            <details className="group relative rounded-md border border-board-line bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-bold text-board-navy">More</summary>
              <div className="absolute left-0 z-30 mt-2 hidden w-56 space-y-2 rounded-lg border border-board-line bg-white p-3 shadow-xl group-open:block max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:mt-0 max-sm:w-auto">
                <IconForm action={setDefaultTacticalPlan} planId={data.selectedPlan.id} label="Set default" icon={<Star className="h-4 w-4" />} disabled={data.selectedPlan.isDefault} />
                <IconForm action={duplicateTacticalPlan} planId={data.selectedPlan.id} label="Duplicate" icon={<Copy className="h-4 w-4" />} />
                <IconForm action={archiveTacticalPlan} planId={data.selectedPlan.id} label="Archive" icon={<Archive className="h-4 w-4" />} confirmMessage="Archive this tactical plan?" />
                <IconForm
                  action={deleteTacticalPlan}
                  planId={data.selectedPlan.id}
                  label="Delete tactical plan"
                  icon={<Trash2 className="h-4 w-4" />}
                  variant="danger"
                  confirmMessage={`Delete "${data.selectedPlan.name}"?\n\nThis permanently removes this tactical plan, formation slots, Starting XI assignments, depth assignments, inclusion/exclusion decisions, tactical roles and plan notes.\n\nPlayers, squad data, trainings, sessions and drills are not affected.`}
                />
              </div>
            </details>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft" onDragOver={(event) => { if (dragPlayerId) event.preventDefault(); }} onDrop={(event) => { if (!dragPlayerId || acceptedDrop.current) return; event.preventDefault(); finishPlayerDrag(); }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-board-navy">{editingFormation ? copy.edit : mode === "depth" ? copy.depthBoard : copy.board}</h3>
              <p className="text-sm text-slate-600">
                {editingFormation ? copy.editHint : mode === "depth" ? "Same formation geometry, focused on ordered tactical depth." : copy.selectPlayer}
              </p>
            </div>
            {!editingFormation ? <div className="flex flex-wrap gap-2">
              <AutoFillMenu
                planId={data.selectedPlan.id}
                slots={data.slots}
                players={data.players}
                assignments={activeAssignments}
                playerStates={data.playerStates}
              />
              <IconForm action={clearStartingXi} planId={data.selectedPlan.id} label="Clear XI" icon={<RotateCcw className="h-4 w-4" />} confirmMessage="Clear the current Starting XI? Depth rankings stay available." />
            </div> : null}
          </div>

          {editingFormation ? (
            <div className="mt-4 space-y-3 border-t border-board-line pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 space-y-1 text-sm font-semibold text-slate-700">
                  <span>{copy.name}</span>
                  <input value={formationName} onChange={(event) => setFormationName(event.target.value)} maxLength={100} className="h-10 w-full rounded-md border border-board-line px-3" />
                </label>
                <Button type="button" variant="secondary" onClick={() => {
                  const definition = makeSlotDefinition(`custom-${crypto.randomUUID()}`, "CM", 50, 50, draftSlots.length);
                  const next = { ...definition, id: crypto.randomUUID(), userId: data.selectedPlan!.userId, planId: data.selectedPlan!.id };
                  setDraftSlots((current) => [...current, next]);
                  setSelectedSlotId(next.id);
                }}><Plus className="h-4 w-4" />{copy.add}</Button>
              </div>
              {selectedSlot ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="space-y-1 text-xs font-bold text-slate-700">{copy.position}
                    <select value={selectedSlot.code} onChange={(event) => {
                      const code = event.target.value;
                      const definition = makeSlotDefinition(selectedSlot.slotKey, code, selectedSlot.x, selectedSlot.y, selectedSlot.sortOrder);
                      setDraftSlots((current) => current.map((slot) => slot.id === selectedSlot.id ? { ...slot, code, family: definition.family, naturalPositions: definition.naturalPositions, compatiblePositions: definition.compatiblePositions, acceptedPositions: definition.acceptedPositions, label: definition.label } : slot));
                    }} className="h-10 w-full rounded-md border border-board-line px-2">
                      {!canonicalPositionLabels[selectedSlot.code] ? <option value={selectedSlot.code}>{selectedSlot.code} · {selectedSlot.label}</option> : null}
                      {Object.entries(canonicalPositionLabels).map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-700">{copy.label}
                    <input value={selectedSlot.label} maxLength={40} onChange={(event) => setDraftSlots((current) => current.map((slot) => slot.id === selectedSlot.id ? { ...slot, label: event.target.value } : slot))} className="h-10 w-full rounded-md border border-board-line px-2" />
                  </label>
                  <Button type="button" variant="danger" onClick={() => {
                    if (activeAssignments.some((assignment) => assignment.slotId === selectedSlot.id) && !window.confirm(copy.removeWarning)) return;
                    setDraftSlots((current) => current.filter((slot) => slot.id !== selectedSlot.id));
                    setSelectedSlotId(null);
                  }}>{copy.remove}</Button>
                </div>
              ) : null}
              {draftSlots.length !== 11 ? <p className="text-sm font-semibold text-amber-800">{copy.eleven} ({draftSlots.length}/11)</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={saveFormation} disabled={savingFormation || draftSlots.length !== 11}>{savingFormation ? copy.saving : copy.save}</Button>
                <Button type="button" variant="secondary" onClick={() => { setDraftSlots(data.slots); setFormationName(data.selectedPlan?.name ?? ""); setSelectedSlotId(null); }}>{copy.reset}</Button>
                <Button type="button" variant="secondary" onClick={() => { setEditingFormation(false); setDraftSlots(data.slots); setSelectedSlotId(null); }}>{copy.cancel}</Button>
              </div>
            </div>
          ) : null}
          {plannerError ? <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{plannerError}</p> : null}

          <PlannerPitch className="mt-4" onClick={() => setSelectedSlotId(null)}>
            <FormationSlotRows
              planId={data.selectedPlan.id}
              slots={visibleSlots}
              selectedSlotId={selectedSlot?.id}
              assignmentsBySlot={assignmentsBySlot}
              playersById={playersById}
              includedPlayers={includedPlayers}
              mode={mode}
              customLayout={data.selectedPlan.formationCode === "Custom"}
              editingFormation={editingFormation}
              selectedPlayerId={selectedPlayerId}
              draggingPlayerId={dragPlayerId}
              hoverSlotId={hoverSlotId}
              onDragStart={startPlayerDrag}
              onDragEnd={finishPlayerDrag}
              onDragOverSlot={setHoverSlotId}
              onAssign={assignPlayer}
              onSelectPlayer={setSelectedPlayerId}
              onMoveSlot={(slotId, x, y) => setDraftSlots((current) => current.map((slot) => slot.id === slotId ? { ...slot, x, y } : slot))}
              onOptimisticUpdate={applyOptimisticUpdate}
              onSelect={(slotId) => {
                if (selectedPlayerId && !editingFormation) { void assignPlayer(selectedPlayerId, slotId); return; }
                setSelectedSlotId((current) => (current === slotId ? null : slotId));
              }}
            />
          </PlannerPitch>
          {!editingFormation && mode === "formation" && selectedSlot ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
              <span className="text-xs font-bold text-board-navy">{selectedSlot.label}</span>
              {selectedSlotDepth.find((assignment) => assignment.isPreferredStarter) ? (
                <>
                  <Button type="button" variant="secondary" className="h-9 px-2 text-xs" onClick={() => setSelectedPlayerId(selectedSlotDepth.find((assignment) => assignment.isPreferredStarter)!.playerId)}>{copy.assign}</Button>
                  <Button type="button" variant="secondary" className="h-9 px-2 text-xs" onClick={() => void assignPlayer(selectedSlotDepth.find((assignment) => assignment.isPreferredStarter)!.playerId, null)}>{copy.removeFromXi}</Button>
                </>
              ) : null}
            </div>
          ) : null}
          {!editingFormation && mode === "formation" ? (
            <div className="mt-4 rounded-md border border-board-line bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-board-navy">{copy.available}</h4>
                <span className="text-xs text-slate-500">{unassignedPlayers.length}</span>
              </div>
              <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                {unassignedPlayers.map((player) => (
                  <button key={player.id} type="button" draggable onDragStart={(event) => startPlayerDrag(event, player.id)} onDragEnd={finishPlayerDrag} onClick={() => setSelectedPlayerId((current) => current === player.id ? null : player.id)}
                    className={cn("max-w-full rounded-md border bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-board-navy shadow-sm transition", selectedPlayerId === player.id ? "border-board-green ring-2 ring-board-green/30" : "border-board-line hover:border-board-green", dragPlayerId === player.id && "opacity-40")}
                    aria-pressed={selectedPlayerId === player.id} title={copy.selectPlayer}>
                    <span translate="no" className="block truncate">{playerName(player)}</span><span className="text-[10px] text-slate-500">{playerPositionText(player)}</span>
                  </button>
                ))}
              </div>
              <div data-planner-unassigned onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const playerId = event.dataTransfer.getData("text/plain"); if (playerId) void assignPlayer(playerId, null); }} className={cn("mt-3 rounded-md border border-dashed px-3 py-2 text-center text-xs font-bold", dragPlayerId ? "border-board-green bg-green-50 text-board-green" : "border-board-line text-slate-500")}>{copy.unassigned}</div>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          {!editingFormation ? <SlotDepthPanel
            planId={data.selectedPlan.id}
            slot={editingFormation ? undefined : selectedSlot}
            depth={selectedSlotDepth}
            playersById={playersById}
            availablePlayers={includedPlayers}
            assignedPlayerIds={assignedPlayerIds}
          /> : null}

          <PlayerPoolPanel
            planId={data.selectedPlan.id}
            players={data.players}
            includedPlayers={includedPlayers}
            unassignedPlayers={unassignedPlayers}
            excludedPlayerIds={excludedPlayerIds}
            statesByPlayer={statesByPlayer}
            showTrials={showTrials}
            search={search}
            selectedSlot={editingFormation ? undefined : selectedSlot}
            assignments={activeAssignments}
            slots={data.slots}
            poolFilter={poolFilter}
            roleFilter={roleFilter}
            positionFilter={positionFilter}
            onPoolFilterChange={setPoolFilter}
            onRoleFilterChange={setRoleFilter}
            onPositionFilterChange={setPositionFilter}
            onShowTrialsChange={setShowTrials}
            onSearchChange={setSearch}
            onPlayerDragStart={startPlayerDrag}
            draggingPlayerId={dragPlayerId}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={(playerId) => { setSelectedPlayerId((current) => current === playerId ? null : playerId); setMode("formation"); }}
          />

          {data.warnings.length > 0 ? (
            <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
              <h3 className="font-bold text-board-navy">Planner checks</h3>
              <div className="mt-3 space-y-2">
                {data.warnings.map((warning) => (
                  <p
                    key={warning.message}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-semibold",
                      warning.level === "warning" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"
                    )}
                  >
                    {warning.message}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          <ArchivedPlans plans={archivedPlans} />
        </aside>
      </div>
      {dragPlayerId && dragPoint ? (
        <div data-planner-drag-ghost className="pointer-events-none fixed z-[100] max-w-40 -translate-x-1/2 -translate-y-1/2 rounded-md border border-board-green bg-white px-3 py-2 text-sm font-bold text-board-navy shadow-xl" style={{ left: dragPoint.x, top: dragPoint.y }} aria-hidden="true">
          <span translate="no">{playersById.get(dragPlayerId) ? playerName(playersById.get(dragPlayerId)!) : ""}</span>
        </div>
      ) : null}
    </div>
  );
}

function CreatePlanForm({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <form action={createTacticalPlan} className={cn("flex flex-col gap-2 sm:flex-row", className)}>
      <input name="name" placeholder="Plan name" className="h-10 min-w-0 rounded-md border border-board-line px-3 text-sm" />
      <select name="formationCode" defaultValue="4-3-3" className="h-10 rounded-md border border-board-line px-3 text-sm">
        {tacticalFormations.map((formation) => (
          <option key={formation.code} value={formation.code}>{formation.name}</option>
        ))}
      </select>
      <Button type="submit" className={compact ? "px-3" : ""}>Create plan</Button>
    </form>
  );
}

function PlanSelect({ plans, selectedPlanId }: { plans: TacticalPlannerData["plans"]; selectedPlanId: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      Plan
      <select
        value={selectedPlanId}
        onChange={(event) => {
          router.push(`/squad/planner?plan=${event.target.value}`);
        }}
        disabled={plans.length <= 1}
        className="h-10 min-w-48 rounded-md border border-board-line px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      >
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>{plan.name}{plan.isDefault ? " · Default" : ""}</option>
        ))}
      </select>
    </label>
  );
}

function PlannerPitch({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative mx-auto aspect-[68/105] w-full max-w-[820px] overflow-hidden rounded-xl border border-emerald-950/20 bg-emerald-800 shadow-inner",
        "bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_50%,transparent_50%)] bg-[length:44px_44px]",
        className
      )}
      role="img"
      aria-label="Football pitch planner surface with tactical position cards"
    >
      <FootballPitchSvg />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

function FootballPitchSvg() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full text-white/70" viewBox="0 0 680 1050" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="planner-net" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
        </pattern>
      </defs>
      <rect x="40" y="45" width="600" height="960" rx="5" fill="none" stroke="currentColor" strokeWidth="5.5" />
      <line x1="40" y1="525" x2="640" y2="525" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="340" cy="525" r="91.5" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="340" cy="525" r="5.5" fill="currentColor" opacity="0.9" />

      <rect x="151.6" y="45" width="376.8" height="165" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <rect x="249.2" y="45" width="181.6" height="55" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="340" cy="155" r="4.5" fill="currentColor" />
      <path d="M 267 210 A 91.5 91.5 0 0 0 413 210" fill="none" stroke="currentColor" strokeWidth="3.5" opacity="0.7" />

      <rect x="151.6" y="840" width="376.8" height="165" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <rect x="249.2" y="950" width="181.6" height="55" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="340" cy="895" r="4.5" fill="currentColor" />
      <path d="M 267 840 A 91.5 91.5 0 0 1 413 840" fill="none" stroke="currentColor" strokeWidth="3.5" opacity="0.7" />

      <path d="M 40 75 A 30 30 0 0 0 70 45" fill="none" stroke="currentColor" strokeWidth="3.2" opacity="0.7" />
      <path d="M 610 45 A 30 30 0 0 0 640 75" fill="none" stroke="currentColor" strokeWidth="3.2" opacity="0.7" />
      <path d="M 70 1005 A 30 30 0 0 0 40 975" fill="none" stroke="currentColor" strokeWidth="3.2" opacity="0.7" />
      <path d="M 640 975 A 30 30 0 0 0 610 1005" fill="none" stroke="currentColor" strokeWidth="3.2" opacity="0.7" />

      <g opacity="0.85">
        <rect x="290" y="18" width="100" height="27" rx="3.5" fill="none" stroke="currentColor" strokeWidth="4.5" />
        <rect x="300" y="0" width="80" height="18" fill="url(#planner-net)" stroke="currentColor" strokeWidth="2.8" />
        <rect x="290" y="1005" width="100" height="27" rx="3.5" fill="none" stroke="currentColor" strokeWidth="4.5" />
        <rect x="300" y="1032" width="80" height="18" fill="url(#planner-net)" stroke="currentColor" strokeWidth="2.8" />
      </g>
    </svg>
  );
}

function AutoFillMenu({
  planId,
  slots,
  players,
  assignments,
  playerStates
}: {
  planId: string;
  slots: TacticalPlanSlot[];
  players: SquadPlayer[];
  assignments: TacticalPlannerData["assignments"];
  playerStates: TacticalPlannerData["playerStates"];
}) {
  const [mode, setMode] = useState<AutoFillMode>("empty_xi");
  const [eligibility, setEligibility] = useState<AutoFillEligibility>("natural_secondary");
  const [includeTrials, setIncludeTrials] = useState(false);
  const [allowOutOfPosition, setAllowOutOfPosition] = useState(false);
  const preview = useMemo(
    () => buildAutoFillPreview({ mode, eligibility, includeTrials, allowOutOfPosition, slots, players, assignments, playerStates }),
    [allowOutOfPosition, assignments, eligibility, includeTrials, mode, playerStates, players, slots]
  );
  const starterCount = assignments.filter((assignment) => assignment.isPreferredStarter).length;
  return (
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md bg-board-green px-3 text-sm font-bold text-white shadow-sm transition hover:bg-board-green/90">
        <Users className="h-4 w-4" />
        Auto-fill
      </summary>
      <form
        action={autoFillTacticalPlan}
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);
          const selectedMode = formData.get("mode");
          if ((selectedMode === "rebuild_all" || selectedMode === "rebuild_xi") && assignments.length > 0 && !window.confirm(selectedMode === "rebuild_all" ? "Rebuild Starting XI and depth? Existing assignments will be replaced after you apply." : "Rebuild Starting XI? Existing starters will be replaced, but depth assignments stay available.")) {
            event.preventDefault();
          }
        }}
        className="absolute right-0 z-30 mt-2 hidden max-h-[min(760px,calc(100vh-7rem))] w-[30rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-board-line bg-white p-4 shadow-xl group-open:block max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:mt-0 max-sm:w-auto"
      >
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="eligibility" value={eligibility} />
        <div>
          <h3 className="font-bold text-board-navy">Auto-fill tactical plan</h3>
          <p className="mt-1 text-xs text-slate-600">Choose what CoachBoard may create. Nothing changes until you apply the preview.</p>
        </div>
        <fieldset className="mt-4 space-y-2">
          <legend className="text-xs font-black uppercase tracking-wide text-board-green">How should Auto-fill update this plan?</legend>
          <AutoFillRadio name="modeOption" checked={mode === "empty_xi"} onChange={() => setMode("empty_xi")} label="Fill empty Starting XI positions" />
          <AutoFillRadio name="modeOption" checked={mode === "xi_depth"} onChange={() => setMode("xi_depth")} label="Fill empty Starting XI slots and add one backup" />
          <AutoFillRadio name="modeOption" checked={mode === "xi_all_depth"} onChange={() => setMode("xi_all_depth")} label="Fill empty Starting XI slots and add all eligible depth" />
          <AutoFillRadio name="modeOption" checked={mode === "rebuild_xi"} onChange={() => setMode("rebuild_xi")} label="Rebuild Starting XI only" tone="danger" />
          <AutoFillRadio name="modeOption" checked={mode === "rebuild_all"} onChange={() => setMode("rebuild_all")} label="Rebuild Starting XI and depth" tone="danger" />
        </fieldset>
        <div className="mt-3 rounded-md border border-board-line bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-black uppercase tracking-wide text-board-green">Current plan</p>
          <p className="mt-1">{starterCount} of {slots.length} starters assigned · {assignments.length} depth assignments</p>
          <p className="mt-1">{describeAutoFillMode(mode)}</p>
        </div>
        <fieldset className="mt-4 space-y-2">
          <legend className="text-xs font-black uppercase tracking-wide text-board-green">Which Players may Auto-fill use?</legend>
          <AutoFillRadio name="eligibilityOption" checked={eligibility === "natural"} onChange={() => setEligibility("natural")} label="Natural positions only" detail="Use only Players whose primary position matches the tactical position." />
          <AutoFillRadio name="eligibilityOption" checked={eligibility === "natural_secondary"} onChange={() => setEligibility("natural_secondary")} label="Natural and secondary positions" detail="Also use positions the coach has explicitly stored as secondary positions." />
          <AutoFillRadio name="eligibilityOption" checked={eligibility === "natural_secondary_compatible"} onChange={() => setEligibility("natural_secondary_compatible")} label="Natural, secondary and compatible positions" detail="Also use explicitly related alternatives such as RWB at RB. Compatible Players are marked clearly." />
        </fieldset>
        <label className="mt-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" name="includeTrials" checked={includeTrials} onChange={(event) => setIncludeTrials(event.target.checked)} />
          Include trial players
        </label>
        <label className="mt-2 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
          <input type="checkbox" name="allowOutOfPosition" checked={allowOutOfPosition} onChange={(event) => setAllowOutOfPosition(event.target.checked)} className="mt-0.5" />
          <span>
            Allow out-of-position assignments when no suitable player exists
            <span className="mt-1 block font-normal text-red-700">These assignments are clearly marked and are off by default.</span>
          </span>
        </label>
        <div className="mt-3 rounded-md border border-board-line bg-slate-50 p-3">
          <p className="text-xs font-black uppercase text-board-green">Preview</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700">
            <span>{preview.filledStarters}/{slots.length} starters</span>
            <span>{preview.newStarters} new starters</span>
            <span>{preview.backupsAdded} backups</span>
            <span>{preview.allDepthAdded} depth additions</span>
            <span>{preview.unassignedCount} unassigned</span>
            <span>{preview.compatibleCount} compatible used</span>
            <span className="col-span-2 text-red-700">{preview.outOfPositionCount} out of position</span>
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-xs">
            {preview.rows.map((row) => (
              <div key={row.slotId} className="rounded bg-white px-2 py-1">
                <p className="flex justify-between gap-2">
                  <span className="font-bold text-slate-700">{row.slotCode}</span>
                  <span className={cn("truncate", row.fitType === "out_of_position" ? "text-red-700" : "text-slate-600")}>{row.playerName}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{row.detail}</p>
              </div>
            ))}
          </div>
          {preview.messages.length > 0 ? (
            <div className="mt-2 space-y-1 text-xs text-amber-700">
              {preview.messages.map((message) => <p key={message}>{message}</p>)}
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">Position fit is ranked before tactical role. Compatible and out-of-position players are only used when explicitly allowed.</p>
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>Cancel</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={(event) => event.currentTarget.closest("form")?.querySelector("fieldset")?.scrollIntoView({ block: "nearest" })}
          >
            Back
          </Button>
          <AutoFillSubmitButton rebuild={mode === "rebuild_all" || mode === "rebuild_xi"} />
        </div>
      </form>
    </details>
  );
}

function AutoFillSubmitButton({ rebuild }: { rebuild: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (rebuild ? "Rebuilding..." : "Applying...") : "Apply Auto-fill"}
    </Button>
  );
}

function AutoFillRadio({
  name,
  checked,
  onChange,
  label,
  detail,
  tone = "default"
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  detail?: string;
  tone?: "default" | "danger";
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs", checked ? "border-board-green bg-green-50" : "border-board-line bg-white", tone === "danger" ? "text-red-800" : "text-slate-700")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5" />
      <span>
        <span className="block font-bold">{label}</span>
        {detail ? <span className="mt-0.5 block text-slate-500">{detail}</span> : null}
      </span>
    </label>
  );
}

function describeAutoFillMode(mode: AutoFillMode) {
  if (mode === "xi_depth") return "Keeps existing assignments, fills empty starters and adds one backup where a slot has no backup yet.";
  if (mode === "xi_all_depth") return "Keeps existing assignments, fills empty starters and appends every remaining eligible player to depth.";
  if (mode === "rebuild_xi") return "Replaces current starters, while preserving existing depth assignments.";
  if (mode === "rebuild_all") return "Replaces the Starting XI and ordered depth assignments.";
  return "Keeps all existing assignments and fills only empty Starting XI slots.";
}

function IconForm({
  action,
  planId,
  label,
  icon,
  disabled,
  confirmMessage,
  variant = "secondary"
}: {
  action: (formData: FormData) => void | Promise<void>;
  planId: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  confirmMessage?: string;
  variant?: "secondary" | "danger";
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <input type="hidden" name="planId" value={planId} />
      <Button type="submit" variant={variant} disabled={disabled} className="w-full justify-start px-3">
        {icon}
        {label}
      </Button>
    </form>
  );
}

function FormationSlotRows({
  planId,
  slots,
  selectedSlotId,
  assignmentsBySlot,
  playersById,
  includedPlayers,
  mode,
  customLayout,
  editingFormation,
  selectedPlayerId,
  draggingPlayerId,
  hoverSlotId,
  onDragStart,
  onDragEnd,
  onDragOverSlot,
  onAssign,
  onSelectPlayer,
  onMoveSlot,
  onOptimisticUpdate,
  onSelect
}: {
  planId: string;
  slots: TacticalPlanSlot[];
  selectedSlotId?: string;
  assignmentsBySlot: Map<string, TacticalPlannerData["assignments"]>;
  playersById: Map<string, SquadPlayer>;
  includedPlayers: SquadPlayer[];
  mode: PlannerMode;
  customLayout: boolean;
  editingFormation: boolean;
  selectedPlayerId: string | null;
  draggingPlayerId: string | null;
  hoverSlotId: string | null;
  onDragStart: (event: React.DragEvent<HTMLElement>, playerId: string) => void;
  onDragEnd: () => void;
  onDragOverSlot: (slotId: string | null) => void;
  onAssign: (playerId: string, slotId: string | null) => Promise<void>;
  onSelectPlayer: (playerId: string | null) => void;
  onMoveSlot: (slotId: string, x: number, y: number) => void;
  onOptimisticUpdate: (update: OptimisticSlotUpdate) => void;
  onSelect: (slotId: string) => void;
}) {
  const copy = plannerCopy[useOptionalI18n()?.locale ?? "en"];
  const movingSlot = useRef<string | null>(null);
  if (mode === "formation" || editingFormation || customLayout) {
    const selectedSlot = selectedSlotId ? slots.find((slot) => slot.id === selectedSlotId) : undefined;
    const selectedStarter = selectedSlot ? assignmentsBySlot.get(selectedSlot.id)?.find((assignment) => assignment.isPreferredStarter) : undefined;
    return (
      <div className="relative h-full w-full">
        {slots.map((slot) => {
          const assignments = assignmentsBySlot.get(slot.id) ?? [];
          const starter = assignments.find((assignment) => assignment.isPreferredStarter);
          const player = starter ? playersById.get(starter.playerId) : undefined;
          const isDropTarget = hoverSlotId === slot.id && Boolean(draggingPlayerId);
          return (
            <div key={slot.id} data-planner-slot={slot.id} role="button" tabIndex={0}
              draggable={mode === "formation" && !editingFormation && Boolean(player)}
              onDragStart={(event) => { if (player) onDragStart(event, player.id); }}
              onDragEnd={onDragEnd}
              onDragOver={(event) => { if (editingFormation || mode !== "formation") return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; onDragOverSlot(slot.id); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) onDragOverSlot(null); }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDragOverSlot(null); const playerId = event.dataTransfer.getData("text/plain"); if (playerId) void onAssign(playerId, slot.id); }}
              onPointerDown={(event) => { if (!editingFormation) return; movingSlot.current = slot.id; if (selectedSlotId !== slot.id) onSelect(slot.id); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
              onPointerMove={(event) => {
                if (!editingFormation || movingSlot.current !== slot.id) return;
                const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                if (!rect || !rect.width || !rect.height) return;
                onMoveSlot(slot.id, Math.round(Math.max(8, Math.min(92, (event.clientX - rect.left) / rect.width * 100)) * 100) / 100, Math.round(Math.max(12, Math.min(90, (event.clientY - rect.top) / rect.height * 100)) * 100) / 100);
              }}
              onPointerUp={() => { movingSlot.current = null; }}
              onPointerCancel={() => { movingSlot.current = null; }}
              onClick={(event) => { event.stopPropagation(); if (!editingFormation) onSelect(slot.id); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(slot.id); } }}
              style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: "translate(-50%, -50%)" }}
              className={cn("absolute z-20 flex w-[18%] min-w-[3.25rem] max-w-[7rem] cursor-pointer flex-col gap-0.5 rounded-md border bg-white px-1.5 py-1.5 text-center text-board-navy shadow-md transition-[box-shadow,background-color,opacity] duration-200 sm:px-2 sm:py-2",
                selectedSlotId === slot.id ? "border-board-green ring-2 ring-board-green/30" : "border-white/80",
                isDropTarget && "border-board-green bg-emerald-50 ring-4 ring-emerald-200",
                draggingPlayerId === player?.id && "opacity-40",
                editingFormation && "cursor-grab border-dashed border-board-green touch-none active:cursor-grabbing")}
              aria-label={`${slot.label}: ${player ? playerName(player) : copy.drop}`}>
              <span className="truncate text-[10px] font-black uppercase text-board-green sm:text-xs" title={slot.label}>{slot.code}</span>
              {canonicalPositionLabels[slot.code] && slot.label !== canonicalPositionLabels[slot.code] && slot.label !== slot.code ? <span className="truncate text-[9px] font-semibold text-slate-500" title={slot.label}>{slot.label}</span> : null}
              <span translate="no" className="line-clamp-2 break-words text-[10px] font-bold leading-tight sm:text-xs" title={player ? playerName(player) : copy.drop}>{player ? playerName(player) : "+"}</span>
              {mode === "depth" ? <span className="text-[9px] font-semibold text-slate-500">{assignments.length} {copy.depthOptions}</span> : null}
              {starter?.fitType === "out_of_position" ? <span className="text-[9px] font-bold text-red-700" title={copy.outOfPosition}>!</span> : null}
              {editingFormation ? <GripVertical className="mx-auto h-3 w-3 text-board-green" aria-hidden="true" /> : null}
            </div>
          );
        })}
        {selectedSlot && !editingFormation && !selectedPlayerId ? (
          <SlotEditorOverlay planId={planId} slot={selectedSlot} depth={assignmentsBySlot.get(selectedSlot.id) ?? []} playersById={playersById} availablePlayers={includedPlayers}
            eligibleCount={includedPlayers.filter((player) => isFitAllowedByAutoFillEligibility(evaluatePlayerSlotFit(player, selectedSlot, false).fitType, "natural_secondary", false)).length}
            onOptimisticUpdate={onOptimisticUpdate}>
            {selectedStarter ? <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded border border-board-line px-2 py-1 text-xs font-bold" onClick={() => onSelectPlayer(selectedStarter.playerId)}>{copy.assign}</button>
              <button type="button" className="rounded border border-board-line px-2 py-1 text-xs font-bold" onClick={() => void onAssign(selectedStarter.playerId, null)}>{copy.removeFromXi}</button>
            </div> : null}
          </SlotEditorOverlay>
        ) : null}
      </div>
    );
  }
  const rows = groupSlotsIntoPitchRows(slots);
  const selectedSlot = selectedSlotId ? slots.find((slot) => slot.id === selectedSlotId) : undefined;
  const selectedDepth = selectedSlot ? (assignmentsBySlot.get(selectedSlot.id) ?? []) : [];
  const selectedEligibleCount = selectedSlot
    ? includedPlayers.filter((player) => {
        const fit = evaluatePlayerSlotFit(player, selectedSlot, false);
        return isFitAllowedByAutoFillEligibility(fit.fitType, "natural_secondary", false);
      }).length
    : 0;
  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col justify-between gap-4 px-[7%] py-[8%]">
      {rows.map((row) => (
        <div
          key={row.key}
          className="mx-auto grid w-full justify-center gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: `repeat(${row.slots.length}, minmax(0, 1fr))`,
            maxWidth: rowWidth(row.slots.length)
          }}
        >
          {row.slots.map((slot) => (
            <SlotButton
              key={slot.id}
              slot={slot}
              selected={selectedSlotId === slot.id}
              assignments={assignmentsBySlot.get(slot.id) ?? []}
              playersById={playersById}
              eligibleCount={includedPlayers.filter((player) => {
                const fit = evaluatePlayerSlotFit(player, slot, false);
                return isFitAllowedByAutoFillEligibility(fit.fitType, "natural_secondary", false);
              }).length}
              mode={mode}
              onSelect={() => onSelect(slot.id)}
            />
          ))}
        </div>
      ))}
      {selectedSlot ? (
        <SlotEditorOverlay
          planId={planId}
          slot={selectedSlot}
          depth={selectedDepth}
          playersById={playersById}
          availablePlayers={includedPlayers}
          eligibleCount={selectedEligibleCount}
          onOptimisticUpdate={onOptimisticUpdate}
        />
      ) : null}
    </div>
  );
}

function rowWidth(slotCount: number) {
  if (slotCount <= 1) return "34%";
  if (slotCount === 2) return "52%";
  if (slotCount === 3) return "76%";
  if (slotCount === 4) return "91%";
  return "94%";
}

function groupSlotsIntoPitchRows(slots: TacticalPlanSlot[]) {
  const groups = new Map<number, TacticalPlanSlot[]>();
  for (const slot of slots) {
    const yBand = Math.round(slot.y / 8) * 8;
    groups.set(yBand, [...(groups.get(yBand) ?? []), slot]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([yBand, rowSlots]) => ({
      key: String(yBand),
      slots: [...rowSlots].sort((a, b) => a.x - b.x || a.sortOrder - b.sortOrder)
    }));
}

function uniqueDepthAssignments(assignments: TacticalPlannerData["assignments"]) {
  const best = new Map<string, TacticalPlannerData["assignments"][number]>();
  for (const assignment of assignments) {
    const key = `${assignment.slotId}:${assignment.playerId}`;
    const existing = best.get(key);
    if (!existing || assignment.isPreferredStarter || assignment.depthOrder < existing.depthOrder) {
      best.set(key, assignment);
    }
  }
  return Array.from(best.values()).sort((a, b) => a.depthOrder - b.depthOrder);
}

function optimisticStartingXi(assignments: TacticalAssignment[], planId: string, player: SquadPlayer, targetSlotId: string | null, slots: TacticalPlanSlot[]): TacticalAssignment[] {
  const source = assignments.find((item) => item.playerId === player.id && item.isPreferredStarter);
  if (source?.slotId === targetSlotId) return assignments;
  const displaced = targetSlotId ? assignments.find((item) => item.slotId === targetSlotId && item.isPreferredStarter && item.playerId !== player.id) : undefined;
  let next = assignments.map((item) => source?.id === item.id || displaced?.id === item.id ? { ...item, isPreferredStarter: false } : item);
  const place = (playerId: string, slotId: string) => {
    const existing = next.find((item) => item.playerId === playerId && item.slotId === slotId);
    if (existing) {
      next = next.map((item) => item.id === existing.id ? { ...item, isPreferredStarter: true } : item);
      return;
    }
    const slot = slots.find((item) => item.id === slotId);
    if (!slot) return;
    const now = new Date().toISOString();
    next = [...next, { id: `optimistic-${playerId}-${slotId}`, userId: slot.userId, planId, slotId, playerId,
      depthOrder: Math.max(0, ...next.filter((item) => item.slotId === slotId).map((item) => item.depthOrder)) + 1,
      isPreferredStarter: true, fitType: playerId === player.id ? evaluatePlayerSlotFit(player, slot).fitType : "no_data", createdAt: now, updatedAt: now }];
  };
  if (targetSlotId) place(player.id, targetSlotId);
  if (source && displaced && source.slotId !== targetSlotId) place(displaced.playerId, source.slotId);
  return next;
}

function applyOptimisticSlotUpdate(assignments: TacticalAssignment[], planId: string, update: OptimisticSlotUpdate) {
  if (update.type === "add") {
    if (assignments.some((assignment) => assignment.slotId === update.slot.id && assignment.playerId === update.player.id)) return assignments;
    const slotAssignments = assignments.filter((assignment) => assignment.slotId === update.slot.id);
    const fit = evaluatePlayerSlotFit(update.player, update.slot);
    const now = new Date().toISOString();
    return normalizeSlotDepth([
      ...assignments,
      {
        id: `optimistic-${update.slot.id}-${update.player.id}`,
        userId: update.slot.userId,
        planId,
        slotId: update.slot.id,
        playerId: update.player.id,
        depthOrder: slotAssignments.length + 1,
        isPreferredStarter: slotAssignments.length === 0,
        fitType: fit.fitType,
        createdAt: now,
        updatedAt: now
      }
    ], update.slot.id);
  }

  const target = assignments.find((assignment) => assignment.id === update.assignmentId);
  if (!target) return assignments;

  if (update.type === "remove") {
    return normalizeSlotDepth(assignments.filter((assignment) => assignment.id !== update.assignmentId), target.slotId);
  }

  if (update.type === "starter") {
    const slotAssignments = assignments
      .filter((assignment) => assignment.slotId === target.slotId)
      .sort((a, b) => a.depthOrder - b.depthOrder)
      .filter((assignment) => assignment.id !== target.id);
    const reordered = [target, ...slotAssignments];
    return assignments.map((assignment) => {
      const nextIndex = reordered.findIndex((item) => item.id === assignment.id);
      if (assignment.slotId === target.slotId && nextIndex >= 0) {
        return { ...assignment, depthOrder: nextIndex + 1, isPreferredStarter: nextIndex === 0 };
      }
      if (assignment.playerId === target.playerId) return { ...assignment, isPreferredStarter: false };
      return assignment;
    });
  }

  if (update.type === "move" || update.type === "moveToRank") {
    const slotAssignments = assignments
      .filter((assignment) => assignment.slotId === target.slotId)
      .sort((a, b) => a.depthOrder - b.depthOrder);
    const currentIndex = slotAssignments.findIndex((assignment) => assignment.id === target.id);
    if (currentIndex < 0) return assignments;
    const next = slotAssignments.filter((assignment) => assignment.id !== target.id);
    const targetIndex = update.type === "move"
      ? Math.max(0, Math.min(next.length, currentIndex + (update.direction === "down" ? 1 : -1)))
      : Math.max(0, Math.min(next.length, update.targetRank - 1));
    next.splice(targetIndex, 0, target);
    return assignments.map((assignment) => {
      const nextIndex = next.findIndex((item) => item.id === assignment.id);
      if (assignment.slotId === target.slotId && nextIndex >= 0) {
        return { ...assignment, depthOrder: nextIndex + 1, isPreferredStarter: nextIndex === 0 };
      }
      return assignment;
    });
  }

  return assignments;
}

function normalizeSlotDepth(assignments: TacticalAssignment[], slotId: string) {
  const slotAssignments = uniqueDepthAssignments(assignments.filter((assignment) => assignment.slotId === slotId))
    .sort((a, b) => Number(b.isPreferredStarter) - Number(a.isPreferredStarter) || a.depthOrder - b.depthOrder);
  const slotIds = new Set(slotAssignments.map((assignment) => assignment.id));
  return assignments
    .filter((assignment) => assignment.slotId !== slotId || slotIds.has(assignment.id))
    .map((assignment) => {
      const nextIndex = slotAssignments.findIndex((item) => item.id === assignment.id);
      if (assignment.slotId === slotId && nextIndex >= 0) {
        return { ...assignment, depthOrder: nextIndex + 1, isPreferredStarter: nextIndex === 0 };
      }
      return assignment;
    });
}

function SlotButton({
  slot,
  selected,
  assignments,
  playersById,
  eligibleCount,
  mode,
  onSelect
}: {
  slot: TacticalPlanSlot;
  selected: boolean;
  assignments: TacticalPlannerData["assignments"];
  playersById: Map<string, SquadPlayer>;
  eligibleCount: number;
  mode: PlannerMode;
  onSelect: () => void;
}) {
  const orderedAssignments = uniqueDepthAssignments(assignments).sort((a, b) => a.depthOrder - b.depthOrder);
  const starter = orderedAssignments.find((assignment) => assignment.isPreferredStarter) ?? orderedAssignments[0];
  const starterPlayer = starter ? playersById.get(starter.playerId) : undefined;
  const depthCount = orderedAssignments.length;
  const displayText = starterPlayer ? playerName(starterPlayer) : "No Player ranked";
  const alternatives = orderedAssignments.filter((assignment) => assignment.id !== starter?.id).slice(0, 2);
  const rankingPreview = orderedAssignments.slice(0, 3);
  const remainingCount = Math.max(0, orderedAssignments.length - (mode === "depth" ? rankingPreview.length : 1 + alternatives.length));
  const additionalEligibleCount = Math.max(0, eligibleCount - depthCount);
  const depthTitle =
    depthCount === 0
      ? "No Player ranked for this position"
      : depthCount === 1
        ? "Only one Player ranked for this position"
      : depthCount === 2
        ? "Two Players ranked for this position"
        : `${numberWord(depthCount)} Players ranked for this position`;

  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        "min-h-12 w-full rounded-lg border p-1.5 text-left shadow-lg transition sm:min-h-[5.9rem] sm:p-2",
        selected ? "border-board-green bg-white text-board-navy ring-4 ring-board-green/25" : "border-white/80 bg-white text-slate-800 hover:bg-white"
      )}
      role="button"
      tabIndex={0}
      title={`${depthCount} Players currently ranked. ${additionalEligibleCount} additional eligible Players available.`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
        }
      }}
    >
      <span className="flex items-center justify-between gap-1 sm:gap-2">
        <span className="text-xs font-black uppercase text-board-green">{slot.code}</span>
        <span
          className={cn(
            "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black ring-1 sm:h-5 sm:min-w-5 sm:px-1.5 sm:text-[11px]",
            depthCount <= 1 ? "bg-red-100 text-red-800 ring-red-300" : "bg-slate-100 text-slate-700 ring-slate-200"
          )}
          title={depthTitle}
          aria-label={depthCount <= 1 ? `Low depth: ${depthTitle}` : depthTitle}
        >
          {depthCount}
        </span>
      </span>
      <span className="mt-1 hidden text-sm font-black leading-tight text-board-navy sm:line-clamp-2" title={displayText}>{displayText}</span>
      {!selected && mode === "formation" && alternatives.length > 0 ? (
        <div className="mt-1 hidden space-y-0.5 sm:block">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Alternatives</p>
          {alternatives.map((assignment) => {
            const player = playersById.get(assignment.playerId);
            if (!player) return null;
            return <p translate="no" key={assignment.id} className="line-clamp-2 text-xs font-semibold leading-tight text-slate-600" title={playerName(player)}>{playerName(player)}</p>;
          })}
          {remainingCount > 0 ? <p className="text-xs font-bold text-slate-500">+{remainingCount} more</p> : null}
        </div>
      ) : null}
      {!selected && mode === "depth" ? (
        <div className="mt-1 hidden space-y-0.5 sm:block">
          {rankingPreview.length === 0 ? <p className="text-xs font-semibold text-slate-500">No Player ranked</p> : rankingPreview.map((assignment, index) => {
            const player = playersById.get(assignment.playerId);
            if (!player) return null;
            return <p key={assignment.id} className="line-clamp-2 text-xs font-semibold leading-tight text-slate-700" title={playerName(player)}>{index + 1}. {playerName(player)}</p>;
          })}
          {remainingCount > 0 ? <p className="text-xs font-bold text-slate-500">+{remainingCount} more</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function SlotEditorOverlay({
  planId,
  slot,
  depth,
  playersById,
  availablePlayers,
  eligibleCount,
  onOptimisticUpdate,
  children
}: {
  planId: string;
  slot: TacticalPlanSlot;
  depth: TacticalPlannerData["assignments"];
  playersById: Map<string, SquadPlayer>;
  availablePlayers: SquadPlayer[];
  eligibleCount: number;
  onOptimisticUpdate: (update: OptimisticSlotUpdate) => void;
  children?: ReactNode;
}) {
  const left = Math.min(Math.max(slot.x, 18), 82);
  const top = Math.min(Math.max(slot.y + 6, 14), 76);
  const alignClass = slot.x < 32 ? "left-4 translate-x-0" : slot.x > 68 ? "right-4 translate-x-0" : "-translate-x-1/2";
  const style = slot.x < 32 || slot.x > 68 ? { top: `${top}%` } : { left: `${left}%`, top: `${top}%` };

  return (
    <div
      className={cn(
        "absolute z-40 max-h-[45%] w-[22rem] max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-board-green/30 bg-white p-3 shadow-2xl",
        "max-md:hidden",
        alignClass
      )}
      style={style}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-board-green">{slot.code}</p>
          <h4 className="font-bold text-board-navy">{slot.label}</h4>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600" title={`${eligibleCount} eligible Players available`}>
          {eligibleCount} eligible
        </span>
      </div>
      <InlineDepthControls
        planId={planId}
        slot={slot}
        depth={depth}
        playersById={playersById}
        availablePlayers={availablePlayers}
        onOptimisticUpdate={onOptimisticUpdate}
        compact
      />
      {children}
    </div>
  );
}

function numberWord(value: number) {
  if (value === 3) return "Three";
  if (value === 4) return "Four";
  if (value === 5) return "Five";
  if (value === 6) return "Six";
  if (value === 7) return "Seven";
  if (value === 8) return "Eight";
  if (value === 9) return "Nine";
  if (value === 10) return "Ten";
  return String(value);
}

function InlineDepthControls({
  planId,
  slot,
  depth,
  playersById,
  availablePlayers,
  onOptimisticUpdate,
  compact = false
}: {
  planId: string;
  slot: TacticalPlanSlot;
  depth: TacticalPlannerData["assignments"];
  playersById: Map<string, SquadPlayer>;
  availablePlayers?: SquadPlayer[];
  onOptimisticUpdate: (update: OptimisticSlotUpdate) => void;
  compact?: boolean;
}) {
  const reorderFormRef = useRef<HTMLFormElement>(null);
  const [draggedAssignmentId, setDraggedAssignmentId] = useState("");
  const [dropRank, setDropRank] = useState(1);
  const sortedDepth = uniqueDepthAssignments(depth).sort((a, b) => a.depthOrder - b.depthOrder);
  const assignedPlayerIds = new Set(sortedDepth.map((assignment) => assignment.playerId));
  const addablePlayers = (availablePlayers ?? [])
    .filter((player) => !assignedPlayerIds.has(player.id))
    .map((player) => ({ player, fit: evaluatePlayerSlotFit(player, slot) }))
    .filter((item) => item.fit.eligible && isFitAllowedByAutoFillEligibility(item.fit.fitType, "natural_secondary", false))
    .sort((a, b) => b.fit.baseScore - a.fit.baseScore || playerName(a.player).localeCompare(playerName(b.player)));

  return (
    <div className={cn("mt-2 space-y-1", compact ? "text-[11px]" : "text-xs")} onClick={(event) => event.stopPropagation()}>
      <form ref={reorderFormRef} action={moveDepthAssignmentToRank} className="hidden">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="assignmentId" value={draggedAssignmentId} />
        <input type="hidden" name="targetRank" value={dropRank} />
      </form>
      {sortedDepth.length === 0 ? (
        <p className="rounded bg-slate-50 px-2 py-1 font-semibold text-slate-500">No assigned player</p>
      ) : sortedDepth.map((assignment, index) => {
        const player = playersById.get(assignment.playerId);
        if (!player) return null;
        return (
          <div
            key={assignment.id}
            draggable
            onDragStart={(event) => {
              setDraggedAssignmentId(assignment.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", assignment.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = draggedAssignmentId || event.dataTransfer.getData("text/plain");
              if (!sourceId || sourceId === assignment.id) return;
              setDraggedAssignmentId(sourceId);
              setDropRank(index + 1);
              onOptimisticUpdate({ type: "moveToRank", assignmentId: sourceId, targetRank: index + 1 });
              window.setTimeout(() => reorderFormRef.current?.requestSubmit(), 0);
            }}
            className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] items-center gap-1 rounded bg-slate-50 px-1.5 py-1"
          >
            <span className="font-black text-board-green">{index + 1}</span>
            <span className="cursor-grab text-slate-400" aria-hidden="true">⋮⋮</span>
            <span className="truncate font-bold text-board-navy" title={playerName(player)}>{playerName(player)}{index === 0 ? " · Starter" : ""}</span>
            <DepthIconAction action={moveDepthAssignment} planId={planId} assignmentId={assignment.id} label="↑" title="Move up" extra={{ direction: "up" }} disabled={index === 0} onOptimisticSubmit={() => onOptimisticUpdate({ type: "move", assignmentId: assignment.id, direction: "up" })} />
            <DepthIconAction action={moveDepthAssignment} planId={planId} assignmentId={assignment.id} label="↓" title="Move down" extra={{ direction: "down" }} disabled={index === sortedDepth.length - 1} onOptimisticSubmit={() => onOptimisticUpdate({ type: "move", assignmentId: assignment.id, direction: "down" })} />
            <DepthIconAction action={removeDepthAssignment} planId={planId} assignmentId={assignment.id} label="×" title="Remove from depth" variant="danger" onOptimisticSubmit={() => onOptimisticUpdate({ type: "remove", assignmentId: assignment.id })} />
          </div>
        );
      })}
      {sortedDepth.length > 1 ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {sortedDepth.slice(1).map((assignment) => {
            const player = playersById.get(assignment.playerId);
            return (
              <DepthAction key={assignment.id} action={setPreferredStarter} planId={planId} assignmentId={assignment.id} label={`Set ${player ? playerName(player).split(" ")[0] : "player"} starter`} onOptimisticSubmit={() => onOptimisticUpdate({ type: "starter", assignmentId: assignment.id })} />
            );
          })}
        </div>
      ) : null}
      {availablePlayers ? (
        <details className="pt-1">
          <summary className="cursor-pointer rounded-full bg-board-navy px-2 py-1 text-center font-bold text-white">+ Add Player</summary>
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-md border border-board-line bg-white p-2 shadow-lg">
            <form action={addAllEligibleDepthAssignments} className="mb-2">
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="slotId" value={slot.id} />
              <input type="hidden" name="eligibility" value="natural_secondary" />
              <CompactSubmitButton label="Add all exact Players" pendingLabel="Adding..." className="h-8 w-full px-2 text-xs" />
            </form>
            {addablePlayers.length === 0 ? (
              <p className="px-2 py-1 text-xs font-semibold text-slate-500">No eligible players to add.</p>
            ) : addablePlayers.map(({ player, fit }) => (
              <form
                key={player.id}
                action={addDepthAssignment}
                className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1"
                onSubmit={() => onOptimisticUpdate({ type: "add", slot, player })}
              >
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="slotId" value={slot.id} />
                <input type="hidden" name="playerId" value={player.id} />
                <span className="min-w-0 truncate font-semibold text-slate-700" title={playerName(player)}>{playerName(player)} · {fitMeta[fit.fitType].label}</span>
                <CompactSubmitButton label="Add" pendingLabel="Adding..." className="h-7 px-2 text-[11px]" />
              </form>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function CompactSubmitButton({
  label,
  pendingLabel,
  className
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function DepthIconAction({
  action,
  planId,
  assignmentId,
  label,
  title,
  disabled,
  variant = "secondary",
  extra,
  onOptimisticSubmit
}: {
  action: (formData: FormData) => void | Promise<void>;
  planId: string;
  assignmentId: string;
  label: string;
  title: string;
  disabled?: boolean;
  variant?: "secondary" | "danger";
  extra?: Record<string, string>;
  onOptimisticSubmit?: () => void;
}) {
  return (
    <form action={action} onSubmit={onOptimisticSubmit}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {extra ? Object.entries(extra).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />) : null}
      <button
        type="submit"
        title={title}
        disabled={disabled}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded text-xs font-black disabled:cursor-not-allowed disabled:opacity-40",
          variant === "danger" ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
        )}
      >
        <DepthIconActionLabel label={label} />
      </button>
    </form>
  );
}

function DepthIconActionLabel({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return pending ? "…" : label;
}

function SlotDepthPanel({
  planId,
  slot,
  depth,
  playersById,
  availablePlayers,
  assignedPlayerIds
}: {
  planId: string;
  slot?: TacticalPlanSlot;
  depth: TacticalPlannerData["assignments"];
  playersById: Map<string, SquadPlayer>;
  availablePlayers: SquadPlayer[];
  assignedPlayerIds: Set<string>;
}) {
  const copy = plannerCopy[useOptionalI18n()?.locale ?? "en"];
  const [managerEligibility, setManagerEligibility] = useState<AutoFillEligibility>("natural_secondary");
  if (!slot) {
    return (
      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <h3 className="font-bold text-board-navy">{copy.position}</h3>
        <p className="mt-2 text-sm text-slate-600">{copy.selectPosition}</p>
      </section>
    );
  }
  const addablePlayers = availablePlayers.filter((player) => !depth.some((assignment) => assignment.playerId === player.id));
  const availableCandidates = addablePlayers
    .map((player) => ({ player, fit: evaluatePlayerSlotFit(player, slot) }))
    .filter((item) => item.fit.eligible && isFitAllowedByAutoFillEligibility(item.fit.fitType, managerEligibility, false))
    .sort((a, b) => b.fit.baseScore - a.fit.baseScore || playerName(a.player).localeCompare(playerName(b.player)));

  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-board-navy">{slot.code} depth</h3>
          <p className="text-sm text-slate-600">{slot.label} · accepts {slot.acceptedPositions.join(", ")}</p>
        </div>
        <Goal className="h-5 w-5 text-board-green" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Available filter
          <select value={managerEligibility} onChange={(event) => setManagerEligibility(event.target.value as AutoFillEligibility)} className="h-9 w-full rounded-md border border-board-line px-2 text-xs font-semibold">
            <option value="natural">Exact only</option>
            <option value="natural_secondary">Natural + Secondary</option>
            <option value="natural_secondary_compatible">Include Compatible</option>
          </select>
        </label>
        <form action={addAllEligibleDepthAssignments} className="self-end">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="slotId" value={slot.id} />
          <input type="hidden" name="eligibility" value={managerEligibility} />
          <Button type="submit" variant="secondary" className="h-9 px-2 text-xs">Add all eligible</Button>
        </form>
      </div>

      <form action={addDepthAssignment} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="slotId" value={slot.id} />
        <select name="playerId" className="h-10 min-w-0 flex-1 rounded-md border border-board-line px-3 text-sm" required>
          <option value="">Add player to {slot.code}</option>
          {sortPlayersByFit(addablePlayers, slot, assignedPlayerIds).map((player) => (
            <option key={player.id} value={player.id}>
              {playerName(player)} · {playerPositionText(player)}
            </option>
          ))}
        </select>
        <Button type="submit" className="shrink-0">Add</Button>
      </form>

      <div className="mt-4 space-y-2">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Assigned depth</h4>
        {depth.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">No depth option yet. Add a player from the squad pool.</p>
        ) : depth.map((assignment, index) => {
          const player = playersById.get(assignment.playerId);
          if (!player) return null;
          return (
            <div key={assignment.id} className="rounded-lg border border-board-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-board-navy">{index + 1}. {playerName(player)}</p>
                  <p className="text-xs font-semibold text-slate-500">{playerPositionText(player)}{player.playerType === "trial" ? " · Trial" : ""}</p>
                </div>
                {assignment.isPreferredStarter ? <span className="rounded-full bg-board-green px-2 py-1 text-xs font-bold text-white">Starter</span> : null}
              </div>
              <span className={cn("mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-bold", fitMeta[assignment.fitType].className)}>
                {fitMeta[assignment.fitType].label}
              </span>
              <div className="mt-3 flex flex-wrap gap-2">
                <DepthAction action={setPreferredStarter} planId={planId} assignmentId={assignment.id} label="Set starter" disabled={assignment.isPreferredStarter} />
                <DepthAction action={moveDepthAssignment} planId={planId} assignmentId={assignment.id} label="Up" extra={{ direction: "up" }} disabled={index === 0} />
                <DepthAction action={moveDepthAssignment} planId={planId} assignmentId={assignment.id} label="Down" extra={{ direction: "down" }} disabled={index === depth.length - 1} />
                <ButtonLink href={`/squad/players/${player.id}`} variant="secondary" className="h-8 px-2 text-xs">Profile</ButtonLink>
                <DepthAction action={removeDepthAssignment} planId={planId} assignmentId={assignment.id} label="Remove" variant="danger" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 space-y-2">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Available options</h4>
        {availableCandidates.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">No unassigned eligible options for this slot.</p>
        ) : availableCandidates.map(({ player, fit }) => (
          <div key={player.id} className={cn("rounded-lg border p-3", fit.fitType === "natural" ? "border-emerald-200 bg-emerald-50" : "border-board-line bg-white")}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p translate="no" className="font-bold text-board-navy">{playerName(player)}</p>
                <p className="text-xs font-semibold text-slate-500">{playerPositionText(player)}</p>
                <p className="mt-1 text-xs text-slate-500">Matched {fit.matchedPosition ?? "position"} · {fitMeta[fit.fitType].label}</p>
              </div>
              <form action={addDepthAssignment}>
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="slotId" value={slot.id} />
                <input type="hidden" name="playerId" value={player.id} />
                <Button type="submit" variant="secondary" className="h-8 px-2 text-xs">Add</Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DepthAction({
  action,
  planId,
  assignmentId,
  label,
  disabled,
  variant = "secondary",
  extra,
  onOptimisticSubmit
}: {
  action: (formData: FormData) => void | Promise<void>;
  planId: string;
  assignmentId: string;
  label: string;
  disabled?: boolean;
  variant?: "secondary" | "danger";
  extra?: Record<string, string>;
  onOptimisticSubmit?: () => void;
}) {
  return (
    <form action={action} onSubmit={onOptimisticSubmit}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {extra ? Object.entries(extra).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />) : null}
      <DepthActionButton label={label} variant={variant} disabled={disabled} />
    </form>
  );
}

function DepthActionButton({ label, variant, disabled }: { label: string; variant: "secondary" | "danger"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={disabled || pending} className="h-8 px-2 text-xs">
      {pending ? "Saving..." : label}
    </Button>
  );
}

function PlayerPoolPanel({
  planId,
  players,
  includedPlayers,
  unassignedPlayers,
  excludedPlayerIds,
  statesByPlayer,
  showTrials,
  search,
  selectedSlot,
  assignments,
  slots,
  poolFilter,
  roleFilter,
  positionFilter,
  onPoolFilterChange,
  onRoleFilterChange,
  onPositionFilterChange,
  onShowTrialsChange,
  onSearchChange,
  onPlayerDragStart,
  draggingPlayerId,
  selectedPlayerId,
  onSelectPlayer
}: {
  planId: string;
  players: SquadPlayer[];
  includedPlayers: SquadPlayer[];
  unassignedPlayers: SquadPlayer[];
  excludedPlayerIds: Set<string>;
  statesByPlayer: Map<string, TacticalPlannerData["playerStates"][number]>;
  showTrials: boolean;
  search: string;
  selectedSlot?: TacticalPlanSlot;
  assignments: TacticalPlannerData["assignments"];
  slots: TacticalPlanSlot[];
  poolFilter: "all" | "unassigned" | "excluded";
  roleFilter: string;
  positionFilter: string;
  onPoolFilterChange: (value: "all" | "unassigned" | "excluded") => void;
  onRoleFilterChange: (value: string) => void;
  onPositionFilterChange: (value: string) => void;
  onShowTrialsChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  onPlayerDragStart: (event: React.DragEvent<HTMLElement>, playerId: string) => void;
  draggingPlayerId: string | null;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
}) {
  const copy = plannerCopy[useOptionalI18n()?.locale ?? "en"];
  const excludedPlayers = players.filter((player) => excludedPlayerIds.has(player.id));
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const assignmentsByPlayer = new Map<string, TacticalPlannerData["assignments"]>();
  for (const assignment of assignments) {
    assignmentsByPlayer.set(assignment.playerId, [...(assignmentsByPlayer.get(assignment.playerId) ?? []), assignment]);
  }
  const baseList = poolFilter === "excluded" ? excludedPlayers : poolFilter === "all" ? includedPlayers : unassignedPlayers;
  const filteredList = baseList.filter((player) => {
    const state = statesByPlayer.get(player.id);
    if (roleFilter === "none" && state?.tacticalStatus) return false;
    if (roleFilter && roleFilter !== "none" && state?.tacticalStatus !== roleFilter) return false;
    if (positionFilter) {
      const family = getPlayerPositionFamilies(player).includes(positionFilter as PositionFamily);
      if (!family) return false;
    }
    return true;
  });
  const list = selectedSlot && poolFilter !== "excluded" ? sortPlayersByFit(filteredList, selectedSlot, new Set()) : filteredList;
  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-board-navy">{selectedSlot ? `${selectedSlot.code} ${copy.depthOptions}` : copy.playerPool}</h3>
          <p className="text-sm text-slate-600">{includedPlayers.length} {copy.included} · {unassignedPlayers.length} {copy.unassigned.toLowerCase()} · {excludedPlayers.length} {copy.excluded}</p>
        </div>
        <Shield className="h-5 w-5 text-board-green" />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search players"
          className="h-10 rounded-md border border-board-line px-3 text-sm"
        />
        <label className="flex h-10 items-center gap-2 rounded-md border border-board-line px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={showTrials} onChange={(event) => onShowTrialsChange(event.target.checked)} />
          Show trial
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Pool
          <select value={poolFilter} onChange={(event) => onPoolFilterChange(event.target.value as "all" | "unassigned" | "excluded")} className="h-9 w-full rounded-md border border-board-line px-2 text-xs font-semibold">
            <option value="unassigned">Unassigned</option>
            <option value="all">Included</option>
            <option value="excluded">Excluded</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Role
          <select value={roleFilter} onChange={(event) => onRoleFilterChange(event.target.value)} className="h-9 w-full rounded-md border border-board-line px-2 text-xs font-semibold">
            <option value="">All roles</option>
            <option value="none">No role</option>
            {tacticalPlayerRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Position
          <select value={positionFilter} onChange={(event) => onPositionFilterChange(event.target.value)} className="h-9 w-full rounded-md border border-board-line px-2 text-xs font-semibold">
            <option value="">All positions</option>
            {positionFamilyOrder.map((family) => (
              <option key={family} value={family}>{positionFamilyMeta[family].label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
        {list.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">No matching players for this filter.</p>
        ) : list.map((player) => (
          <PlayerStateCard
            key={player.id}
            planId={planId}
            player={player}
            state={statesByPlayer.get(player.id)}
            excluded={poolFilter === "excluded"}
            selectedSlot={poolFilter === "excluded" ? undefined : selectedSlot}
            assignmentsSummary={formatAssignmentsSummary(assignmentsByPlayer.get(player.id) ?? [], slotById)}
            alreadyInSelectedSlot={Boolean(selectedSlot && (assignmentsByPlayer.get(player.id) ?? []).some((assignment) => assignment.slotId === selectedSlot.id))}
            onPlayerDragStart={onPlayerDragStart}
            dragging={draggingPlayerId === player.id}
            selectedForAssignment={selectedPlayerId === player.id}
            onSelectPlayer={() => onSelectPlayer(player.id)}
          />
        ))}
      </div>
    </section>
  );
}

function PlayerStateCard({
  planId,
  player,
  state,
  excluded,
  selectedSlot,
  assignmentsSummary,
  alreadyInSelectedSlot,
  onPlayerDragStart,
  dragging,
  selectedForAssignment,
  onSelectPlayer
}: {
  planId: string;
  player: SquadPlayer;
  state?: TacticalPlannerData["playerStates"][number];
  excluded: boolean;
  selectedSlot?: TacticalPlanSlot;
  assignmentsSummary?: string;
  alreadyInSelectedSlot?: boolean;
  onPlayerDragStart: (event: React.DragEvent<HTMLElement>, playerId: string) => void;
  dragging: boolean;
  selectedForAssignment: boolean;
  onSelectPlayer: () => void;
}) {
  const selectedSlotFit = selectedSlot ? evaluatePlayerSlotFit(player, selectedSlot, true) : undefined;
  if (excluded) {
    return (
      <form action={updatePlayerPlanState} className="rounded-lg border border-red-100 bg-red-50 p-3">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="playerId" value={player.id} />
        <input type="hidden" name="inclusionStatus" value="included" />
        <input type="hidden" name="tacticalStatus" value={state?.tacticalStatus ?? ""} />
        <input type="hidden" name="note" value={state?.note ?? ""} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p translate="no" className="font-bold text-board-navy">{playerName(player)}</p>
            <p className="text-xs font-semibold text-slate-500">{playerPositionText(player)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusChip label={tacticalRoleLabel(state?.tacticalStatus, true)} />
              {player.playerType === "trial" ? <StatusChip label="Trial" tone="amber" /> : null}
            </div>
            <p className="mt-2 text-xs text-red-700">{state?.exclusionReason || "Excluded from this plan."}</p>
          </div>
          <Button type="submit" variant="secondary" className="h-8 px-2 text-xs">Include</Button>
        </div>
      </form>
    );
  }

  return (
    <div className={cn("rounded-lg border border-board-line bg-white p-3 transition-opacity", dragging && "opacity-40", selectedForAssignment && "ring-2 ring-board-green")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button type="button" draggable onDragStart={(event) => onPlayerDragStart(event, player.id)} onClick={onSelectPlayer} className="mb-1 inline-flex items-center gap-1 rounded border border-board-line px-2 py-1 text-xs font-bold text-board-green touch-none" aria-pressed={selectedForAssignment} aria-label={`Select ${playerName(player)} for formation assignment`} title="Drag to formation or select, then tap a position"><GripVertical className="h-3 w-3" /> XI</button>
          <p translate="no" className="font-bold text-board-navy">{playerName(player)}</p>
          <p className="text-xs font-semibold text-slate-500">{playerPositionText(player)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusChip label={tacticalRoleLabel(state?.tacticalStatus, true)} />
            <StatusChip label="Available" tone="green" />
            {player.playerType === "trial" ? <StatusChip label="Trial" tone="amber" /> : null}
          </div>
          <p className="mt-2 text-xs text-slate-500">{assignmentsSummary || "No depth assignment yet"}</p>
          {selectedSlotFit ? (
            <p className={cn("mt-1 text-xs font-semibold", selectedSlotFit.fitType === "out_of_position" ? "text-red-700" : "text-board-green")}>
              Fit for {selectedSlot?.code}: {fitMeta[selectedSlotFit.fitType].label}{selectedSlotFit.matchedPosition ? ` · matched ${selectedSlotFit.matchedPosition}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {selectedSlot ? (
            <form action={addDepthAssignment}>
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="slotId" value={selectedSlot.id} />
              <input type="hidden" name="playerId" value={player.id} />
              <Button type="submit" variant="secondary" disabled={alreadyInSelectedSlot} className="h-8 px-2 text-xs">
                {alreadyInSelectedSlot ? "Assigned" : `Add ${selectedSlot.code}`}
              </Button>
            </form>
          ) : null}
          <form action={updatePlayerPlanState}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="playerId" value={player.id} />
            <input type="hidden" name="inclusionStatus" value="excluded" />
            <input type="hidden" name="tacticalStatus" value={state?.tacticalStatus ?? ""} />
            <input type="hidden" name="note" value={state?.note ?? ""} />
            <input type="hidden" name="exclusionReason" value="Not in this tactical plan" />
            <Button type="submit" variant="danger" className="h-8 px-2 text-xs">Exclude</Button>
          </form>
        </div>
      </div>
      <form action={updatePlayerPlanState} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="playerId" value={player.id} />
        <input type="hidden" name="inclusionStatus" value="included" />
          <select name="tacticalStatus" defaultValue={state?.tacticalStatus ?? ""} className="h-9 rounded-md border border-board-line px-2 text-xs">
            {tacticalStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input name="note" defaultValue={state?.note ?? ""} placeholder="Short note" className="h-9 rounded-md border border-board-line px-2 text-xs" />
        <Button type="submit" variant="secondary" className="h-9 px-2 text-xs">Save</Button>
      </form>
    </div>
  );
}

function StatusChip({ label, tone = "slate" }: { label: string; tone?: "slate" | "green" | "amber" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-bold",
        tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {label}
    </span>
  );
}

function ArchivedPlans({ plans }: { plans: TacticalPlannerData["plans"] }) {
  if (plans.length === 0) return null;
  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <h3 className="font-bold text-board-navy">Archived plans</h3>
      <div className="mt-3 space-y-2">
        {plans.map((plan) => (
          <div key={plan.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 p-2">
            <span className="text-sm font-semibold text-slate-700">{plan.name}</span>
            <div className="flex gap-2">
              <form action={restoreTacticalPlan}>
                <input type="hidden" name="planId" value={plan.id} />
                <Button type="submit" variant="secondary" className="h-8 px-2 text-xs">Restore</Button>
              </form>
              <form
                action={deleteTacticalPlan}
                onSubmit={(event) => {
                  if (!window.confirm(`Delete "${plan.name}" permanently?`)) event.preventDefault();
                }}
              >
                <input type="hidden" name="planId" value={plan.id} />
                <Button type="submit" variant="danger" className="h-8 px-2 text-xs"><Trash2 className="h-3 w-3" /> Delete</Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlannerHelp() {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="font-bold text-board-navy">How the planner works</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        <li>Pick a formation and assign players to each tactical slot.</li>
        <li>Use depth order to see starter, backup and development options.</li>
        <li>Exclude players from one plan without changing the squad roster.</li>
      </ul>
      <ButtonLink href="/squad/players/new" variant="secondary" className="mt-4">Add player</ButtonLink>
    </section>
  );
}

function sortPlayersByFit(players: SquadPlayer[], slot: TacticalPlanSlot, assignedPlayerIds: Set<string>) {
  return [...players].sort((a, b) => {
    const assignedDelta = Number(assignedPlayerIds.has(a.id)) - Number(assignedPlayerIds.has(b.id));
    if (assignedDelta !== 0) return assignedDelta;
    const aFit = evaluatePlayerSlotFit(a, slot, true);
    const bFit = evaluatePlayerSlotFit(b, slot, true);
    const fitDelta = bFit.baseScore - aFit.baseScore;
    if (fitDelta !== 0) return fitDelta;
    return playerName(a).localeCompare(playerName(b));
  });
}

function buildAutoFillPreview({
  mode,
  eligibility,
  includeTrials,
  allowOutOfPosition,
  slots,
  players,
  assignments,
  playerStates
}: {
  mode: AutoFillMode;
  eligibility: AutoFillEligibility;
  includeTrials: boolean;
  allowOutOfPosition: boolean;
  slots: TacticalPlanSlot[];
  players: SquadPlayer[];
  assignments: TacticalPlannerData["assignments"];
  playerStates: TacticalPlannerData["playerStates"];
}) {
  const stateByPlayer = new Map(playerStates.map((state) => [state.playerId, state]));
  const excludedPlayerIds = new Set(playerStates.filter((state) => state.inclusionStatus === "excluded").map((state) => state.playerId));
  const eligiblePlayers = players
    .filter((player) => !excludedPlayerIds.has(player.id))
    .filter((player) => includeTrials || player.playerType !== "trial");
  const startingRows = mode === "rebuild_all" || mode === "rebuild_xi" ? [] : assignments.filter((assignment) => assignment.isPreferredStarter);
  const usedStarterPlayerIds = new Set(startingRows.map((assignment) => assignment.playerId));
  const filledSlotIds = new Set(startingRows.map((assignment) => assignment.slotId));
  const rows: Array<{ slotId: string; slotCode: string; playerName: string; detail: string; fitType?: TacticalFitType; isExisting: boolean }> = [];
  const messages: string[] = [];
  const orderedSlots = sortPreviewSlotsByScarcity(slots, eligiblePlayers, stateByPlayer, eligibility, allowOutOfPosition);
  const previewPicks = choosePreviewStarterAssignments(
    orderedSlots.filter((slot) => mode === "rebuild_all" || mode === "rebuild_xi" || !assignments.some((assignment) => assignment.slotId === slot.id && assignment.isPreferredStarter)),
    eligiblePlayers,
    stateByPlayer,
    new Set(startingRows.map((assignment) => assignment.playerId)),
    eligibility,
    allowOutOfPosition
  );
  const previewPickBySlot = new Map(previewPicks.map((pick) => [pick.slot.id, pick]));

  for (const slot of orderedSlots) {
    const existingStarter = mode === "rebuild_all" || mode === "rebuild_xi" ? undefined : assignments.find((assignment) => assignment.slotId === slot.id && assignment.isPreferredStarter);
    const existingPlayer = existingStarter ? players.find((player) => player.id === existingStarter.playerId) : undefined;
    if (existingPlayer) {
      rows.push({ slotId: slot.id, slotCode: slot.code, playerName: `${playerName(existingPlayer)} · kept`, detail: `${playerPositionText(existingPlayer)} · ${fitMeta[existingStarter?.fitType ?? "no_data"].label}`, fitType: existingStarter?.fitType, isExisting: true });
      continue;
    }
    if (filledSlotIds.has(slot.id)) continue;
    const pick = previewPickBySlot.get(slot.id);
    if (!pick) {
      rows.push({ slotId: slot.id, slotCode: slot.code, playerName: "No suitable player", detail: `No ${autoFillEligibilityLabel(eligibility).toLowerCase()} option found.`, isExisting: false });
      messages.push(`No suitable ${slot.label} available`);
      continue;
    }
    rows.push({ slotId: slot.id, slotCode: slot.code, playerName: playerName(pick.player), detail: `${playerPositionText(pick.player)} · matched ${pick.matchedPosition ?? "position"} · ${fitMeta[pick.fitType].label} · ${tacticalRoleLabel(stateByPlayer.get(pick.player.id)?.tacticalStatus, true)}`, fitType: pick.fitType, isExisting: false });
    usedStarterPlayerIds.add(pick.player.id);
  }

  const filledStarters = rows.filter((row) => row.playerName !== "No suitable player").length;
  const newStarters = rows.filter((row) => !row.isExisting && row.playerName !== "No suitable player").length;
  let outOfPositionCount = rows.filter((row) => row.fitType === "out_of_position").length;
  let compatibleCount = rows.filter((row) => row.fitType === "compatible").length;
  const assignedPlayerIds = new Set(assignments.map((assignment) => assignment.playerId));
  const previewStarterIds = new Set(rows.flatMap((row) => {
    const player = eligiblePlayers.find((item) => playerName(item) === row.playerName);
    return player ? [player.id] : [];
  }));
  const unassignedCount = eligiblePlayers.filter((player) => !assignedPlayerIds.has(player.id) && !previewStarterIds.has(player.id)).length;
  let backupsAdded = 0;
  let allDepthAdded = 0;
  if (mode === "xi_depth" || mode === "xi_all_depth" || mode === "rebuild_all") {
    for (const slot of slots) {
      const assignedInSlot = new Set(assignments.filter((assignment) => assignment.slotId === slot.id).map((assignment) => assignment.playerId));
      const previewStarter = previewPickBySlot.get(slot.id);
      if (previewStarter) assignedInSlot.add(previewStarter.player.id);
      if (mode === "xi_depth" && assignedInSlot.size >= 2) continue;
      const depthCandidates = choosePreviewPlayersForSlot(eligiblePlayers, slot, stateByPlayer, assignedInSlot, eligibility, allowOutOfPosition);
      const selectedDepth = mode === "xi_depth" ? depthCandidates.slice(0, 1) : depthCandidates;
      backupsAdded += mode === "xi_depth" ? selectedDepth.length : 0;
      allDepthAdded += selectedDepth.length;
      compatibleCount += selectedDepth.filter((candidate) => candidate.fitType === "compatible").length;
      outOfPositionCount += selectedDepth.filter((candidate) => candidate.fitType === "out_of_position").length;
    }
  }

  if (eligiblePlayers.length === 0) messages.push("No included active squad players available.");
  return { rows, filledStarters, newStarters, backupsAdded, allDepthAdded, unassignedCount, compatibleCount, outOfPositionCount, messages: Array.from(new Set(messages)).slice(0, 4) };
}

function sortPreviewSlotsByScarcity(
  slots: TacticalPlanSlot[],
  players: SquadPlayer[],
  stateByPlayer: Map<string, TacticalPlannerData["playerStates"][number]>,
  eligibility: AutoFillEligibility,
  allowOutOfPosition: boolean
) {
  return [...slots].sort((a, b) => {
    const aCandidates = players.filter((player) => scorePreviewPlayerForSlot(player, a, stateByPlayer.get(player.id)?.tacticalStatus, eligibility, allowOutOfPosition) > 0).length;
    const bCandidates = players.filter((player) => scorePreviewPlayerForSlot(player, b, stateByPlayer.get(player.id)?.tacticalStatus, eligibility, allowOutOfPosition) > 0).length;
    return aCandidates - bCandidates || a.sortOrder - b.sortOrder;
  });
}

type PreviewStarterPick = {
  slot: TacticalPlanSlot;
  player: SquadPlayer;
  fitType: TacticalFitType;
  matchedPosition?: string;
  score: number;
};

type PreviewMatchingResult = {
  filled: number;
  score: number;
  picks: PreviewStarterPick[];
};

function choosePreviewStarterAssignments(
  slots: TacticalPlanSlot[],
  players: SquadPlayer[],
  stateByPlayer: Map<string, TacticalPlannerData["playerStates"][number]>,
  disallowedPlayerIds: Set<string>,
  eligibility: AutoFillEligibility,
  allowOutOfPosition: boolean
) {
  const candidatesBySlot = new Map<string, PreviewStarterPick[]>();
  for (const slot of slots) {
    candidatesBySlot.set(
      slot.id,
      players
        .filter((player) => !disallowedPlayerIds.has(player.id))
        .map((player) => {
          const fit = evaluatePlayerSlotFit(player, slot, allowOutOfPosition);
          return {
            slot,
            player,
            fitType: fit.fitType,
            matchedPosition: fit.matchedPosition,
            score: scorePreviewPlayerForSlot(player, slot, stateByPlayer.get(player.id)?.tacticalStatus, eligibility, allowOutOfPosition)
          };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score || playerName(a.player).localeCompare(playerName(b.player)))
    );
    candidatesBySlot.set(slot.id, keepPreviewOutOfPositionAsFallback(candidatesBySlot.get(slot.id) ?? []));
  }
  const orderedSlots = [...slots].sort((a, b) => (candidatesBySlot.get(a.id)?.length ?? 0) - (candidatesBySlot.get(b.id)?.length ?? 0) || a.sortOrder - b.sortOrder);
  const memo = new Map<string, PreviewMatchingResult>();
  const better = (a: PreviewMatchingResult, b: PreviewMatchingResult) => {
    if (a.filled !== b.filled) return a.filled > b.filled ? a : b;
    if (a.score !== b.score) return a.score > b.score ? a : b;
    return a.picks.length <= b.picks.length ? a : b;
  };
  const solve = (index: number, usedPlayerIds: Set<string>): PreviewMatchingResult => {
    if (index >= orderedSlots.length) return { filled: 0, score: 0, picks: [] };
    const key = `${index}|${Array.from(usedPlayerIds).sort().join(",")}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const slot = orderedSlots[index];
    let best = solve(index + 1, usedPlayerIds);
    for (const candidate of candidatesBySlot.get(slot.id) ?? []) {
      if (usedPlayerIds.has(candidate.player.id)) continue;
      const nextUsed = new Set(usedPlayerIds);
      nextUsed.add(candidate.player.id);
      const rest = solve(index + 1, nextUsed);
      best = better({ filled: rest.filled + 1, score: rest.score + candidate.score, picks: [candidate, ...rest.picks] }, best);
    }
    memo.set(key, best);
    return best;
  };
  return solve(0, new Set(disallowedPlayerIds)).picks;
}

function choosePreviewPlayersForSlot(
  players: SquadPlayer[],
  slot: TacticalPlanSlot,
  stateByPlayer: Map<string, TacticalPlannerData["playerStates"][number]>,
  disallowedPlayerIds: Set<string>,
  eligibility: AutoFillEligibility,
  allowOutOfPosition: boolean
) {
  const candidates = [...players]
    .filter((player) => !disallowedPlayerIds.has(player.id))
    .map((player) => {
      const fit = evaluatePlayerSlotFit(player, slot, allowOutOfPosition);
      return { player, fitType: fit.fitType, score: scorePreviewPlayerForSlot(player, slot, stateByPlayer.get(player.id)?.tacticalStatus, eligibility, allowOutOfPosition) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || playerName(a.player).localeCompare(playerName(b.player)));
  return keepPreviewOutOfPositionAsFallback(candidates);
}

function scorePreviewPlayerForSlot(player: SquadPlayer, slot: TacticalPlanSlot, tacticalStatus: string | undefined, eligibility: AutoFillEligibility, allowOutOfPosition: boolean) {
  const fit = evaluatePlayerSlotFit(player, slot, allowOutOfPosition);
  if (!fit.eligible || !isFitAllowedByAutoFillEligibility(fit.fitType, eligibility, allowOutOfPosition)) return 0;
  return fit.baseScore + tacticalRoleScore(tacticalStatus) * 2;
}

function keepPreviewOutOfPositionAsFallback<T extends { fitType: TacticalFitType }>(candidates: T[]) {
  const positioned = candidates.filter((candidate) => candidate.fitType !== "out_of_position");
  return positioned.length > 0 ? positioned : candidates;
}

function getPlayerPositionFamilies(player: SquadPlayer) {
  const families = new Set<PositionFamily>();
  families.add(getPositionFamily(player.position));
  for (const position of player.secondaryPositions ?? []) families.add(getPositionFamily(position));
  return Array.from(families);
}

function formatAssignmentsSummary(assignments: TacticalPlannerData["assignments"], slotById: Map<string, TacticalPlanSlot>) {
  if (assignments.length === 0) return "";
  return [...assignments]
    .sort((a, b) => {
      const slotDelta = (slotById.get(a.slotId)?.sortOrder ?? 999) - (slotById.get(b.slotId)?.sortOrder ?? 999);
      return slotDelta || a.depthOrder - b.depthOrder;
    })
    .slice(0, 4)
    .map((assignment) => {
      const slot = slotById.get(assignment.slotId);
      const prefix = slot?.code ?? "Slot";
      return `${prefix} #${assignment.depthOrder}${assignment.isPreferredStarter ? " starter" : ""}`;
    })
    .join(" · ");
}

function matchesSearch(player: SquadPlayer, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return `${playerName(player)} ${playerPositionText(player)}`.toLowerCase().includes(needle);
}
