"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Archive, Copy, Goal, RotateCcw, Shield, Star, Trash2, Users } from "lucide-react";
import {
  addDepthAssignment,
  archiveTacticalPlan,
  autoFillStartingXi,
  clearStartingXi,
  createTacticalPlan,
  deleteTacticalPlan,
  duplicateTacticalPlan,
  moveDepthAssignment,
  removeDepthAssignment,
  restoreTacticalPlan,
  setDefaultTacticalPlan,
  setPreferredStarter,
  updatePlayerPlanState,
  updateTacticalPlan
} from "@/lib/squad/tactical-planner-actions";
import { getPlayerFitForSlot, playerName, playerPositionText, type TacticalPlannerData, type TacticalPlanSlot, type TacticalFitType } from "@/lib/squad/tactical-planner";
import { tacticalFormations } from "@/lib/squad/tactical-formations";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SquadPlayer } from "@/types/domain";

type PlannerMode = "starting" | "depth" | "pool";

const fitMeta: Record<TacticalFitType, { label: string; className: string }> = {
  natural: { label: "Natural", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  secondary: { label: "Secondary", className: "border-amber-200 bg-amber-50 text-amber-800" },
  out_of_position: { label: "Out of position", className: "border-red-200 bg-red-50 text-red-700" },
  no_data: { label: "No data", className: "border-slate-200 bg-slate-50 text-slate-600" }
};

const tacticalStatusOptions = [
  { value: "", label: "No status" },
  { value: "core", label: "Core" },
  { value: "rotation", label: "Rotation" },
  { value: "development", label: "Development" },
  { value: "limited", label: "Limited" },
  { value: "unavailable", label: "Unavailable" }
];

export function SquadTacticalPlanner({ data }: { data: TacticalPlannerData }) {
  const [mode, setMode] = useState<PlannerMode>("starting");
  const [selectedSlotId, setSelectedSlotId] = useState(data.slots[0]?.id ?? "");
  const [showTrials, setShowTrials] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSlot = data.slots.find((slot) => slot.id === selectedSlotId) ?? data.slots[0];
  const playersById = useMemo(() => new Map(data.players.map((player) => [player.id, player])), [data.players]);
  const statesByPlayer = useMemo(() => new Map(data.playerStates.map((state) => [state.playerId, state])), [data.playerStates]);
  const excludedPlayerIds = useMemo(
    () => new Set(data.playerStates.filter((state) => state.inclusionStatus === "excluded").map((state) => state.playerId)),
    [data.playerStates]
  );
  const activeAssignments = data.assignments.filter((assignment) => !excludedPlayerIds.has(assignment.playerId) && playersById.has(assignment.playerId));
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
  const unassignedPlayers = includedPlayers.filter((player) => !assignedPlayerIds.has(player.id));
  const selectedSlotDepth = selectedSlot ? (assignmentsBySlot.get(selectedSlot.id) ?? []) : [];
  const starters = activeAssignments.filter((assignment) => assignment.isPreferredStarter);
  const activePlans = data.plans.filter((plan) => plan.status === "active");
  const archivedPlans = data.plans.filter((plan) => plan.status === "archived");

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
            <p className="text-xs font-bold uppercase text-board-green">{data.squad.name}</p>
            <h2 className="mt-1 text-2xl font-bold text-board-navy">{data.selectedPlan.name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {data.selectedPlan.formationCode} · {starters.length}/11 starters · {activeAssignments.length} depth assignments
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["starting", "depth", "pool"] as PlannerMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={cn(
                  "h-10 rounded-md px-3 text-sm font-bold transition",
                  mode === item ? "bg-board-navy text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {item === "starting" ? "Starting XI" : item === "depth" ? "Depth" : "Player pool"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <form action={updateTacticalPlan} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="planId" value={data.selectedPlan.id} />
            <label className="space-y-1 text-sm font-semibold text-slate-700">
              Plan name
              <input name="name" defaultValue={data.selectedPlan.name} className="h-10 w-full rounded-md border border-board-line px-3 text-sm font-normal" />
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-700">
              Formation
              <select name="formationCode" defaultValue={data.selectedPlan.formationCode} className="h-10 w-full rounded-md border border-board-line px-3 text-sm font-normal">
                {tacticalFormations.map((formation) => (
                  <option key={formation.code} value={formation.code}>{formation.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-board-line px-3 text-sm font-semibold text-slate-700">
              <input name="includeNewPlayersAutomatically" type="checkbox" defaultChecked={data.selectedPlan.includeNewPlayersAutomatically} />
              Include new roster players
            </label>
            <Button type="submit" className="self-end">Save plan settings</Button>
            <label className="space-y-1 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-4">
              Plan notes
              <textarea name="notes" defaultValue={data.selectedPlan.notes ?? ""} rows={2} className="w-full rounded-md border border-board-line px-3 py-2 text-sm font-normal" />
            </label>
          </form>

          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            <PlanSelect plans={activePlans} selectedPlanId={data.selectedPlan.id} />
            <CreatePlanForm compact />
            <IconForm action={setDefaultTacticalPlan} planId={data.selectedPlan.id} label="Default" icon={<Star className="h-4 w-4" />} disabled={data.selectedPlan.isDefault} />
            <IconForm action={duplicateTacticalPlan} planId={data.selectedPlan.id} label="Duplicate" icon={<Copy className="h-4 w-4" />} />
            <IconForm action={archiveTacticalPlan} planId={data.selectedPlan.id} label="Archive" icon={<Archive className="h-4 w-4" />} confirmMessage="Archive this tactical plan?" />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-board-navy">Formation board</h3>
              <p className="text-sm text-slate-600">Click a slot to manage starter and depth. The board does not change training sessions.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <IconForm action={autoFillStartingXi} planId={data.selectedPlan.id} label="Auto-fill XI" icon={<Users className="h-4 w-4" />} />
              <IconForm action={clearStartingXi} planId={data.selectedPlan.id} label="Clear XI" icon={<RotateCcw className="h-4 w-4" />} />
            </div>
          </div>

          <div className="mt-4 aspect-[2/3] max-h-[760px] min-h-[520px] overflow-hidden rounded-lg border border-emerald-900/20 bg-emerald-700 p-3 sm:aspect-[16/10] sm:min-h-[520px]">
            <div className="relative h-full rounded-md border-2 border-white/70 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_50%,transparent_50%),linear-gradient(0deg,rgba(255,255,255,0.05)_50%,transparent_50%)] bg-[length:28px_28px]">
              <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-white/50" />
              {data.slots.map((slot) => (
                <SlotButton
                  key={slot.id}
                  slot={slot}
                  selected={selectedSlot?.id === slot.id}
                  assignments={assignmentsBySlot.get(slot.id) ?? []}
                  playersById={playersById}
                  mode={mode}
                  onSelect={() => setSelectedSlotId(slot.id)}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <SlotDepthPanel
            planId={data.selectedPlan.id}
            slot={selectedSlot}
            depth={selectedSlotDepth}
            playersById={playersById}
            availablePlayers={includedPlayers}
            assignedPlayerIds={assignedPlayerIds}
          />

          <PlayerPoolPanel
            planId={data.selectedPlan.id}
            players={data.players}
            includedPlayers={includedPlayers}
            unassignedPlayers={unassignedPlayers}
            excludedPlayerIds={excludedPlayerIds}
            statesByPlayer={statesByPlayer}
            showTrials={showTrials}
            search={search}
            mode={mode}
            onShowTrialsChange={setShowTrials}
            onSearchChange={setSearch}
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
  if (plans.length <= 1) return null;
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      Plan
      <select
        value={selectedPlanId}
        onChange={(event) => {
          window.location.href = `/squad/planner?plan=${event.target.value}`;
        }}
        className="h-10 rounded-md border border-board-line px-3 text-sm"
      >
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>{plan.name}{plan.isDefault ? " · Default" : ""}</option>
        ))}
      </select>
    </label>
  );
}

function IconForm({
  action,
  planId,
  label,
  icon,
  disabled,
  confirmMessage
}: {
  action: (formData: FormData) => void | Promise<void>;
  planId: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  confirmMessage?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <input type="hidden" name="planId" value={planId} />
      <Button type="submit" variant="secondary" disabled={disabled} className="px-3">
        {icon}
        {label}
      </Button>
    </form>
  );
}

function SlotButton({
  slot,
  selected,
  assignments,
  playersById,
  mode,
  onSelect
}: {
  slot: TacticalPlanSlot;
  selected: boolean;
  assignments: TacticalPlannerData["assignments"];
  playersById: Map<string, SquadPlayer>;
  mode: PlannerMode;
  onSelect: () => void;
}) {
  const starter = assignments.find((assignment) => assignment.isPreferredStarter);
  const starterPlayer = starter ? playersById.get(starter.playerId) : undefined;
  const depthCount = assignments.length;
  const displayText = mode === "starting" ? (starterPlayer ? playerName(starterPlayer) : "Open") : `${depthCount} option${depthCount === 1 ? "" : "s"}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "absolute min-h-16 w-28 -translate-x-1/2 -translate-y-1/2 rounded-lg border p-2 text-left shadow-lg transition sm:w-36",
        selected ? "border-board-green bg-white text-board-navy ring-4 ring-board-green/25" : "border-white/70 bg-white/90 text-slate-800 hover:bg-white"
      )}
      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase text-board-green">{slot.code}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{depthCount}</span>
      </span>
      <span className="mt-1 line-clamp-2 block text-xs font-bold sm:text-sm">{displayText}</span>
    </button>
  );
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
  if (!slot) {
    return (
      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <h3 className="font-bold text-board-navy">No slots</h3>
        <p className="mt-2 text-sm text-slate-600">Choose another formation or create a plan again.</p>
      </section>
    );
  }
  const addablePlayers = availablePlayers.filter((player) => !depth.some((assignment) => assignment.playerId === player.id));

  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-board-navy">{slot.code} depth</h3>
          <p className="text-sm text-slate-600">{slot.label} · accepts {slot.acceptedPositions.join(", ")}</p>
        </div>
        <Goal className="h-5 w-5 text-board-green" />
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
                <DepthAction action={removeDepthAssignment} planId={planId} assignmentId={assignment.id} label="Remove" variant="danger" />
              </div>
            </div>
          );
        })}
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
  extra
}: {
  action: (formData: FormData) => void | Promise<void>;
  planId: string;
  assignmentId: string;
  label: string;
  disabled?: boolean;
  variant?: "secondary" | "danger";
  extra?: Record<string, string>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {extra ? Object.entries(extra).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />) : null}
      <Button type="submit" variant={variant} disabled={disabled} className="h-8 px-2 text-xs">{label}</Button>
    </form>
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
  mode,
  onShowTrialsChange,
  onSearchChange
}: {
  planId: string;
  players: SquadPlayer[];
  includedPlayers: SquadPlayer[];
  unassignedPlayers: SquadPlayer[];
  excludedPlayerIds: Set<string>;
  statesByPlayer: Map<string, TacticalPlannerData["playerStates"][number]>;
  showTrials: boolean;
  search: string;
  mode: PlannerMode;
  onShowTrialsChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
}) {
  const excludedPlayers = players.filter((player) => excludedPlayerIds.has(player.id));
  const list = mode === "pool" ? includedPlayers : unassignedPlayers;
  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-board-navy">Player pool</h3>
          <p className="text-sm text-slate-600">{includedPlayers.length} included · {unassignedPlayers.length} unassigned · {excludedPlayers.length} excluded</p>
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

      <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
        {list.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">No matching included players.</p>
        ) : list.map((player) => (
          <PlayerStateCard key={player.id} planId={planId} player={player} state={statesByPlayer.get(player.id)} excluded={false} />
        ))}
      </div>

      {excludedPlayers.length > 0 ? (
        <details className="mt-4 rounded-lg border border-board-line p-3">
          <summary className="cursor-pointer text-sm font-bold text-board-navy">Excluded players</summary>
          <div className="mt-3 space-y-2">
            {excludedPlayers.map((player) => (
              <PlayerStateCard key={player.id} planId={planId} player={player} state={statesByPlayer.get(player.id)} excluded />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function PlayerStateCard({
  planId,
  player,
  state,
  excluded
}: {
  planId: string;
  player: SquadPlayer;
  state?: TacticalPlannerData["playerStates"][number];
  excluded: boolean;
}) {
  if (excluded) {
    return (
      <form action={updatePlayerPlanState} className="rounded-lg border border-red-100 bg-red-50 p-3">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="playerId" value={player.id} />
        <input type="hidden" name="inclusionStatus" value="included" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-bold text-board-navy">{playerName(player)}</p>
            <p className="text-xs font-semibold text-slate-500">{playerPositionText(player)}{player.playerType === "trial" ? " · Trial" : ""}</p>
            <p className="mt-2 text-xs text-red-700">{state?.exclusionReason || "Excluded from this plan."}</p>
          </div>
          <Button type="submit" variant="secondary" className="h-8 px-2 text-xs">Include</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border border-board-line bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-bold text-board-navy">{playerName(player)}</p>
          <p className="text-xs font-semibold text-slate-500">{playerPositionText(player)}{player.playerType === "trial" ? " · Trial" : ""}</p>
        </div>
        <form action={updatePlayerPlanState}>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="playerId" value={player.id} />
          <input type="hidden" name="inclusionStatus" value="excluded" />
          <input type="hidden" name="exclusionReason" value="Not in this tactical plan" />
          <Button type="submit" variant="danger" className="h-8 px-2 text-xs">Exclude</Button>
        </form>
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
  const fitOrder: Record<TacticalFitType, number> = { natural: 0, secondary: 1, out_of_position: 2, no_data: 3 };
  return [...players].sort((a, b) => {
    const assignedDelta = Number(assignedPlayerIds.has(a.id)) - Number(assignedPlayerIds.has(b.id));
    if (assignedDelta !== 0) return assignedDelta;
    const fitDelta = fitOrder[getPlayerFitForSlot(a, slot)] - fitOrder[getPlayerFitForSlot(b, slot)];
    if (fitDelta !== 0) return fitDelta;
    return playerName(a).localeCompare(playerName(b));
  });
}

function matchesSearch(player: SquadPlayer, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return `${playerName(player)} ${playerPositionText(player)}`.toLowerCase().includes(needle);
}
