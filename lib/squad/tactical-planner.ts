import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { formatPositionLabel, normalizeCanonicalPosition } from "@/lib/squad/positions";
import { getTacticalFormation, type TacticalFormationCode } from "@/lib/squad/tactical-formations";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import type { Squad, SquadPlayer } from "@/types/domain";

export type TacticalPlanStatus = "active" | "archived";
export type TacticalPlayerInclusionStatus = "included" | "excluded";
export type TacticalPlayerStatus = "first_choice" | "regular_option" | "rotation_option" | "development_option" | "emergency_cover";
export type TacticalFitType = "natural" | "secondary" | "compatible" | "out_of_position" | "no_data";

export type TacticalPlan = {
  id: string;
  userId: string;
  squadId: string;
  name: string;
  formationCode: TacticalFormationCode;
  isDefault: boolean;
  includeNewPlayersAutomatically: boolean;
  notes?: string;
  status: TacticalPlanStatus;
  createdAt: string;
  updatedAt: string;
};

export type TacticalPlanSlot = {
  id: string;
  userId: string;
  planId: string;
  slotKey: string;
  code: string;
  label: string;
  family: string;
  x: number;
  y: number;
  naturalPositions: string[];
  compatiblePositions: string[];
  acceptedPositions: string[];
  sortOrder: number;
};

export type TacticalDepthAssignment = {
  id: string;
  userId: string;
  planId: string;
  slotId: string;
  playerId: string;
  depthOrder: number;
  isPreferredStarter: boolean;
  fitType: TacticalFitType;
  createdAt: string;
  updatedAt: string;
};

export type TacticalPlanPlayerState = {
  id: string;
  userId: string;
  planId: string;
  playerId: string;
  inclusionStatus: TacticalPlayerInclusionStatus;
  tacticalStatus?: TacticalPlayerStatus;
  exclusionReason?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type TacticalPlannerData = {
  squad: Squad;
  plans: TacticalPlan[];
  selectedPlan?: TacticalPlan;
  slots: TacticalPlanSlot[];
  assignments: TacticalDepthAssignment[];
  playerStates: TacticalPlanPlayerState[];
  players: SquadPlayer[];
  warnings: TacticalPlanWarning[];
};

export type TacticalPlanWarning = {
  level: "info" | "warning";
  message: string;
};

type PlanRow = {
  id: string;
  user_id: string;
  squad_id: string;
  name: string;
  formation_code: string;
  is_default: boolean;
  include_new_players_automatically: boolean;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type SlotRow = {
  id: string;
  user_id: string;
  tactical_plan_id: string;
  slot_key: string;
  code: string;
  label: string;
  family: string;
  x: number | string;
  y: number | string;
  accepted_positions: string[] | null;
  sort_order: number;
};

type AssignmentRow = {
  id: string;
  user_id: string;
  tactical_plan_id: string;
  slot_id: string;
  player_id: string;
  depth_order: number;
  is_preferred_starter: boolean;
  fit_type: string;
  created_at: string;
  updated_at: string;
};

type PlayerStateRow = {
  id: string;
  user_id: string;
  tactical_plan_id: string;
  player_id: string;
  inclusion_status: string;
  tactical_status: string | null;
  exclusion_reason: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export function mapTacticalPlanRow(row: PlanRow): TacticalPlan {
  const formation = getTacticalFormation(row.formation_code);
  return {
    id: row.id,
    userId: row.user_id,
    squadId: row.squad_id,
    name: row.name,
    formationCode: formation.code,
    isDefault: row.is_default,
    includeNewPlayersAutomatically: row.include_new_players_automatically,
    notes: row.notes ?? undefined,
    status: row.status === "archived" ? "archived" : "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapTacticalSlotRow(row: SlotRow): TacticalPlanSlot {
  const acceptedPositions = row.accepted_positions ?? [];
  const naturalPositions = getNaturalPositionsForSlot(row.code, acceptedPositions);
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.tactical_plan_id,
    slotKey: row.slot_key,
    code: row.code,
    label: row.label,
    family: row.family,
    x: Number(row.x),
    y: Number(row.y),
    naturalPositions,
    compatiblePositions: acceptedPositions.filter((position) => !naturalPositions.includes(position)),
    acceptedPositions,
    sortOrder: row.sort_order
  };
}

export function mapTacticalAssignmentRow(row: AssignmentRow): TacticalDepthAssignment {
  const fitType = ["natural", "secondary", "compatible", "out_of_position", "no_data"].includes(row.fit_type)
    ? (row.fit_type as TacticalFitType)
    : "no_data";
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.tactical_plan_id,
    slotId: row.slot_id,
    playerId: row.player_id,
    depthOrder: row.depth_order,
    isPreferredStarter: row.is_preferred_starter,
    fitType,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapTacticalPlayerStateRow(row: PlayerStateRow): TacticalPlanPlayerState {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.tactical_plan_id,
    playerId: row.player_id,
    inclusionStatus: row.inclusion_status === "excluded" ? "excluded" : "included",
    tacticalStatus: normalizeTacticalPlayerStatus(row.tactical_status),
    exclusionReason: row.exclusion_reason ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const tacticalPlayerRoleOptions: Array<{ value: TacticalPlayerStatus; label: string; compactLabel: string; score: number }> = [
  { value: "first_choice", label: "First choice", compactLabel: "First choice", score: 25 },
  { value: "regular_option", label: "Regular option", compactLabel: "Regular", score: 15 },
  { value: "rotation_option", label: "Rotation option", compactLabel: "Rotation", score: 8 },
  { value: "development_option", label: "Development option", compactLabel: "Development", score: 3 },
  { value: "emergency_cover", label: "Emergency cover", compactLabel: "Emergency", score: 1 }
];

export function normalizeTacticalPlayerStatus(value?: string | null): TacticalPlayerStatus | undefined {
  if (value === "first_choice" || value === "regular_option" || value === "rotation_option" || value === "development_option" || value === "emergency_cover") return value;
  if (value === "core") return "first_choice";
  if (value === "rotation") return "rotation_option";
  if (value === "development") return "development_option";
  if (value === "limited" || value === "unavailable") return "emergency_cover";
  return undefined;
}

export function tacticalRoleLabel(value?: string | null, compact = false) {
  const role = tacticalPlayerRoleOptions.find((option) => option.value === normalizeTacticalPlayerStatus(value));
  if (!role) return "No role";
  return compact ? role.compactLabel : role.label;
}

export function tacticalRoleScore(value?: string | null) {
  return tacticalPlayerRoleOptions.find((option) => option.value === normalizeTacticalPlayerStatus(value))?.score ?? 0;
}

export function playerName(player: Pick<SquadPlayer, "firstName" | "lastName">) {
  return [player.firstName, player.lastName].filter(Boolean).join(" ");
}

export function playerPositionText(player: Pick<SquadPlayer, "position" | "secondaryPositions">) {
  const primary = formatPositionLabel(player.position) ?? player.position;
  const secondary = (player.secondaryPositions ?? []).map((position) => formatPositionLabel(position) ?? position).filter(Boolean);
  return [primary, ...secondary].filter(Boolean).join(" / ") || "No position";
}

export function getPlayerFitForSlot(player: Pick<SquadPlayer, "position" | "secondaryPositions">, slot: Pick<TacticalPlanSlot, "acceptedPositions"> & Partial<Pick<TacticalPlanSlot, "naturalPositions">>): TacticalFitType {
  const accepted = new Set(slot.acceptedPositions.map((position) => normalizeCanonicalPosition(position) ?? position));
  const natural = new Set((slot.naturalPositions ?? Array.from(accepted).slice(0, 1)).map((position) => normalizeCanonicalPosition(position) ?? position));
  const primary = normalizeCanonicalPosition(player.position);
  const secondary = (player.secondaryPositions ?? []).map((position) => normalizeCanonicalPosition(position)).filter(Boolean) as string[];
  if (!primary && secondary.length === 0) return "no_data";
  if (primary && natural.has(primary)) return "natural";
  if (secondary.some((position) => natural.has(position))) return "secondary";
  if ((primary && accepted.has(primary)) || secondary.some((position) => accepted.has(position))) return "compatible";
  return "out_of_position";
}

export function isAutoFillEligibleFit(fitType: TacticalFitType, allowOutOfPosition = false) {
  return fitType === "natural" || fitType === "secondary" || fitType === "compatible" || (allowOutOfPosition && fitType === "out_of_position");
}

function getNaturalPositionsForSlot(code: string, acceptedPositions: string[]) {
  const naturalByCode: Record<string, string[]> = {
    GK: ["GK"],
    RB: ["RB"],
    LB: ["LB"],
    CB: ["CB"],
    RCB: ["CB"],
    LCB: ["CB"],
    CCB: ["CB"],
    RWB: ["RWB"],
    LWB: ["LWB"],
    CDM: ["CDM"],
    RDM: ["CDM"],
    LDM: ["CDM"],
    CM: ["CM"],
    RCM: ["CM"],
    LCM: ["CM"],
    CAM: ["CAM"],
    RAM: ["CAM"],
    LAM: ["CAM"],
    RM: ["RM"],
    LM: ["LM"],
    RW: ["RW"],
    LW: ["LW"],
    SS: ["SS"],
    ST: ["ST"],
    RST: ["ST"],
    LST: ["ST"]
  };
  const baseCode = code.replace(/^[RLC]/, "");
  return naturalByCode[code] ?? naturalByCode[baseCode] ?? acceptedPositions.slice(0, 1);
}

export async function getTacticalPlannerData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  selectedPlanId?: string
): Promise<TacticalPlannerData> {
  const squad = await ensureActiveSquad(supabase, userId);
  const db = supabase as unknown as SupabaseClient;

  const [plansResult, playersResult] = await Promise.all([
    db
      .from("squad_tactical_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("squad_id", squad.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    db
      .from("squad_players")
      .select("*")
      .eq("user_id", userId)
      .eq("squad_id", squad.id)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true })
  ]);

  if (plansResult.error) throw new Error(plansResult.error.message);
  if (playersResult.error) throw new Error(playersResult.error.message);

  const plans = ((plansResult.data ?? []) as PlanRow[]).map(mapTacticalPlanRow);
  const players = ((playersResult.data ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans.find((plan) => plan.status === "active" && plan.isDefault) ?? plans.find((plan) => plan.status === "active") ?? plans[0];

  if (!selectedPlan) {
    return {
      squad,
      plans,
      players,
      slots: [],
      assignments: [],
      playerStates: [],
      warnings: [{ level: "info", message: "Create your first tactical plan to start building squad depth." }]
    };
  }

  const [slotsResult, assignmentsResult, statesResult] = await Promise.all([
    db
      .from("squad_tactical_plan_slots")
      .select("*")
      .eq("user_id", userId)
      .eq("tactical_plan_id", selectedPlan.id)
      .order("sort_order", { ascending: true }),
    db
      .from("squad_tactical_depth_assignments")
      .select("*")
      .eq("user_id", userId)
      .eq("tactical_plan_id", selectedPlan.id)
      .order("depth_order", { ascending: true }),
    db
      .from("squad_tactical_plan_player_states")
      .select("*")
      .eq("user_id", userId)
      .eq("tactical_plan_id", selectedPlan.id)
  ]);

  if (slotsResult.error) throw new Error(slotsResult.error.message);
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
  if (statesResult.error) throw new Error(statesResult.error.message);

  const slots = ((slotsResult.data ?? []) as SlotRow[]).map(mapTacticalSlotRow);
  const assignments = ((assignmentsResult.data ?? []) as AssignmentRow[]).map(mapTacticalAssignmentRow);
  const playerStates = ((statesResult.data ?? []) as PlayerStateRow[]).map(mapTacticalPlayerStateRow);

  return {
    squad,
    plans,
    selectedPlan,
    slots,
    assignments,
    playerStates,
    players,
    warnings: buildPlannerWarnings(slots, assignments, playerStates, players)
  };
}

function buildPlannerWarnings(
  slots: TacticalPlanSlot[],
  assignments: TacticalDepthAssignment[],
  playerStates: TacticalPlanPlayerState[],
  players: SquadPlayer[]
): TacticalPlanWarning[] {
  const warnings: TacticalPlanWarning[] = [];
  const excluded = new Set(playerStates.filter((state) => state.inclusionStatus === "excluded").map((state) => state.playerId));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const activeAssignments = assignments.filter((assignment) => playerById.has(assignment.playerId) && !excluded.has(assignment.playerId));
  const starters = activeAssignments.filter((assignment) => assignment.isPreferredStarter);

  if (starters.length < 11) {
    warnings.push({ level: "warning", message: `Starting XI has ${starters.length}/11 players selected.` });
  }
  if (starters.length > 11) {
    warnings.push({ level: "warning", message: `Starting XI has ${starters.length} players. Keep it to 11 for match planning.` });
  }

  for (const slot of slots) {
    const depth = activeAssignments.filter((assignment) => assignment.slotId === slot.id);
    if (depth.length === 0) warnings.push({ level: "warning", message: `${slot.code} has no player assigned.` });
    if (depth.length === 1) warnings.push({ level: "info", message: `${slot.code} has only one depth option.` });
  }

  const assignedPlayerIds = new Set(activeAssignments.map((assignment) => assignment.playerId));
  const unassignedRoster = players.filter((player) => player.playerType === "roster" && !excluded.has(player.id) && !assignedPlayerIds.has(player.id));
  if (unassignedRoster.length > 0) {
    warnings.push({ level: "info", message: `${unassignedRoster.length} roster player${unassignedRoster.length === 1 ? "" : "s"} not assigned to any slot.` });
  }

  return warnings.slice(0, 8);
}

export function createSlotRowsForPlan(userId: string, planId: string, formationCode: string) {
  return getTacticalFormation(formationCode).slots.map((slotDefinition) => ({
    user_id: userId,
    tactical_plan_id: planId,
    slot_key: slotDefinition.slotKey,
    code: slotDefinition.code,
    label: slotDefinition.label,
    family: slotDefinition.family,
    x: slotDefinition.x,
    y: slotDefinition.y,
    accepted_positions: slotDefinition.acceptedPositions,
    sort_order: slotDefinition.sortOrder
  }));
}
