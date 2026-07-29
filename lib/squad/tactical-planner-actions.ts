"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { createSlotRowsForPlan, getPlayerFitForSlot, mapTacticalSlotRow, type TacticalPlanSlot } from "@/lib/squad/tactical-planner";
import { getTacticalFormation } from "@/lib/squad/tactical-formations";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";

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
  await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId).eq("slot_id", row.slot_id);
  await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId).eq("player_id", row.player_id);
  await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: true }).eq("id", assignmentId).eq("user_id", user.id);
  redirectToPlanner(planId);
}

export async function updatePlayerPlanState(formData: FormData) {
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const playerId = text(formData, "playerId");
  const inclusionStatus = text(formData, "inclusionStatus") === "excluded" ? "excluded" : "included";
  const tacticalStatus = text(formData, "tacticalStatus") || null;
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
  const { db, user } = await requireUser();
  const planId = text(formData, "planId");
  const { data: assignments } = await db
    .from("squad_tactical_depth_assignments")
    .select("*")
    .eq("user_id", user.id)
    .eq("tactical_plan_id", planId)
    .order("depth_order", { ascending: true });
  await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: false }).eq("user_id", user.id).eq("tactical_plan_id", planId);
  const usedPlayers = new Set<string>();
  const chosen: AssignmentRow[] = [];
  for (const assignment of (assignments ?? []) as AssignmentRow[]) {
    if (usedPlayers.has(assignment.player_id) || chosen.some((item) => item.slot_id === assignment.slot_id)) continue;
    chosen.push(assignment);
    usedPlayers.add(assignment.player_id);
  }
  for (const assignment of chosen.slice(0, 11)) {
    await db.from("squad_tactical_depth_assignments").update({ is_preferred_starter: true }).eq("id", assignment.id).eq("user_id", user.id);
  }
  redirectToPlanner(planId);
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
