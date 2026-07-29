"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { createSlotRowsForPlan, evaluatePlayerSlotFit, getPlayerFitForSlot, isFitAllowedByAutoFillEligibility, mapTacticalSlotRow, normalizeTacticalPlayerStatus, tacticalRoleScore, type AutoFillEligibility, type TacticalFitType, type TacticalPlanSlot } from "@/lib/squad/tactical-planner";
import { getTacticalFormation } from "@/lib/squad/tactical-formations";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import type { SquadPlayer } from "@/types/domain";

type PlanRow = {
  id: string;
  squad_id: string;
  formation_code: string;
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
};

type PlayerStateActionRow = {
  player_id: string;
  inclusion_status: string;
  tactical_status: string | null;
};

type AutoFillMode = "empty_xi" | "xi_depth" | "xi_all_depth" | "rebuild_xi" | "rebuild_all";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, db: supabase as unknown as SupabaseClient, user };
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectToPlanner(planId?: string): never {
  revalidatePath("/squad/planner");
  redirect(planId ? `/squad/planner?plan=${planId}` : "/squad/planner");
}

async function getOwnedPlan(db: SupabaseClient, userId: string, planId: string): Promise<PlanRow | null> {
  const { data, error } = await db
    .from("squad_tactical_plans")
    .select("id,squad_id,formation_code")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PlanRow | null;
}

async function getOwnedSlot(db: SupabaseClient, userId: string, slotId: string): Promise<TacticalPlanSlot | null> {
  const { data, error } = await db
    .from("squad_tactical_plan_slots")
    .select("*")
    .eq("id", slotId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTacticalSlotRow(data as SlotRow) : null;
}

async function getOwnedPlayer(db: SupabaseClient, userId: string, squadId: string, playerId: string) {
  const { data, error } = await db
    .from("squad_players")
    .select("*")
    .eq("id", playerId)
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSquadPlayerRow(data as SquadPlayerRow) : null;
}

export async function createTacticalPlan(formData: FormData) {
  const { supabase, db, user } = await requireUser();
  const squad = await ensureActiveSquad(supabase, user.id);
  const name = text(formData, "name") || "New tactical plan";
  const formationCode = getTacticalFormation(text(formData, "formationCode")).code;

  const { data: existingDefault } = await db
    .from("squad_tactical_plans")
    .select("id")
    .eq("user_id", user.id)
    .eq("squad_id", squad.id)
    .eq("is_default", true)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const { data: plan, error } = await db
    .from("squad_tactical_plans")
    .insert({
      user_id: user.id,
      squad_id: squad.id,
      name,
      formation_code: formationCode,
      is_default: !existingDefault
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  await db.from("squad_tactical_plan_slots").insert(createSlotRowsForPlan(user.id, plan.id, formationCode));
  redirectToPlanner(plan.id);
}

export async function updateTacticalPlan(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const plan = await getOwnedPlan(db, user.id, planId);
  if (!plan) redirectToPlanner();

  const name = text(formData, "name") || "Tactical plan";
  const formationCode = getTacticalFormation(text(formData, "formationCode")).code;
  const includeNewPlayersAutomatically = formData.get("includeNewPlayersAutomatically") === "on";
  const notes = text(formData, "notes") || null;

  const { error } = await db
    .from("squad_tactical_plans")
    .update({
      name,
      formation_code: formationCode,
      include_new_players_automatically: includeNewPlayersAutomatically,
      notes
    })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  if (formationCode !== plan.formation_code) {
    await replacePlanSlots(db, user.id, planId, formationCode);
  }

  redirectToPlanner(planId);
}

async function replacePlanSlots(db: SupabaseClient, userId: string, planId: string, formationCode: string) {
  const { data: oldSlots } = await db.from("squad_tactical_plan_slots").select("*").eq("user_id", userId).eq("tactical_plan_id", planId);
  const slotKeyById = new Map(((oldSlots ?? []) as SlotRow[]).map((slotRow) => [slotRow.id, slotRow.slot_key]));
  const { data: oldAssignments } = await db
    .from("squad_tactical_depth_assignments")
    .select("*")
    .eq("user_id", userId)
    .eq("tactical_plan_id", planId);

  await db.from("squad_tactical_plan_slots").delete().eq("user_id", userId).eq("tactical_plan_id", planId);

  const { data: newSlots, error } = await db
    .from("squad_tactical_plan_slots")
    .insert(createSlotRowsForPlan(userId, planId, formationCode))
    .select("*");
  if (error) throw new Error(error.message);

  const newSlotIdByKey = new Map(((newSlots ?? []) as SlotRow[]).map((slotRow) => [slotRow.slot_key, slotRow.id]));
  const nextAssignments = ((oldAssignments ?? []) as AssignmentRow[]).flatMap((assignment) => {
    const oldSlotKey = slotKeyById.get(assignment.slot_id);
    const newSlotId = oldSlotKey ? newSlotIdByKey.get(oldSlotKey) : undefined;
    if (!newSlotId) return [];
    return [{
      user_id: userId,
      tactical_plan_id: planId,
      slot_id: newSlotId,
      player_id: assignment.player_id,
      depth_order: assignment.depth_order,
      is_preferred_starter: assignment.is_preferred_starter,
      fit_type: assignment.fit_type
    }];
  });
  if (nextAssignments.length > 0) await db.from("squad_tactical_depth_assignments").insert(nextAssignments);
}

export async function duplicateTacticalPlan(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const { data: source, error: sourceError } = await db
    .from("squad_tactical_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sourceError) throw new Error(sourceError.message);
  if (!source) redirectToPlanner();

  const sourcePlan = source as Record<string, unknown> & PlanRow & { name: string; include_new_players_automatically: boolean; notes: string | null; status: string };
  const { data: copy, error: copyError } = await db
    .from("squad_tactical_plans")
    .insert({
      user_id: user.id,
      squad_id: sourcePlan.squad_id,
      name: `${sourcePlan.name} copy`,
      formation_code: sourcePlan.formation_code,
      include_new_players_automatically: sourcePlan.include_new_players_automatically,
      notes: sourcePlan.notes,
      status: "active",
      is_default: false
    })
    .select("id")
    .single();
  if (copyError) throw new Error(copyError.message);

  const { data: sourceSlots } = await db.from("squad_tactical_plan_slots").select("*").eq("user_id", user.id).eq("tactical_plan_id", planId);
  const slotIdMap = new Map<string, string>();
  if (sourceSlots?.length) {
    const { data: copiedSlots, error: slotError } = await db
      .from("squad_tactical_plan_slots")
      .insert((sourceSlots as SlotRow[]).map((slotRow) => ({
        user_id: user.id,
        tactical_plan_id: copy.id,
        slot_key: slotRow.slot_key,
        code: slotRow.code,
        label: slotRow.label,
        family: slotRow.family,
        x: slotRow.x,
        y: slotRow.y,
        accepted_positions: slotRow.accepted_positions ?? [],
        sort_order: slotRow.sort_order
      })))
      .select("*");
    if (slotError) throw new Error(slotError.message);
    (sourceSlots as SlotRow[]).forEach((slotRow) => {
      const copied = (copiedSlots as SlotRow[]).find((copiedSlot) => copiedSlot.slot_key === slotRow.slot_key);
      if (copied) slotIdMap.set(slotRow.id, copied.id);
    });
  }

  const { data: sourceStates } = await db.from("squad_tactical_plan_player_states").select("*").eq("user_id", user.id).eq("tactical_plan_id", planId);
  if (sourceStates?.length) {
    await db.from("squad_tactical_plan_player_states").insert((sourceStates as Array<Record<string, unknown>>).map((state) => ({
      user_id: user.id,
      tactical_plan_id: copy.id,
      player_id: state.player_id,
      inclusion_status: state.inclusion_status,
      tactical_status: state.tactical_status,
      exclusion_reason: state.exclusion_reason,
      note: state.note
    })));
  }

  const { data: sourceAssignments } = await db.from("squad_tactical_depth_assignments").select("*").eq("user_id", user.id).eq("tactical_plan_id", planId);
  const copiedAssignments = ((sourceAssignments ?? []) as AssignmentRow[]).flatMap((assignment) => {
    const slotId = slotIdMap.get(assignment.slot_id);
    if (!slotId) return [];
    return [{
      user_id: user.id,
      tactical_plan_id: copy.id,
      slot_id: slotId,
      player_id: assignment.player_id,
      depth_order: assignment.depth_order,
      is_preferred_starter: assignment.is_preferred_starter,
      fit_type: assignment.fit_type
    }];
  });
  if (copiedAssignments.length) await db.from("squad_tactical_depth_assignments").insert(copiedAssignments);

  redirectToPlanner(copy.id);
}

export async function setDefaultTacticalPlan(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const plan = await getOwnedPlan(db, user.id, planId);
  if (!plan) redirectToPlanner();
  await db.from("squad_tactical_plans").update({ is_default: false }).eq("user_id", user.id).eq("squad_id", plan.squad_id);
  await db.from("squad_tactical_plans").update({ is_default: true, status: "active" }).eq("id", planId).eq("user_id", user.id);
  redirectToPlanner(planId);
}

export async function archiveTacticalPlan(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  await db.from("squad_tactical_plans").update({ status: "archived", is_default: false }).eq("id", planId).eq("user_id", user.id);
  redirectToPlanner();
}

export async function restoreTacticalPlan(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  await db.from("squad_tactical_plans").update({ status: "active" }).eq("id", planId).eq("user_id", user.id);
  redirectToPlanner(planId);
}

export async function deleteTacticalPlan(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  await db.from("squad_tactical_plans").delete().eq("id", planId).eq("user_id", user.id);
  redirectToPlanner();
}

export async function addDepthAssignment(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const slotId = text(formData, "slotId");
  const playerId = text(formData, "playerId");
  const plan = await getOwnedPlan(db, user.id, planId);
  const slot = await getOwnedSlot(db, user.id, slotId);
  if (!plan || !slot || !playerId) redirectToPlanner(planId);
  const player = await getOwnedPlayer(db, user.id, plan.squad_id, playerId);
  if (!player) redirectToPlanner(planId);

  await db.from("squad_tactical_plan_player_states").upsert({
    user_id: user.id,
    tactical_plan_id: planId,
    player_id: playerId,
    inclusion_status: "included"
  }, { onConflict: "tactical_plan_id,player_id" });

  const { data: existing } = await db
    .from("squad_tactical_depth_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("tactical_plan_id", planId)
    .eq("slot_id", slotId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (existing) redirectToPlanner(planId);

  const { data: rows } = await db
    .from("squad_tactical_depth_assignments")
    .select("depth_order,is_preferred_starter")
    .eq("user_id", user.id)
    .eq("tactical_plan_id", planId)
    .eq("slot_id", slotId);
  const nextOrder = Math.max(0, ...((rows ?? []) as Array<{ depth_order: number }>).map((row) => row.depth_order)) + 1;
  const hasStarter = ((rows ?? []) as Array<{ is_preferred_starter: boolean }>).some((row) => row.is_preferred_starter);
  const shouldStart = !hasStarter;
  if (shouldStart) {
    await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId).eq("player_id", playerId);
  }

  const { error } = await db.from("squad_tactical_depth_assignments").insert({
    user_id: user.id,
    tactical_plan_id: planId,
    slot_id: slotId,
    player_id: playerId,
    depth_order: nextOrder,
    is_preferred_starter: shouldStart,
    fit_type: getPlayerFitForSlot(player, slot)
  });
  if (error) throw new Error(error.message);
  redirectToPlanner(planId);
}

export async function addAllEligibleDepthAssignments(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const slotId = text(formData, "slotId");
  const eligibility = parseAutoFillEligibility(text(formData, "eligibility"));
  const plan = await getOwnedPlan(db, user.id, planId);
  const slot = await getOwnedSlot(db, user.id, slotId);
  if (!plan || !slot) redirectToPlanner(planId);

  const [playersResult, statesResult, assignmentsResult] = await Promise.all([
    db.from("squad_players").select("*").eq("user_id", user.id).eq("squad_id", plan.squad_id).is("archived_at", null).is("deleted_at", null).order("last_name", { ascending: true, nullsFirst: false }).order("first_name", { ascending: true }),
    db.from("squad_tactical_plan_player_states").select("player_id,inclusion_status,tactical_status").eq("user_id", user.id).eq("tactical_plan_id", planId),
    db.from("squad_tactical_depth_assignments").select("*").eq("user_id", user.id).eq("tactical_plan_id", planId).eq("slot_id", slotId).order("depth_order", { ascending: true })
  ]);
  if (playersResult.error) throw new Error(playersResult.error.message);
  if (statesResult.error) throw new Error(statesResult.error.message);
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);

  const states = (statesResult.data ?? []) as PlayerStateActionRow[];
  const stateByPlayer = new Map(states.map((state) => [state.player_id, state]));
  const excludedPlayerIds = new Set(states.filter((state) => state.inclusion_status === "excluded").map((state) => state.player_id));
  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const assignedPlayerIds = new Set(assignments.map((assignment) => assignment.player_id));
  let nextOrder = Math.max(0, ...assignments.map((assignment) => assignment.depth_order)) + 1;
  const players = ((playersResult.data ?? []) as SquadPlayerRow[])
    .map(mapSquadPlayerRow)
    .filter((player) => !excludedPlayerIds.has(player.id));
  const candidates = choosePlayersForSlot(players, slot, stateByPlayer, assignedPlayerIds, eligibility, false);
  const rows = candidates.map((candidate) => ({
    user_id: user.id,
    tactical_plan_id: planId,
    slot_id: slotId,
    player_id: candidate.player.id,
    depth_order: nextOrder++,
    is_preferred_starter: false,
    fit_type: candidate.fitType
  }));

  if (rows.length > 0) {
    const { error } = await db.from("squad_tactical_depth_assignments").insert(rows);
    if (error) throw new Error(error.message);
  }
  redirectToPlanner(planId);
}

export async function removeDepthAssignment(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const assignmentId = text(formData, "assignmentId");
  const { data: assignment } = await db
    .from("squad_tactical_depth_assignments")
    .select("slot_id,is_preferred_starter")
    .eq("id", assignmentId)
    .eq("user_id", user.id)
    .maybeSingle();
  await db.from("squad_tactical_depth_assignments").delete().eq("id", assignmentId).eq("user_id", user.id);
  if ((assignment as { is_preferred_starter?: boolean } | null)?.is_preferred_starter) {
    await promoteFirstDepthOption(db, user.id, planId, (assignment as { slot_id: string }).slot_id);
  }
  redirectToPlanner(planId);
}

export async function moveDepthAssignment(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const assignmentId = text(formData, "assignmentId");
  const direction = text(formData, "direction") === "down" ? 1 : -1;
  const { data: assignments } = await db
    .from("squad_tactical_depth_assignments")
    .select("*")
    .eq("user_id", user.id)
    .eq("tactical_plan_id", planId)
    .order("depth_order", { ascending: true });
  const current = ((assignments ?? []) as AssignmentRow[]).find((assignment) => assignment.id === assignmentId);
  if (!current) redirectToPlanner(planId);
  const slotAssignments = ((assignments ?? []) as AssignmentRow[]).filter((assignment) => assignment.slot_id === current.slot_id);
  const index = slotAssignments.findIndex((assignment) => assignment.id === assignmentId);
  const swap = slotAssignments[index + direction];
  if (!swap) redirectToPlanner(planId);
  await db.from("squad_tactical_depth_assignments").update({ depth_order: swap.depth_order }).eq("id", current.id).eq("user_id", user.id);
  await db.from("squad_tactical_depth_assignments").update({ depth_order: current.depth_order }).eq("id", swap.id).eq("user_id", user.id);
  redirectToPlanner(planId);
}

export async function setPreferredStarter(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const assignmentId = text(formData, "assignmentId");
  const { data: assignment } = await db
    .from("squad_tactical_depth_assignments")
    .select("slot_id,player_id")
    .eq("id", assignmentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!assignment) redirectToPlanner(planId);
  const row = assignment as { slot_id: string; player_id: string };
  const { data: slotAssignments } = await db
    .from("squad_tactical_depth_assignments")
    .select("id,depth_order")
    .eq("user_id", user.id)
    .eq("tactical_plan_id", planId)
    .eq("slot_id", row.slot_id)
    .order("depth_order", { ascending: true });
  const ordered = ((slotAssignments ?? []) as Array<{ id: string; depth_order: number }>)
    .filter((item) => item.id !== assignmentId);
  await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId).eq("slot_id", row.slot_id);
  await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId).eq("player_id", row.player_id);
  await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: true, depth_order: 1 }).eq("id", assignmentId).eq("user_id", user.id);
  await Promise.all(ordered.map((item, index) => (
    db.from("squad_tactical_depth_assignments").update({ depth_order: index + 2 }).eq("id", item.id).eq("user_id", user.id)
  )));
  redirectToPlanner(planId);
}

export async function updatePlayerPlanState(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const playerId = text(formData, "playerId");
  const inclusionStatus = text(formData, "inclusionStatus") === "excluded" ? "excluded" : "included";
  const tacticalStatus = normalizeTacticalPlayerStatus(text(formData, "tacticalStatus")) ?? null;
  const exclusionReason = text(formData, "exclusionReason") || null;
  const note = text(formData, "note") || null;

  await db.from("squad_tactical_plan_player_states").upsert({
    user_id: user.id,
    tactical_plan_id: planId,
    player_id: playerId,
    inclusion_status: inclusionStatus,
    tactical_status: tacticalStatus,
    exclusion_reason: inclusionStatus === "excluded" ? exclusionReason : null,
    note
  }, { onConflict: "tactical_plan_id,player_id" });

  if (inclusionStatus === "excluded") {
    await db.from("squad_tactical_depth_assignments").delete().eq("user_id", user.id).eq("tactical_plan_id", planId).eq("player_id", playerId);
  }

  redirectToPlanner(planId);
}

export async function autoFillStartingXi(formData: FormData) {
  return autoFillTacticalPlan(formData);
}

export async function autoFillTacticalPlan(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const mode = parseAutoFillMode(text(formData, "mode"));
  const eligibility = parseAutoFillEligibility(text(formData, "eligibility"));
  const includeTrials = formData.get("includeTrials") === "on";
  const allowOutOfPosition = formData.get("allowOutOfPosition") === "on";
  const plan = await getOwnedPlan(db, user.id, planId);
  if (!plan) redirectToPlanner();

  const [slotsResult, playersResult, statesResult, assignmentsResult] = await Promise.all([
    db.from("squad_tactical_plan_slots").select("*").eq("user_id", user.id).eq("tactical_plan_id", planId).order("sort_order", { ascending: true }),
    db.from("squad_players").select("*").eq("user_id", user.id).eq("squad_id", plan.squad_id).is("archived_at", null).is("deleted_at", null).order("last_name", { ascending: true, nullsFirst: false }).order("first_name", { ascending: true }),
    db.from("squad_tactical_plan_player_states").select("player_id,inclusion_status,tactical_status").eq("user_id", user.id).eq("tactical_plan_id", planId),
    db.from("squad_tactical_depth_assignments").select("*").eq("user_id", user.id).eq("tactical_plan_id", planId).order("depth_order", { ascending: true })
  ]);
  if (slotsResult.error) throw new Error(slotsResult.error.message);
  if (playersResult.error) throw new Error(playersResult.error.message);
  if (statesResult.error) throw new Error(statesResult.error.message);
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);

  const slots = ((slotsResult.data ?? []) as SlotRow[]).map(mapTacticalSlotRow);
  const states = (statesResult.data ?? []) as PlayerStateActionRow[];
  const stateByPlayer = new Map(states.map((state) => [state.player_id, state]));
  const excludedPlayerIds = new Set(states.filter((state) => state.inclusion_status === "excluded").map((state) => state.player_id));
  const players = ((playersResult.data ?? []) as SquadPlayerRow[])
    .map(mapSquadPlayerRow)
    .filter((player) => !excludedPlayerIds.has(player.id))
    .filter((player) => includeTrials || player.playerType !== "trial");

  if (slots.length === 0 || players.length === 0) redirectToPlanner(planId);

  let assignments = ((assignmentsResult.data ?? []) as AssignmentRow[]).filter((assignment) => !excludedPlayerIds.has(assignment.player_id));
  if (mode === "rebuild_all") {
    await db.from("squad_tactical_depth_assignments").delete().eq("user_id", user.id).eq("tactical_plan_id", planId);
    assignments = [];
  } else if (mode === "rebuild_xi") {
    await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId);
    assignments = assignments.map((assignment) => ({ ...assignment, is_preferred_starter: false }));
  }

  const generatedRows: Array<{
    user_id: string;
    tactical_plan_id: string;
    slot_id: string;
    player_id: string;
    depth_order: number;
    is_preferred_starter: boolean;
    fit_type: TacticalFitType;
  }> = [];
  const orderedSlots = sortSlotsByScarcity(slots, players, stateByPlayer, eligibility, allowOutOfPosition);
  const preservedStarters = mode === "rebuild_all" || mode === "rebuild_xi" ? [] : assignments.filter((assignment) => assignment.is_preferred_starter);
  const usedStarterPlayerIds = new Set(preservedStarters.map((assignment) => assignment.player_id));
  const slotHasStarter = new Set(preservedStarters.map((assignment) => assignment.slot_id));
  const existingAssignmentKey = new Set(assignments.map((assignment) => assignmentKey(assignment.slot_id, assignment.player_id)));
  const nextDepthOrderBySlot = new Map<string, number>();

  for (const slot of orderedSlots) {
    const maxDepth = Math.max(0, ...assignments.filter((assignment) => assignment.slot_id === slot.id).map((assignment) => assignment.depth_order));
    nextDepthOrderBySlot.set(slot.id, maxDepth + 1);
  }

  const starterPicks = chooseStarterAssignments(
    orderedSlots.filter((slot) => !slotHasStarter.has(slot.id)),
    players,
    stateByPlayer,
    usedStarterPlayerIds,
    eligibility,
    allowOutOfPosition
  );

  for (const pick of starterPicks) {
    const { slot, player: candidate } = pick;
    const existingAssignment = assignments.find((assignment) => assignment.slot_id === slot.id && assignment.player_id === candidate.id);
    await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId).eq("slot_id", slot.id);
    await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId).eq("player_id", candidate.id);
    if (existingAssignment) {
      await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: true, fit_type: pick.fitType }).eq("id", existingAssignment.id).eq("user_id", user.id);
    } else {
      const depthOrder = nextDepthOrderBySlot.get(slot.id) ?? 1;
      generatedRows.push({
        user_id: user.id,
        tactical_plan_id: planId,
        slot_id: slot.id,
        player_id: candidate.id,
        depth_order: depthOrder,
        is_preferred_starter: true,
        fit_type: pick.fitType
      });
      nextDepthOrderBySlot.set(slot.id, depthOrder + 1);
      existingAssignmentKey.add(assignmentKey(slot.id, candidate.id));
    }
    usedStarterPlayerIds.add(candidate.id);
  }

  if (mode === "xi_depth" || mode === "xi_all_depth" || mode === "rebuild_all") {
    const virtualAssignments: AssignmentRow[] = [
      ...assignments,
      ...generatedRows.map((row) => ({
        id: "",
        user_id: row.user_id,
        tactical_plan_id: row.tactical_plan_id,
        slot_id: row.slot_id,
        player_id: row.player_id,
        depth_order: row.depth_order,
        is_preferred_starter: row.is_preferred_starter,
        fit_type: row.fit_type
      }))
    ];
    for (const slot of orderedSlots) {
      const assignedInSlot = new Set(virtualAssignments.filter((assignment) => assignment.slot_id === slot.id).map((assignment) => assignment.player_id));
      if (mode === "xi_depth" && assignedInSlot.size >= 2) continue;
      const disallowed = new Set(assignedInSlot);
      const candidates = mode === "xi_depth"
        ? choosePlayersForSlot(players, slot, stateByPlayer, disallowed, eligibility, allowOutOfPosition).slice(0, 1)
        : choosePlayersForSlot(players, slot, stateByPlayer, disallowed, eligibility, allowOutOfPosition);
      for (const backup of candidates) {
        if (existingAssignmentKey.has(assignmentKey(slot.id, backup.player.id))) continue;
        const depthOrder = nextDepthOrderBySlot.get(slot.id) ?? 1;
        generatedRows.push({
          user_id: user.id,
          tactical_plan_id: planId,
          slot_id: slot.id,
          player_id: backup.player.id,
          depth_order: depthOrder,
          is_preferred_starter: false,
          fit_type: backup.fitType
        });
        nextDepthOrderBySlot.set(slot.id, depthOrder + 1);
        existingAssignmentKey.add(assignmentKey(slot.id, backup.player.id));
      }
    }
  }

  if (generatedRows.length > 0) {
    const { error } = await db.from("squad_tactical_depth_assignments").insert(generatedRows);
    if (error) throw new Error(error.message);
  }

  redirectToPlanner(planId);
}

function parseAutoFillMode(value: string): AutoFillMode {
  if (value === "xi_depth" || value === "xi_all_depth" || value === "rebuild_xi" || value === "rebuild_all") return value;
  return "empty_xi";
}

function parseAutoFillEligibility(value: string): AutoFillEligibility {
  if (value === "natural") return "natural";
  if (value === "natural_secondary_compatible") return "natural_secondary_compatible";
  return "natural_secondary";
}

function assignmentKey(slotId: string, playerId: string) {
  return `${slotId}:${playerId}`;
}

type StarterPick = {
  slot: TacticalPlanSlot;
  player: SquadPlayer;
  fitType: TacticalFitType;
  score: number;
};

type MatchingResult = {
  filled: number;
  score: number;
  picks: StarterPick[];
};

function chooseStarterAssignments(
  slots: TacticalPlanSlot[],
  players: SquadPlayer[],
  stateByPlayer: Map<string, PlayerStateActionRow>,
  disallowedPlayerIds: Set<string>,
  eligibility: AutoFillEligibility,
  allowOutOfPosition: boolean
) {
  const candidatesBySlot = new Map<string, StarterPick[]>();
  for (const slot of slots) {
    const candidates = players
      .filter((player) => !disallowedPlayerIds.has(player.id))
      .map((player) => {
          const score = scorePlayerForSlot(player, slot, stateByPlayer.get(player.id), eligibility, allowOutOfPosition);
          return { slot, player, score, fitType: evaluatePlayerSlotFit(player, slot, allowOutOfPosition).fitType };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || `${a.player.lastName ?? ""} ${a.player.firstName}`.localeCompare(`${b.player.lastName ?? ""} ${b.player.firstName}`));
    candidatesBySlot.set(slot.id, keepOutOfPositionAsLastFallback(candidates));
  }
  const orderedSlots = [...slots].sort((a, b) => (candidatesBySlot.get(a.id)?.length ?? 0) - (candidatesBySlot.get(b.id)?.length ?? 0) || a.sortOrder - b.sortOrder);
  const memo = new Map<string, MatchingResult>();

  function better(a: MatchingResult, b: MatchingResult) {
    if (a.filled !== b.filled) return a.filled > b.filled ? a : b;
    if (a.score !== b.score) return a.score > b.score ? a : b;
    return a.picks.length <= b.picks.length ? a : b;
  }

  function solve(index: number, usedPlayerIds: Set<string>): MatchingResult {
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
  }

  return solve(0, new Set(disallowedPlayerIds)).picks.sort((a, b) => a.slot.sortOrder - b.slot.sortOrder);
}

function sortSlotsByScarcity(slots: TacticalPlanSlot[], players: SquadPlayer[], stateByPlayer: Map<string, PlayerStateActionRow>, eligibility: AutoFillEligibility, allowOutOfPosition: boolean) {
  return [...slots].sort((a, b) => {
    const aCandidates = players.filter((player) => scorePlayerForSlot(player, a, stateByPlayer.get(player.id), eligibility, allowOutOfPosition) > 0).length;
    const bCandidates = players.filter((player) => scorePlayerForSlot(player, b, stateByPlayer.get(player.id), eligibility, allowOutOfPosition) > 0).length;
    return aCandidates - bCandidates || a.sortOrder - b.sortOrder;
  });
}

function choosePlayersForSlot(players: SquadPlayer[], slot: TacticalPlanSlot, stateByPlayer: Map<string, PlayerStateActionRow>, disallowedPlayerIds: Set<string>, eligibility: AutoFillEligibility, allowOutOfPosition: boolean) {
  const candidates = [...players]
    .filter((player) => !disallowedPlayerIds.has(player.id))
    .map((player) => {
      const fit = evaluatePlayerSlotFit(player, slot, allowOutOfPosition);
      return { player, fitType: fit.fitType, score: scorePlayerForSlot(player, slot, stateByPlayer.get(player.id), eligibility, allowOutOfPosition) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || `${a.player.lastName ?? ""} ${a.player.firstName}`.localeCompare(`${b.player.lastName ?? ""} ${b.player.firstName}`));
  return keepOutOfPositionAsLastFallback(candidates);
}

function keepOutOfPositionAsLastFallback<T extends { fitType: TacticalFitType }>(candidates: T[]) {
  const positioned = candidates.filter((candidate) => candidate.fitType !== "out_of_position");
  return positioned.length > 0 ? positioned : candidates;
}

function scorePlayerForSlot(player: SquadPlayer, slot: TacticalPlanSlot, state: PlayerStateActionRow | undefined, eligibility: AutoFillEligibility, allowOutOfPosition: boolean) {
  const fit = evaluatePlayerSlotFit(player, slot, allowOutOfPosition);
  if (!fit.eligible || !isFitAllowedByAutoFillEligibility(fit.fitType, eligibility, allowOutOfPosition)) return 0;
  return fit.baseScore + tacticalRoleScore(state?.tactical_status) * 2;
}

export async function clearStartingXi(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId);
  redirectToPlanner(planId);
}

async function promoteFirstDepthOption(db: SupabaseClient, userId: string, planId: string, slotId: string) {
  const { data } = await db
    .from("squad_tactical_depth_assignments")
    .select("id")
    .eq("user_id", userId)
    .eq("tactical_plan_id", planId)
    .eq("slot_id", slotId)
    .order("depth_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data) {
    await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: true }).eq("id", data.id).eq("user_id", userId);
  }
}
