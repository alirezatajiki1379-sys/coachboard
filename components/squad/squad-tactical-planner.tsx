"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Archive, Copy, Goal, RotateCcw, Shield, Star, Trash2, Users } from "lucide-react";
import {
  addDepthAssignment,
  archiveTacticalPlan,
  autoFillTacticalPlan,
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
import {
  evaluatePlayerSlotFit,
  playerName,
  playerPositionText,
  resolveCandidatesForPosition,
  squadDepthPositions,
  tacticalPlayerRoleOptions,
  tacticalRoleLabel,
  tacticalRoleScore,
  type PositionCandidate,
  type TacticalPlannerData,
  type TacticalPlanSlot,
  type TacticalFitType
} from "@/lib/squad/tactical-planner";
import { tacticalFormations } from "@/lib/squad/tactical-formations";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPositionFamily, positionFamilyMeta, positionFamilyOrder, type PositionFamily } from "@/lib/squad/positions";
import type { SquadPlayer } from "@/types/domain";

type PlannerMode = "formation" | "depth";

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

const depthPitchRows = [
  ["ST"],
  ["SS"],
  ["LW", "CAM", "RW"],
  ["LM", "CM", "RM"],
  ["CDM"],
  ["LWB", "LB", "CB", "RB", "RWB"],
  ["GK"]
];

export function SquadTacticalPlanner({ data }: { data: TacticalPlannerData }) {
  const [mode, setMode] = useState<PlannerMode>("formation");
  const [selectedSlotId, setSelectedSlotId] = useState(data.slots[0]?.id ?? "");
  const [showTrials, setShowTrials] = useState(false);
  const [search, setSearch] = useState("");
  const [poolFilter, setPoolFilter] = useState<"all" | "unassigned" | "excluded">("unassigned");
  const [roleFilter, setRoleFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");

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
            <p className="text-xs font-bold uppercase text-board-green">Squad Planner · {data.squad.name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PlanSelect plans={activePlans} selectedPlanId={data.selectedPlan.id} />
              {data.selectedPlan.isDefault ? <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-green-700">Default</span> : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {data.selectedPlan.formationCode} · {starters.length}/11 starters · {activeAssignments.length} depth assignments
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
                  className="h-10 rounded-md border border-board-line px-3 text-sm font-semibold"
                  onChange={(event) => {
                    const currentAssignments = activeAssignments.length;
                    if (currentAssignments > 0 && !window.confirm("Change formation? Compatible Player assignments will be preserved. Assignments without a matching slot will return to Unassigned Players.")) {
                      event.currentTarget.value = data.selectedPlan?.formationCode ?? "4-3-3";
                      return;
                    }
                    event.currentTarget.form?.requestSubmit();
                  }}
                >
                  {tacticalFormations.map((formation) => (
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
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-board-line pt-4">
          <details className="rounded-md border border-board-line bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-bold text-board-navy">Rename / notes</summary>
          <form action={updateTacticalPlan} className="mt-3 grid gap-3 md:grid-cols-2">
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
            <CreatePlanForm compact />
            <details className="relative rounded-md border border-board-line bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-bold text-board-navy">More</summary>
              <div className="absolute left-0 z-30 mt-2 w-56 space-y-2 rounded-lg border border-board-line bg-white p-3 shadow-xl">
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

      {mode === "depth" ? (
        <UniversalSquadDepth
          players={data.players}
          playerStates={data.playerStates}
          assignments={activeAssignments}
          slots={data.slots}
          selectedPlanId={data.selectedPlan.id}
          excludedPlayerIds={excludedPlayerIds}
        />
      ) : (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-board-navy">Formation board</h3>
              <p className="text-sm text-slate-600">Click a slot to manage starter and depth. The board does not change training sessions.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AutoFillMenu
                planId={data.selectedPlan.id}
                slots={data.slots}
                players={data.players}
                assignments={activeAssignments}
                playerStates={data.playerStates}
              />
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
            selectedSlot={selectedSlot}
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
      )}
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
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      Plan
      <select
        value={selectedPlanId}
        onChange={(event) => {
          window.location.href = `/squad/planner?plan=${event.target.value}`;
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
  const [mode, setMode] = useState<"empty_xi" | "xi_depth" | "rebuild_all">("empty_xi");
  const [includeTrials, setIncludeTrials] = useState(false);
  const [allowOutOfPosition, setAllowOutOfPosition] = useState(false);
  const preview = useMemo(
    () => buildAutoFillPreview({ mode, includeTrials, allowOutOfPosition, slots, players, assignments, playerStates }),
    [allowOutOfPosition, assignments, includeTrials, mode, playerStates, players, slots]
  );
  return (
    <details className="relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md bg-board-green px-3 text-sm font-bold text-white shadow-sm transition hover:bg-board-green/90">
        <Users className="h-4 w-4" />
        Auto-fill
      </summary>
      <form
        action={autoFillTacticalPlan}
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);
          if (formData.get("mode") === "rebuild_all" && assignments.length > 0 && !window.confirm("Rebuild all assignments? Existing Starting XI and depth ordering will be replaced. Excluded players stay excluded.")) {
            event.preventDefault();
          }
        }}
        className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-board-line bg-white p-3 shadow-xl"
      >
        <input type="hidden" name="planId" value={planId} />
        <label className="space-y-1 text-xs font-bold text-slate-700">
          Mode
          <select name="mode" value={mode} onChange={(event) => setMode(event.target.value as "empty_xi" | "xi_depth" | "rebuild_all")} className="h-10 w-full rounded-md border border-board-line px-3 text-sm font-semibold">
            <option value="empty_xi">Fill empty Starting XI slots</option>
            <option value="xi_depth">Fill XI + basic depth</option>
            <option value="rebuild_all">Rebuild all assignments</option>
          </select>
        </label>
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
            <span>{preview.filledStarters}/11 starters</span>
            <span>{preview.newStarters} new starters</span>
            <span>{preview.backupsAdded} backups</span>
            <span>{preview.unassignedCount} unassigned</span>
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
        <p className="mt-2 text-xs text-slate-500">Uses natural position fit first, then tactical role, then backup depth.</p>
        <Button type="submit" className="mt-3 w-full">Apply auto-fill</Button>
      </form>
    </details>
  );
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

function SlotButton({
  slot,
  selected,
  assignments,
  playersById,
  onSelect
}: {
  slot: TacticalPlanSlot;
  selected: boolean;
  assignments: TacticalPlannerData["assignments"];
  playersById: Map<string, SquadPlayer>;
  onSelect: () => void;
}) {
  const starter = assignments.find((assignment) => assignment.isPreferredStarter);
  const starterPlayer = starter ? playersById.get(starter.playerId) : undefined;
  const depthCount = assignments.length;
  const displayText = starterPlayer ? playerName(starterPlayer) : "Open";

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
  const availableCandidates = addablePlayers
    .map((player) => ({ player, fit: evaluatePlayerSlotFit(player, slot) }))
    .filter((item) => item.fit.eligible)
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
                <p className="font-bold text-board-navy">{playerName(player)}</p>
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

function UniversalSquadDepth({
  players,
  playerStates,
  assignments,
  slots,
  selectedPlanId,
  excludedPlayerIds
}: {
  players: SquadPlayer[];
  playerStates: TacticalPlannerData["playerStates"];
  assignments: TacticalPlannerData["assignments"];
  slots: TacticalPlanSlot[];
  selectedPlanId: string;
  excludedPlayerIds: Set<string>;
}) {
  const [selectedPosition, setSelectedPosition] = useState("LB");
  const [scope, setScope] = useState<"all" | "included">("all");
  const [includeCompatible, setIncludeCompatible] = useState(false);
  const statesByPlayer = new Map(playerStates.map((state) => [state.playerId, state]));
  const scopedPlayers = scope === "included" ? players.filter((player) => !excludedPlayerIds.has(player.id)) : players;
  const selectedCandidates = resolveCandidatesForPosition({ players: scopedPlayers, canonicalPosition: selectedPosition, includeCompatible });
  const primaryCandidates = selectedCandidates.filter((candidate) => candidate.fit === "primary");
  const secondaryCandidates = selectedCandidates.filter((candidate) => candidate.fit === "secondary");
  const compatibleCandidates = selectedCandidates.filter((candidate) => candidate.fit === "compatible");
  const slotForPosition = slots.find((slot) => slot.naturalPositions.includes(selectedPosition) || slot.acceptedPositions.includes(selectedPosition));
  const assignmentsByPlayer = new Map<string, TacticalPlannerData["assignments"]>();
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  for (const assignment of assignments) {
    assignmentsByPlayer.set(assignment.playerId, [...(assignmentsByPlayer.get(assignment.playerId) ?? []), assignment]);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="font-bold text-board-navy">Depth</h3>
            <p className="mt-1 text-sm text-slate-600">Formation-independent pitch view. Primary and secondary candidates are listed directly for every position.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs font-bold text-slate-600">
              Scope
              <select value={scope} onChange={(event) => setScope(event.target.value as "all" | "included")} className="mt-1 h-9 rounded-md border border-board-line px-2 text-xs">
                <option value="all">All active squad players</option>
                <option value="included">Included in selected tactical plan</option>
              </select>
            </label>
            <label className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={includeCompatible} onChange={(event) => setIncludeCompatible(event.target.checked)} />
              Include compatible alternatives
            </label>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-emerald-900/20 bg-emerald-700 p-3 shadow-inner">
          <div className="relative overflow-hidden rounded-lg border-2 border-white/70 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_50%,transparent_50%),linear-gradient(0deg,rgba(255,255,255,0.05)_50%,transparent_50%)] bg-[length:32px_32px] p-3 sm:p-4">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
            <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-white/35" />
            <div className="relative space-y-3">
              {depthPitchRows.map((row) => (
                <div
                  key={row.join("-")}
                  className={cn(
                    "grid gap-3",
                    row.length === 1 ? "grid-cols-1 justify-items-center" : "",
                    row.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "",
                    row.length === 5 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" : ""
                  )}
                >
                  {row.map((code) => {
                    const position = squadDepthPositions.find((item) => item.code === code);
                    if (!position) return null;
                    const exactCandidates = resolveCandidatesForPosition({ players: scopedPlayers, canonicalPosition: position.code });
                    const shownCandidates = includeCompatible ? resolveCandidatesForPosition({ players: scopedPlayers, canonicalPosition: position.code, includeCompatible: true }) : exactCandidates;
                    return (
                      <DepthPitchCard
                        key={position.code}
                        position={position}
                        exactCandidates={exactCandidates}
                        shownCandidates={shownCandidates}
                        selected={selectedPosition === position.code}
                        onSelect={() => setSelectedPosition(position.code)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <aside className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
        <h3 className="font-bold text-board-navy">{squadDepthPositions.find((position) => position.code === selectedPosition)?.label ?? selectedPosition}</h3>
        <p className="text-sm text-slate-600">{selectedCandidates.length} shown · {primaryCandidates.length} primary · {secondaryCandidates.length} secondary{includeCompatible ? ` · ${compatibleCandidates.length} compatible` : ""}</p>
        {selectedCandidates.length === 0 ? (
          <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">No squad player has {selectedPosition} as a primary or secondary position.</p>
        ) : (
          <div className="mt-4 max-h-[680px] space-y-3 overflow-y-auto pr-1">
            <CandidateGroup title="Primary options" candidates={primaryCandidates} statesByPlayer={statesByPlayer} assignmentsByPlayer={assignmentsByPlayer} slotById={slotById} selectedPlanId={selectedPlanId} slot={slotForPosition} />
            <CandidateGroup title="Secondary options" candidates={secondaryCandidates} statesByPlayer={statesByPlayer} assignmentsByPlayer={assignmentsByPlayer} slotById={slotById} selectedPlanId={selectedPlanId} slot={slotForPosition} />
            {includeCompatible ? <CandidateGroup title="Compatible alternatives" candidates={compatibleCandidates} statesByPlayer={statesByPlayer} assignmentsByPlayer={assignmentsByPlayer} slotById={slotById} selectedPlanId={selectedPlanId} slot={slotForPosition} /> : null}
          </div>
        )}
      </aside>
    </div>
  );
}

function DepthPitchCard({
  position,
  exactCandidates,
  shownCandidates,
  selected,
  onSelect
}: {
  position: (typeof squadDepthPositions)[number];
  exactCandidates: PositionCandidate[];
  shownCandidates: PositionCandidate[];
  selected: boolean;
  onSelect: () => void;
}) {
  const primaryCount = exactCandidates.filter((candidate) => candidate.fit === "primary").length;
  const secondaryCount = exactCandidates.filter((candidate) => candidate.fit === "secondary").length;
  const exactCount = primaryCount + secondaryCount;
  const compatibleCount = shownCandidates.filter((candidate) => candidate.fit === "compatible").length;
  const warning = exactCount === 0 ? "No exact option" : exactCount === 1 ? "Thin" : exactCount === 2 ? "Covered" : "Strong";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "min-h-36 w-full max-w-full rounded-lg border p-3 text-left shadow-lg transition sm:max-w-xs",
        selected ? "border-board-green bg-white text-board-navy ring-4 ring-board-green/30" : "border-white/70 bg-white/95 text-slate-800 hover:bg-white"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-board-green">{position.code}</p>
          <p className="truncate text-sm font-black text-board-navy">{position.label}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{warning}</span>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-600">
        {exactCount} exact · {primaryCount} primary · {secondaryCount} secondary{compatibleCount ? ` · ${compatibleCount} compatible` : ""}
      </p>
      <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
        {shownCandidates.length === 0 ? (
          <p className="rounded bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-500">No player yet</p>
        ) : shownCandidates.map((candidate) => (
          <div key={`${position.code}-${candidate.player.id}-${candidate.fit}-${candidate.matchedPosition}`} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5">
            <span className="min-w-0 truncate text-xs font-bold text-board-navy">{playerName(candidate.player)}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase",
                candidate.fit === "primary" ? "bg-board-green text-white" : candidate.fit === "secondary" ? "bg-white text-slate-700 ring-1 ring-slate-200" : "bg-sky-100 text-sky-700"
              )}
            >
              {candidate.fit === "primary" ? "Primary" : candidate.fit === "secondary" ? "Secondary" : "Compatible"}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

function CandidateGroup({
  title,
  candidates,
  statesByPlayer,
  assignmentsByPlayer,
  slotById,
  selectedPlanId,
  slot
}: {
  title: string;
  candidates: PositionCandidate[];
  statesByPlayer: Map<string, TacticalPlannerData["playerStates"][number]>;
  assignmentsByPlayer: Map<string, TacticalPlannerData["assignments"]>;
  slotById: Map<string, TacticalPlanSlot>;
  selectedPlanId: string;
  slot?: TacticalPlanSlot;
}) {
  if (candidates.length === 0) return null;
  return (
    <section>
      <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="space-y-2">
        {candidates.map((candidate) => {
          const assignedToSlot = Boolean(slot && (assignmentsByPlayer.get(candidate.player.id) ?? []).some((assignment) => assignment.slotId === slot.id));
          return (
            <div
              key={`${candidate.player.id}-${candidate.matchedPosition}-${candidate.fit}`}
              className={cn(
                "rounded-lg border p-3",
                candidate.fit === "primary" ? "border-emerald-200 bg-emerald-50" : candidate.fit === "secondary" ? "border-board-line bg-white" : "border-sky-200 bg-sky-50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-board-navy">{playerName(candidate.player)}</p>
                  <p className="text-xs font-semibold text-slate-600">{playerPositionText(candidate.player)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatAssignmentsSummary(assignmentsByPlayer.get(candidate.player.id) ?? [], slotById) || "No tactical depth assignment"}</p>
                </div>
                <span className={cn("rounded-full px-2 py-1 text-[11px] font-black uppercase", candidate.fit === "primary" ? "bg-board-green text-white" : "bg-slate-100 text-slate-700")}>
                  {candidate.fit}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusChip label={tacticalRoleLabel(statesByPlayer.get(candidate.player.id)?.tacticalStatus, true)} />
                <StatusChip label={`Matched ${candidate.matchedPosition}`} tone={candidate.fit === "primary" ? "green" : "slate"} />
                {slot ? (
                  <form action={addDepthAssignment}>
                    <input type="hidden" name="planId" value={selectedPlanId} />
                    <input type="hidden" name="slotId" value={slot.id} />
                    <input type="hidden" name="playerId" value={candidate.player.id} />
                    <Button type="submit" variant="secondary" disabled={assignedToSlot} className="h-8 px-2 text-xs">
                      {assignedToSlot ? "In depth" : `Add to ${slot.code}`}
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
}) {
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
          <h3 className="font-bold text-board-navy">{selectedSlot ? `${selectedSlot.code} options` : "Player pool"}</h3>
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
  alreadyInSelectedSlot
}: {
  planId: string;
  player: SquadPlayer;
  state?: TacticalPlannerData["playerStates"][number];
  excluded: boolean;
  selectedSlot?: TacticalPlanSlot;
  assignmentsSummary?: string;
  alreadyInSelectedSlot?: boolean;
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
            <p className="font-bold text-board-navy">{playerName(player)}</p>
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
    <div className="rounded-lg border border-board-line bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-bold text-board-navy">{playerName(player)}</p>
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
  includeTrials,
  allowOutOfPosition,
  slots,
  players,
  assignments,
  playerStates
}: {
  mode: "empty_xi" | "xi_depth" | "rebuild_all";
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
  const startingRows = mode === "rebuild_all" ? [] : assignments.filter((assignment) => assignment.isPreferredStarter);
  const usedStarterPlayerIds = new Set(startingRows.map((assignment) => assignment.playerId));
  const filledSlotIds = new Set(startingRows.map((assignment) => assignment.slotId));
  const rows: Array<{ slotId: string; slotCode: string; playerName: string; detail: string; fitType?: TacticalFitType; isExisting: boolean }> = [];
  const messages: string[] = [];
  const orderedSlots = sortPreviewSlotsByScarcity(slots, eligiblePlayers, stateByPlayer, allowOutOfPosition);
  const previewPicks = choosePreviewStarterAssignments(
    orderedSlots.filter((slot) => mode === "rebuild_all" || !assignments.some((assignment) => assignment.slotId === slot.id && assignment.isPreferredStarter)),
    eligiblePlayers,
    stateByPlayer,
    new Set(startingRows.map((assignment) => assignment.playerId)),
    allowOutOfPosition
  );
  const previewPickBySlot = new Map(previewPicks.map((pick) => [pick.slot.id, pick]));

  for (const slot of orderedSlots) {
    const existingStarter = mode === "rebuild_all" ? undefined : assignments.find((assignment) => assignment.slotId === slot.id && assignment.isPreferredStarter);
    const existingPlayer = existingStarter ? players.find((player) => player.id === existingStarter.playerId) : undefined;
    if (existingPlayer) {
      rows.push({ slotId: slot.id, slotCode: slot.code, playerName: `${playerName(existingPlayer)} · kept`, detail: `${playerPositionText(existingPlayer)} · ${fitMeta[existingStarter?.fitType ?? "no_data"].label}`, fitType: existingStarter?.fitType, isExisting: true });
      continue;
    }
    if (filledSlotIds.has(slot.id)) continue;
    const pick = previewPickBySlot.get(slot.id);
    if (!pick) {
      rows.push({ slotId: slot.id, slotCode: slot.code, playerName: "No suitable player", detail: `No natural, secondary or compatible ${slot.label} option found.`, isExisting: false });
      messages.push(`No suitable ${slot.label} available`);
      continue;
    }
    rows.push({ slotId: slot.id, slotCode: slot.code, playerName: playerName(pick.player), detail: `${playerPositionText(pick.player)} · matched ${pick.matchedPosition ?? "position"} · ${fitMeta[pick.fitType].label} · ${tacticalRoleLabel(stateByPlayer.get(pick.player.id)?.tacticalStatus, true)}`, fitType: pick.fitType, isExisting: false });
    usedStarterPlayerIds.add(pick.player.id);
  }

  const filledStarters = rows.filter((row) => row.playerName !== "No suitable player").length;
  const newStarters = rows.filter((row) => !row.isExisting && row.playerName !== "No suitable player").length;
  const outOfPositionCount = rows.filter((row) => row.fitType === "out_of_position").length;
  const assignedPlayerIds = new Set(assignments.map((assignment) => assignment.playerId));
  const previewStarterIds = new Set(rows.flatMap((row) => {
    const player = eligiblePlayers.find((item) => playerName(item) === row.playerName);
    return player ? [player.id] : [];
  }));
  const unassignedCount = eligiblePlayers.filter((player) => !assignedPlayerIds.has(player.id) && !previewStarterIds.has(player.id)).length;
  const backupsAdded = mode === "xi_depth" || mode === "rebuild_all"
    ? slots.filter((slot) => choosePreviewPlayerForSlot(eligiblePlayers, slot, stateByPlayer, new Set(assignments.filter((assignment) => assignment.slotId === slot.id).map((assignment) => assignment.playerId)), allowOutOfPosition)).length
    : 0;

  if (eligiblePlayers.length === 0) messages.push("No included active squad players available.");
  return { rows, filledStarters, newStarters, backupsAdded, unassignedCount, outOfPositionCount, messages: Array.from(new Set(messages)).slice(0, 4) };
}

function sortPreviewSlotsByScarcity(
  slots: TacticalPlanSlot[],
  players: SquadPlayer[],
  stateByPlayer: Map<string, TacticalPlannerData["playerStates"][number]>,
  allowOutOfPosition: boolean
) {
  return [...slots].sort((a, b) => {
    const aCandidates = players.filter((player) => scorePreviewPlayerForSlot(player, a, stateByPlayer.get(player.id)?.tacticalStatus, allowOutOfPosition) > 0).length;
    const bCandidates = players.filter((player) => scorePreviewPlayerForSlot(player, b, stateByPlayer.get(player.id)?.tacticalStatus, allowOutOfPosition) > 0).length;
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
            score: fit.eligible ? fit.baseScore + tacticalRoleScore(stateByPlayer.get(player.id)?.tacticalStatus) * 2 : 0
          };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score || playerName(a.player).localeCompare(playerName(b.player)))
    );
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

function choosePreviewPlayerForSlot(
  players: SquadPlayer[],
  slot: TacticalPlanSlot,
  stateByPlayer: Map<string, TacticalPlannerData["playerStates"][number]>,
  disallowedPlayerIds: Set<string>,
  allowOutOfPosition: boolean
) {
  return [...players]
    .filter((player) => !disallowedPlayerIds.has(player.id))
    .map((player) => ({ player, score: scorePreviewPlayerForSlot(player, slot, stateByPlayer.get(player.id)?.tacticalStatus, allowOutOfPosition) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || playerName(a.player).localeCompare(playerName(b.player)))[0]?.player;
}

function scorePreviewPlayerForSlot(player: SquadPlayer, slot: TacticalPlanSlot, tacticalStatus: string | undefined, allowOutOfPosition: boolean) {
  const fit = evaluatePlayerSlotFit(player, slot, allowOutOfPosition);
  if (!fit.eligible) return 0;
  return fit.baseScore + tacticalRoleScore(tacticalStatus) * 2;
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
