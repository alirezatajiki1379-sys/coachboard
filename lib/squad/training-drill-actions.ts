"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseDrillForm } from "@/lib/drills/form";
import { upsertDrillGraphic } from "@/lib/drills/graphics";
import type { DrillActionState } from "@/lib/drills/actions";

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

function safeReturnTo(formData: FormData, eventId: string) {
  const returnTo = formString(formData, "returnTo");
  return returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : `/trainings/${eventId}`;
}

export async function createSessionOnlyTrainingDrill(_: DrillActionState, formData: FormData): Promise<DrillActionState> {
  const eventId = formString(formData, "trainingEventId");
  if (!eventId) return { error: "Missing Training context.", submissionId: Date.now() };
  const parsed = parseDrillForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error, fieldErrors: parsed.fieldErrors, values: parsed.values, submissionId: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const event = await getOwnedEvent(db, user.id, eventId);
  if (!event) return { error: "Training not found.", submissionId: Date.now() };
  const planInstanceId = await ensurePlanInstance(db, user.id, eventId, event.label || `Training plan ${event.date}`);
  const orderIndex = await nextDrillOrder(db, user.id, eventId);
  const { error } = await db.from("training_session_drill_instances").insert({
    user_id: user.id,
    event_id: eventId,
    plan_instance_id: planInstanceId,
    source_training_session_drill_id: null,
    source_drill_id: null,
    source_drill_updated_at: null,
    title: parsed.data.title,
    block: parsed.data.training_blocks?.[0] ?? null,
    order_index: orderIndex,
    planned_duration_minutes: parsed.data.duration_minutes,
    snapshot_json: {
      source: "session_only",
      drill: parsed.data,
      graphic: parsed.graphic
    }
  });
  if (error) return { error: error.message, submissionId: Date.now() };
  revalidateTraining(eventId);
  redirect(safeReturnTo(formData, eventId));
}

export async function createReusableTrainingDrill(_: DrillActionState, formData: FormData): Promise<DrillActionState> {
  const eventId = formString(formData, "trainingEventId");
  if (!eventId) return { error: "Missing Training context.", submissionId: Date.now() };
  const parsed = parseDrillForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error, fieldErrors: parsed.fieldErrors, values: parsed.values, submissionId: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const event = await getOwnedEvent(db, user.id, eventId);
  if (!event) return { error: "Training not found.", submissionId: Date.now() };

  const { data: drill, error: drillError } = await db
    .from("drills")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id,updated_at")
    .single();
  if (drillError) return { error: drillError.message, submissionId: Date.now() };
  try {
    await upsertDrillGraphic(supabase, user.id, drill.id, parsed.graphic);
  } catch (graphicError) {
    return {
      error: graphicError instanceof Error ? graphicError.message : "The drill was created, but its graphic could not be saved.",
      submissionId: Date.now()
    };
  }

  const planInstanceId = await ensurePlanInstance(db, user.id, eventId, event.label || `Training plan ${event.date}`);
  const orderIndex = await nextDrillOrder(db, user.id, eventId);
  const { error: instanceError } = await db.from("training_session_drill_instances").insert({
    user_id: user.id,
    event_id: eventId,
    plan_instance_id: planInstanceId,
    source_training_session_drill_id: null,
    source_drill_id: drill.id,
    source_drill_updated_at: drill.updated_at,
    title: parsed.data.title,
    block: parsed.data.training_blocks?.[0] ?? null,
    order_index: orderIndex,
    planned_duration_minutes: parsed.data.duration_minutes,
    snapshot_json: {
      source: "reusable_drill",
      sourceDrillId: drill.id,
      drill: parsed.data,
      graphic: parsed.graphic
    }
  });
  if (instanceError) return { error: instanceError.message, submissionId: Date.now() };
  revalidatePath("/drills");
  revalidateTraining(eventId);
  redirect(safeReturnTo(formData, eventId));
}

async function getOwnedEvent(db: SupabaseClient, userId: string, eventId: string) {
  const { data, error } = await db
    .from("squad_training_events")
    .select("id,label,date,squad_id")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; label: string | null; date: string; squad_id: string | null } | null;
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
      snapshot_json: { source: "training_direct_creation" }
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
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

function revalidateTraining(eventId: string) {
  revalidatePath("/trainings");
  revalidatePath(`/trainings/${eventId}`);
  revalidatePath(`/squad/attendance/${eventId}`);
}
