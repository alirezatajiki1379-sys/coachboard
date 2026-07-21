"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formStrings(formData: FormData, key: string) {
  return Array.from(new Set(formData.getAll(key).filter((value): value is string => typeof value === "string" && Boolean(value))));
}

export async function createBlankSessionPlan(formData: FormData) {
  const eventId = formString(formData, "eventId");
  if (!eventId) redirect("/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const event = await getOwnedEvent(db, user.id, eventId);
  if (!event) throw new Error("Training not found.");
  await ensurePlanInstance(db, user.id, eventId, event.label || `Training plan ${event.date}`);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}/plan`);
}

export async function applyTrainingPlanTemplate(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const templateId = formString(formData, "templateId");
  if (!eventId || !templateId) redirect(eventId ? `/trainings/${eventId}` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const event = await getOwnedEvent(db, user.id, eventId);
  if (!event) throw new Error("Training not found.");
  await copyTrainingSessionTemplate(db, user.id, eventId, templateId);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}/plan`);
}

export async function addExistingDrillsToSessionPlan(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const phase = formString(formData, "phase") || "Main Part";
  const drillIds = formStrings(formData, "drillIds");
  if (!eventId || !drillIds.length) redirect(eventId ? `/trainings/${eventId}/plan` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const event = await getOwnedEvent(db, user.id, eventId);
  if (!event) throw new Error("Training not found.");
  const planId = await ensurePlanInstance(db, user.id, eventId, event.label || `Training plan ${event.date}`);
  const { data, error } = await db
    .from("drills")
    .select("*, drill_graphics(canvas_json)")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .is("deleted_at", null)
    .in("id", drillIds);
  if (error) throw new Error(error.message);
  const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
  const orderedDrills = drillIds.map((id) => byId.get(id)).filter(Boolean);
  if (!orderedDrills.length) redirect(`/trainings/${eventId}/plan`);
  const startOrder = await nextDrillOrder(db, user.id, eventId);
  const rows = orderedDrills.map((drill, index) => {
    const graphics = Array.isArray(drill.drill_graphics) ? drill.drill_graphics[0]?.canvas_json : drill.drill_graphics?.canvas_json;
    return {
      user_id: user.id,
      event_id: eventId,
      plan_instance_id: planId,
      source_training_session_drill_id: null,
      source_drill_id: drill.id,
      source_drill_updated_at: drill.updated_at,
      title: drill.title,
      block: phase,
      order_index: startOrder + index,
      planned_duration_minutes: drill.duration_minutes,
      snapshot_json: {
        source: "drill_library",
        sourceDrill: {
          title: drill.title,
          shortDescription: drill.short_description,
          organization: drill.organization,
          coachingPoints: drill.coaching_points,
          variations: drill.variations,
          easierVersion: drill.easier_version,
          harderVersion: drill.harder_version,
          durationMinutes: drill.duration_minutes,
          minPlayers: drill.min_players,
          maxPlayers: drill.max_players,
          materials: drill.materials,
          graphic: graphics
        }
      }
    };
  });
  const { error: insertError } = await db.from("training_session_drill_instances").insert(rows);
  if (insertError) throw new Error(insertError.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}/plan`);
}

export async function updateSessionPlanDrill(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const drillInstanceId = formString(formData, "drillInstanceId");
  const phase = formString(formData, "phase") || "Main Part";
  const duration = Number.parseInt(formString(formData, "plannedDurationMinutes"), 10);
  if (!eventId || !drillInstanceId) redirect(eventId ? `/trainings/${eventId}/plan` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedPlanDrill(db, user.id, eventId, drillInstanceId);
  const { error } = await db
    .from("training_session_drill_instances")
    .update({
      block: phase,
      planned_duration_minutes: Number.isFinite(duration) ? Math.max(0, duration) : null
    })
    .eq("id", drillInstanceId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}/plan`);
}

export async function moveSessionPlanDrill(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const drillInstanceId = formString(formData, "drillInstanceId");
  const direction = formString(formData, "direction");
  if (!eventId || !drillInstanceId || (direction !== "up" && direction !== "down")) redirect(eventId ? `/trainings/${eventId}/plan` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedPlanDrill(db, user.id, eventId, drillInstanceId);
  const drills = await listPlanDrillOrder(db, user.id, eventId);
  const index = drills.findIndex((drill) => drill.id === drillInstanceId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= drills.length) redirect(`/trainings/${eventId}/plan`);
  const current = drills[index];
  const target = drills[swapIndex];
  const { error: currentError } = await db
    .from("training_session_drill_instances")
    .update({ order_index: target.order_index })
    .eq("id", current.id)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (currentError) throw new Error(currentError.message);
  const { error: targetError } = await db
    .from("training_session_drill_instances")
    .update({ order_index: current.order_index })
    .eq("id", target.id)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (targetError) throw new Error(targetError.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}/plan`);
}

export async function removeSessionPlanDrill(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const drillInstanceId = formString(formData, "drillInstanceId");
  if (!eventId || !drillInstanceId) redirect(eventId ? `/trainings/${eventId}/plan` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await assertOwnedPlanDrill(db, user.id, eventId, drillInstanceId);
  const { error } = await db.from("training_session_drill_instances").delete().eq("id", drillInstanceId).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}/plan`);
}

async function getOwnedEvent(db: SupabaseClient, userId: string, eventId: string) {
  const { data, error } = await db
    .from("squad_training_events")
    .select("id,label,date")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; label: string | null; date: string } | null;
}

async function ensurePlanInstance(db: SupabaseClient, userId: string, eventId: string, title: string) {
  const { data: existing, error: existingError } = await db
    .from("training_session_plan_instances")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;
  const { data, error } = await db
    .from("training_session_plan_instances")
    .insert({
      user_id: userId,
      event_id: eventId,
      source_training_session_id: null,
      title,
      snapshot_json: { source: "blank_session_plan" }
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function copyTrainingSessionTemplate(db: SupabaseClient, userId: string, eventId: string, sourceTrainingSessionId: string) {
  const { data: sourcePlan, error: sourcePlanError } = await db
    .from("training_sessions")
    .select("*")
    .eq("id", sourceTrainingSessionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (sourcePlanError) throw new Error(sourcePlanError.message);
  if (!sourcePlan) throw new Error("Training Plan Template not found.");

  await db.from("training_session_drill_instances").delete().eq("event_id", eventId).eq("user_id", userId);
  await db.from("training_session_plan_instances").delete().eq("event_id", eventId).eq("user_id", userId);

  const { data: planInstance, error: planInstanceError } = await db
    .from("training_session_plan_instances")
    .insert({
      user_id: userId,
      event_id: eventId,
      source_training_session_id: sourceTrainingSessionId,
      source_updated_at: sourcePlan.updated_at,
      title: sourcePlan.title,
      snapshot_json: {
        source: "training_plan_template",
        title: sourcePlan.title,
        mainFocus: sourcePlan.main_focus,
        secondaryFocus: sourcePlan.secondary_focus,
        targetDurationMinutes: sourcePlan.duration_target_minutes,
        location: sourcePlan.location,
        notes: sourcePlan.notes
      }
    })
    .select("id")
    .single();
  if (planInstanceError) throw new Error(planInstanceError.message);

  const { data: sourceDrills, error: sourceDrillsError } = await db
    .from("training_session_drills")
    .select("*, drills(*, drill_graphics(canvas_json))")
    .eq("session_id", sourceTrainingSessionId)
    .eq("user_id", userId)
    .order("order_index", { ascending: true });
  if (sourceDrillsError) throw new Error(sourceDrillsError.message);

  const rows = ((sourceDrills ?? []) as Array<{
    id: string;
    drill_id: string;
    block: string;
    order_index: number;
    planned_duration_minutes: number;
    drills?: Record<string, unknown> & { drill_graphics?: Array<{ canvas_json: unknown }> | { canvas_json: unknown } | null };
  }>).map((row) => {
    const drill = row.drills;
    const graphics = Array.isArray(drill?.drill_graphics) ? drill?.drill_graphics[0]?.canvas_json : drill?.drill_graphics?.canvas_json;
    return {
      user_id: userId,
      event_id: eventId,
      plan_instance_id: planInstance.id,
      source_training_session_drill_id: row.id,
      source_drill_id: row.drill_id,
      source_drill_updated_at: typeof drill?.updated_at === "string" ? drill.updated_at : null,
      title: typeof drill?.title === "string" ? drill.title : "Session drill",
      block: row.block,
      order_index: row.order_index,
      planned_duration_minutes: row.planned_duration_minutes,
      snapshot_json: {
        source: "training_plan_template",
        sourceDrill: drill ? { ...drill, drill_graphics: undefined, graphic: graphics } : null
      }
    };
  });
  if (rows.length) {
    const { error } = await db.from("training_session_drill_instances").insert(rows);
    if (error) throw new Error(error.message);
  }
}

async function assertOwnedPlanDrill(db: SupabaseClient, userId: string, eventId: string, drillInstanceId: string) {
  const { data, error } = await db
    .from("training_session_drill_instances")
    .select("id")
    .eq("id", drillInstanceId)
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Session Plan Drill not found.");
}

async function nextDrillOrder(db: SupabaseClient, userId: string, eventId: string) {
  const { count, error } = await db
    .from("training_session_drill_instances")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function listPlanDrillOrder(db: SupabaseClient, userId: string, eventId: string) {
  const { data, error } = await db
    .from("training_session_drill_instances")
    .select("id,title,order_index")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; title: string; order_index: number }>;
}

function revalidateTraining(eventId: string) {
  revalidatePath("/trainings");
  revalidatePath(`/trainings/${eventId}`);
  revalidatePath(`/trainings/${eventId}/plan`);
  revalidatePath(`/squad/attendance/${eventId}`);
}
