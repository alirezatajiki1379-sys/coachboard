"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { copyDrillImageForSnapshot, deleteDrillImageAssets } from "@/lib/drills/graphics";
import type { SessionActionState } from "@/lib/sessions/actions";
import type { SessionFormDrill, SessionFormValues, SessionPlanSection } from "@/lib/sessions/utils";
import type { Json } from "@/types/database";

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
  const planId = await ensurePlanInstance(db, user.id, eventId, event.label || `Training plan ${event.date}`);
  await ensureInitialSection(db, user.id, event, planId);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}/plan`);
}

export async function updateConcreteSessionPlan(_: SessionActionState, formData: FormData): Promise<SessionActionState> {
  const eventId = formString(formData, "eventId");
  let values: SessionFormValues;
  try {
    values = JSON.parse(formString(formData, "sessionPayload")) as SessionFormValues;
  } catch {
    return { error: "Could not read the Session Plan. Please try again.", submissionId: Date.now() };
  }
  if (!eventId) return { error: "Missing Training id.", values, submissionId: Date.now() };
  if (!values.title?.trim()) {
    return {
      error: "Please give this Session Plan a title. Your work is still here.",
      fieldErrors: { title: "Add a clear Session Plan title." },
      values,
      submissionId: Date.now()
    };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const event = await getOwnedEvent(db, user.id, eventId);
  if (!event?.squad_id) return { error: "This Training is not assigned to a Team.", values, submissionId: Date.now() };

  const copiedImagePaths: string[] = [];
  try {
    const planId = await ensurePlanInstance(db, user.id, eventId, values.title.trim());
    const sections = normalizeSections(values.sections ?? [], values.drills);
    const sectionRows = sections.map((section, orderIndex) => ({
      id: section.id,
      user_id: user.id,
      squad_id: event.squad_id,
      event_id: eventId,
      plan_instance_id: planId,
      section_key: section.key,
      title: section.title.trim() || `Section ${orderIndex + 1}`,
      order_index: orderIndex,
      duration_minutes: Math.max(0, Math.min(600, section.durationMinutes || 0)),
      section_notes: nullable(section.notes),
      ...responsibilityColumns(section.responsibilityMode, section.staffId),
      planning_status: section.planningStatus === "ready" ? "ready" : "needs_planning",
      instruction: nullable(section.instruction),
      briefing_text: nullable(section.briefingText)
    }));

    if (sectionRows.length) {
      const { error } = await db.from("training_section_briefs").upsert(sectionRows, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }

    const sectionIds = sectionRows.map((section) => section.id);
    let staleSections = db.from("training_section_briefs").delete().eq("user_id", user.id).eq("event_id", eventId);
    if (sectionIds.length) staleSections = staleSections.not("id", "in", `(${sectionIds.join(",")})`);
    const { error: sectionDeleteError } = await staleSections;
    if (sectionDeleteError) throw new Error(sectionDeleteError.message);

    const { data: currentRows, error: currentError } = await db
      .from("training_session_drill_instances")
      .select("id,snapshot_json,override_json,source_drill_id,source_drill_updated_at")
      .eq("user_id", user.id)
      .eq("event_id", eventId);
    if (currentError) throw new Error(currentError.message);
    const currentById = new Map((currentRows ?? []).map((row) => [row.id as string, row]));
    const missingSourceIds = Array.from(new Set(values.drills.filter((item) => !currentById.has(item.id)).map((item) => item.drillId)));
    const libraryById = await loadLibraryRows(db, user.id, missingSourceIds);
    const sectionByKey = new Map(sectionRows.map((section) => [section.section_key, section]));

    const drillRows = await Promise.all(values.drills.map(async (item, orderIndex) => {
      const existing = currentById.get(item.id);
      const library = libraryById.get(item.drillId);
      if (!existing && !library) throw new Error("A selected Drill is no longer available.");
      let snapshot = existing?.snapshot_json as Json | undefined;
      if (!snapshot && library) {
        const graphic = firstDrillGraphic(library.drill_graphics);
        const imagePath = await copyDrillImageForSnapshot(db, user.id, library.id, graphic?.uploaded_image_path);
        if (imagePath) copiedImagePaths.push(imagePath);
        snapshot = sourceSnapshot(library, graphic, imagePath);
      }
      const section = sectionByKey.get(item.block) ?? sectionRows[0];
      if (!section) throw new Error("Add at least one Training section before saving Drills.");
      const sourceTitle = library?.title ?? sourceTitleFromSnapshot(snapshot) ?? "Session Drill";
      const title = item.titleOverride?.trim() || sourceTitle;
      return {
        id: item.id,
        user_id: user.id,
        event_id: eventId,
        plan_instance_id: planId,
        section_id: section.id,
        source_training_session_drill_id: null,
        source_drill_id: existing?.source_drill_id ?? library?.id ?? item.drillId,
        source_drill_updated_at: existing?.source_drill_updated_at ?? library?.updated_at ?? null,
        title,
        block: section.title,
        order_index: orderIndex,
        planned_duration_minutes: Math.max(1, item.plannedDurationMinutes || 1),
        status: "ready",
        snapshot_json: snapshot ?? {},
        override_json: drillOverride(item, sourceTitle, existing?.override_json as Json | undefined),
        ...drillResponsibilityColumns(item),
        planning_status: item.planningStatus ?? null,
        planning_instruction: nullable(item.planningInstruction)
      };
    }));

    if (drillRows.length) {
      const { error } = await db.from("training_session_drill_instances").upsert(drillRows, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    const drillIds = drillRows.map((row) => row.id);
    let staleDrills = db.from("training_session_drill_instances").delete().eq("user_id", user.id).eq("event_id", eventId);
    if (drillIds.length) staleDrills = staleDrills.not("id", "in", `(${drillIds.join(",")})`);
    const { error: drillDeleteError } = await staleDrills;
    if (drillDeleteError) throw new Error(drillDeleteError.message);

    const { error: planError } = await db.from("training_session_plan_instances").update({
      title: values.title.trim(),
      plan_json: {
        title: values.title.trim(),
        sessionDate: values.sessionDate || null,
        startTime: values.startTime || null,
        teamAgeGroup: values.teamAgeGroup || null,
        mainFocus: values.mainFocus || null,
        secondaryFocus: nullable(values.secondaryFocus),
        expectedPlayers: positiveNumber(values.expectedPlayers),
        durationTargetMinutes: positiveNumber(values.durationTargetMinutes),
        location: nullable(values.location),
        notes: nullable(values.notes),
        playerGroups: values.playerGroups
      }
    }).eq("id", planId).eq("user_id", user.id);
    if (planError) throw new Error(planError.message);

    revalidateTraining(eventId);
  } catch (error) {
    await deleteDrillImageAssets(db, copiedImagePaths);
    return { error: error instanceof Error ? error.message : "The Session Plan could not be saved.", values, submissionId: Date.now() };
  }
  redirect(`/trainings/${eventId}`);
}

export async function applyTrainingPlanTemplate(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const templateId = formString(formData, "templateId");
  if (!eventId || !templateId) redirect(eventId ? `/trainings/${eventId}` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const event = await getOwnedEvent(db, user.id, eventId);
  if (!event) throw new Error("Training not found.");
  await copyTrainingSessionTemplate(db, user.id, event, templateId);
  revalidateTraining(eventId);
  redirect(`/trainings/${eventId}/plan`);
}

export async function addSessionPlanStaff(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const name = formString(formData, "name");
  const role = formString(formData, "role") || "Assistant Coach";
  if (!eventId || !name) redirect(eventId ? `/trainings/${eventId}/plan` : "/trainings");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const event = await getOwnedEvent(db, user.id, eventId);
  if (!event?.squad_id) throw new Error("This Training is not assigned to a Team.");
  const { error } = await db.from("squad_staff").insert({ user_id: user.id, squad_id: event.squad_id, name, role, is_active: true });
  if (error) throw new Error(error.message);
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
    .select("*, drill_graphics(canvas_json,visual_source,uploaded_image_path,uploaded_image_mime_type,uploaded_image_size_bytes)")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .is("deleted_at", null)
    .in("id", drillIds);
  if (error) throw new Error(error.message);
  const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
  const orderedDrills = drillIds.map((id) => byId.get(id)).filter(Boolean);
  if (!orderedDrills.length) redirect(`/trainings/${eventId}/plan`);
  const startOrder = await nextDrillOrder(db, user.id, eventId);
  const copiedImagePaths: string[] = [];
  let rows;
  try {
    rows = await Promise.all(orderedDrills.map(async (drill, index) => {
      const graphic = firstDrillGraphic(drill.drill_graphics);
      const imagePath = await copyDrillImageForSnapshot(db, user.id, drill.id, graphic?.uploaded_image_path);
      if (imagePath) copiedImagePaths.push(imagePath);
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
      status: drill.status === "draft" ? "draft" : "ready",
      snapshot_json: {
        source: "drill_library",
        status: drill.status === "draft" ? "draft" : "ready",
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
          graphic: graphic?.canvas_json,
          visual: snapshotVisual(graphic, imagePath)
        }
      }
      };
    }));
  } catch (error) {
    await deleteDrillImageAssets(db, copiedImagePaths);
    throw error;
  }
  const { error: insertError } = await db.from("training_session_drill_instances").insert(rows);
  if (insertError) {
    await deleteDrillImageAssets(db, copiedImagePaths);
    throw new Error(insertError.message);
  }
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
    .select("id,label,date,start_time,end_time,location,focus,squad_id")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    label: string | null;
    date: string;
    start_time: string;
    end_time: string | null;
    location: string | null;
    focus: string | null;
    squad_id: string | null;
  } | null;
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
      snapshot_json: { source: "blank_session_plan" },
      plan_json: {}
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function ensureInitialSection(
  db: SupabaseClient,
  userId: string,
  event: NonNullable<Awaited<ReturnType<typeof getOwnedEvent>>>,
  planId: string
) {
  if (!event.squad_id) throw new Error("This Training is not assigned to a Team.");
  const { count, error: countError } = await db
    .from("training_section_briefs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_id", event.id);
  if (countError) throw new Error(countError.message);
  if (count) return;
  const { error } = await db.from("training_section_briefs").insert({
    user_id: userId,
    squad_id: event.squad_id,
    event_id: event.id,
    plan_instance_id: planId,
    section_key: "main-part",
    title: "Main Part",
    order_index: 0,
    duration_minutes: 0,
    responsibility_mode: "unassigned",
    planning_status: "needs_planning"
  });
  if (error) throw new Error(error.message);
}

async function copyTrainingSessionTemplate(
  db: SupabaseClient,
  userId: string,
  event: NonNullable<Awaited<ReturnType<typeof getOwnedEvent>>>,
  sourceTrainingSessionId: string
) {
  const eventId = event.id;
  if (!event.squad_id) throw new Error("This Training is not assigned to a Team.");
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
      plan_json: {
        title: sourcePlan.title,
        sessionDate: event.date,
        startTime: event.start_time?.slice(0, 5),
        teamAgeGroup: sourcePlan.team_age_group,
        mainFocus: sourcePlan.main_focus,
        secondaryFocus: sourcePlan.secondary_focus,
        expectedPlayers: sourcePlan.expected_players,
        durationTargetMinutes: sourcePlan.duration_target_minutes,
        location: event.location ?? sourcePlan.location,
        notes: sourcePlan.notes,
        playerGroups: sourcePlan.player_groups
      },
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
    .select("*, drills(*, drill_graphics(canvas_json,visual_source,uploaded_image_path,uploaded_image_mime_type,uploaded_image_size_bytes))")
    .eq("session_id", sourceTrainingSessionId)
    .eq("user_id", userId)
    .order("order_index", { ascending: true });
  if (sourceDrillsError) throw new Error(sourceDrillsError.message);

  const typedSourceDrills = (sourceDrills ?? []) as Array<{
    id: string;
    drill_id: string;
    block: string;
    order_index: number;
    planned_duration_minutes: number;
    coach_notes?: string | null;
    timing_mode?: string | null;
    simultaneous_group?: string | null;
    participating_groups?: string[] | null;
    starting_group?: string | null;
    drills?: Record<string, unknown> & { drill_graphics?: NestedDrillGraphic[] | NestedDrillGraphic | null };
  }>;
  const sectionTitles = Array.from(new Set(typedSourceDrills.map((row) => row.block || "Main Part")));
  if (!sectionTitles.length) sectionTitles.push("Main Part");
  const sectionRows = sectionTitles.map((title, orderIndex) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    squad_id: event.squad_id,
    event_id: eventId,
    plan_instance_id: planInstance.id,
    section_key: `section-${crypto.randomUUID()}`,
    title,
    order_index: orderIndex,
    duration_minutes: typedSourceDrills.filter((row) => (row.block || "Main Part") === title).reduce((sum, row) => sum + (row.planned_duration_minutes || 0), 0),
    responsibility_mode: "unassigned",
    planning_status: "ready"
  }));
  const { error: sectionError } = await db.from("training_section_briefs").insert(sectionRows);
  if (sectionError) throw new Error(sectionError.message);
  const sectionByTitle = new Map(sectionRows.map((section) => [section.title, section]));

  const copiedImagePaths: string[] = [];
  let rows;
  try {
    rows = await Promise.all(typedSourceDrills.map(async (row) => {
      const drill = row.drills;
      const graphic = firstDrillGraphic(drill?.drill_graphics);
      const imagePath = await copyDrillImageForSnapshot(db, userId, row.drill_id, graphic?.uploaded_image_path);
      if (imagePath) copiedImagePaths.push(imagePath);
      return {
      user_id: userId,
      event_id: eventId,
      plan_instance_id: planInstance.id,
      section_id: sectionByTitle.get(row.block || "Main Part")?.id,
      source_training_session_drill_id: row.id,
      source_drill_id: row.drill_id,
      source_drill_updated_at: typeof drill?.updated_at === "string" ? drill.updated_at : null,
      title: typeof drill?.title === "string" ? drill.title : "Session drill",
      block: row.block,
      order_index: row.order_index,
      planned_duration_minutes: row.planned_duration_minutes,
      status: "ready",
      snapshot_json: {
        source: "training_plan_template",
        sourceDrill: drill ? { ...drill, drill_graphics: undefined, graphic: graphic?.canvas_json, visual: snapshotVisual(graphic, imagePath) } : null
      },
      override_json: {
        timingMode: row.timing_mode ?? "sequential",
        simultaneousGroup: row.simultaneous_group,
        participatingGroups: row.participating_groups,
        startingGroup: row.starting_group,
        coachNotes: row.coach_notes
      }
      };
    }));
  } catch (error) {
    await deleteDrillImageAssets(db, copiedImagePaths);
    throw error;
  }
  if (rows.length) {
    const { error } = await db.from("training_session_drill_instances").insert(rows);
    if (error) {
      await deleteDrillImageAssets(db, copiedImagePaths);
      throw new Error(error.message);
    }
  }
}

function nullable(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function positiveNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeSections(sections: SessionPlanSection[], drills: SessionFormDrill[]) {
  const normalized = sections
    .filter((section) => section && section.id && section.key)
    .map((section, orderIndex) => ({ ...section, orderIndex }));
  if (normalized.length) return normalized;
  const names = Array.from(new Set(drills.map((drill) => drill.block).filter(Boolean)));
  return (names.length ? names : ["Main Part"]).map((title, orderIndex) => ({
    id: crypto.randomUUID(),
    key: `section-${crypto.randomUUID()}`,
    title,
    orderIndex,
    durationMinutes: drills.filter((drill) => drill.block === title).reduce((sum, drill) => sum + drill.plannedDurationMinutes, 0),
    notes: "",
    responsibilityMode: "unassigned" as const,
    staffId: "",
    planningStatus: "needs_planning" as const,
    instruction: "",
    briefingText: ""
  }));
}

function responsibilityColumns(mode: SessionPlanSection["responsibilityMode"], staffId: string) {
  const staffMode = mode === "staff" || mode === "together";
  if (staffMode && !staffId) return { responsibility_mode: "unassigned", staff_id: null };
  return { responsibility_mode: mode, staff_id: staffMode ? staffId : null };
}

function drillResponsibilityColumns(item: SessionFormDrill) {
  const mode = item.responsibilityMode;
  if (!mode) return { responsibility_mode: null, responsible_staff_id: null };
  const staffMode = mode === "staff" || mode === "together";
  if (staffMode && !item.responsibleStaffId) return { responsibility_mode: null, responsible_staff_id: null };
  return { responsibility_mode: mode, responsible_staff_id: staffMode ? item.responsibleStaffId : null };
}

function drillOverride(item: SessionFormDrill, sourceTitle: string, existing?: Json): Json {
  const current = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return {
    ...current,
    title: item.titleOverride?.trim() && item.titleOverride.trim() !== sourceTitle ? item.titleOverride.trim() : null,
    description: nullable(item.descriptionOverride),
    organization: nullable(item.organizationOverride),
    coachingPoints: item.selectedCoachingPoints ?? null,
    sessionNote: nullable(item.sessionNote),
    briefingText: nullable(item.briefingText),
    timingMode: item.timingMode,
    simultaneousGroup: item.simultaneousGroup,
    participatingGroups: item.participatingGroups,
    startingGroup: nullable(item.startingGroup),
    coachNotes: nullable(item.coachNotes)
  };
}

type LibraryDrillRow = {
  id: string;
  title: string;
  updated_at: string;
  status: string;
  short_description: string | null;
  organization: string | null;
  coaching_points: string | null;
  variations: string | null;
  easier_version: string | null;
  harder_version: string | null;
  duration_minutes: number;
  min_players: number;
  max_players: number;
  materials: Json;
  drill_graphics?: NestedDrillGraphic[] | NestedDrillGraphic | null;
};

async function loadLibraryRows(db: SupabaseClient, userId: string, ids: string[]) {
  const rows = new Map<string, LibraryDrillRow>();
  if (!ids.length) return rows;
  const { data, error } = await db
    .from("drills")
    .select("id,title,updated_at,status,short_description,organization,coaching_points,variations,easier_version,harder_version,duration_minutes,min_players,max_players,materials,drill_graphics(canvas_json,visual_source,uploaded_image_path,uploaded_image_mime_type,uploaded_image_size_bytes)")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as LibraryDrillRow[]) rows.set(row.id, row);
  return rows;
}

function sourceSnapshot(drill: LibraryDrillRow, graphic: NestedDrillGraphic | undefined, uploadedImagePath?: string): Json {
  return {
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
      graphic: graphic?.canvas_json as Json | undefined,
      visual: snapshotVisual(graphic, uploadedImagePath)
    }
  };
}

function sourceTitleFromSnapshot(snapshot?: Json) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return undefined;
  const source = snapshot.sourceDrill;
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  return typeof source.title === "string" ? source.title : undefined;
}

type NestedDrillGraphic = {
  canvas_json: unknown;
  visual_source?: string | null;
  uploaded_image_path?: string | null;
  uploaded_image_mime_type?: string | null;
  uploaded_image_size_bytes?: number | null;
};

function firstDrillGraphic(value: NestedDrillGraphic[] | NestedDrillGraphic | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function snapshotVisual(graphic: NestedDrillGraphic | undefined, uploadedImagePath?: string) {
  return {
    source: graphic?.visual_source === "upload" && uploadedImagePath ? "upload" : "editor",
    uploadedImagePath,
    uploadedImageMimeType: uploadedImagePath ? graphic?.uploaded_image_mime_type ?? undefined : undefined,
    uploadedImageSizeBytes: uploadedImagePath ? graphic?.uploaded_image_size_bytes ?? undefined : undefined
  };
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
  revalidatePath(`/trainings/${eventId}/brief`);
  revalidatePath(`/squad/attendance/${eventId}`);
}
