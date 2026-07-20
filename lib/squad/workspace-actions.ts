"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  configurationFromState,
  defaultWorkspaceConfiguration,
  normalizeWorkspaceConfiguration,
  parseWorkspaceState,
  workspaceColumns,
  workspaceHref,
  type WorkspaceConfiguration,
  type WorkspaceGroupMode,
  type WorkspaceInspectorMode,
  type WorkspaceSavedView,
  type WorkspaceView
} from "@/lib/squad/workspace";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase: supabase as unknown as SupabaseClient, user };
}

export async function saveSystemWorkspaceOverride(formData: FormData) {
  const { supabase, user } = await requireUser();
  const state = parseWorkspaceState(formToParams(formData));
  const config = parseConfigurationForm(formData, state.view, state);
  const existing = await getSystemOverride(supabase, user.id, state.view);
  const payload = {
    user_id: user.id,
    name: `System override: ${state.view}`,
    kind: "system",
    system_view_id: state.view,
    configuration: config,
    display_order: 0,
    is_default: formData.get("setDefault") === "on"
  };
  if (payload.is_default) await clearDefaults(supabase, user.id);
  const query = existing
    ? supabase.from("coach_workspace_views").update(payload).eq("id", existing.id).eq("user_id", user.id)
    : supabase.from("coach_workspace_views").insert(payload);
  const { error } = await query;
  if (error) redirect(workspaceHref(state, { customize: true }));
  revalidatePath("/squad");
  redirect(workspaceHref({ ...state, customize: false }, {}));
}

export async function resetSystemWorkspaceOverride(formData: FormData) {
  const { supabase, user } = await requireUser();
  const state = parseWorkspaceState(formToParams(formData));
  await supabase.from("coach_workspace_views").delete().eq("user_id", user.id).eq("kind", "system").eq("system_view_id", state.view);
  revalidatePath("/squad");
  redirect(workspaceHref({ ...state, customize: false }, {}));
}

export async function createWorkspaceSavedView(formData: FormData) {
  const { supabase, user } = await requireUser();
  const state = parseWorkspaceState(formToParams(formData));
  const name = formString(formData, "viewName");
  if (!validName(name)) redirect(workspaceHref(state, { customize: true }));
  if (await nameExists(supabase, user.id, name)) redirect(workspaceHref(state, { customize: true }));
  const config = parseConfigurationForm(formData, state.view, state);
  const displayOrder = await nextDisplayOrder(supabase, user.id);
  const setDefault = formData.get("setDefault") === "on";
  if (setDefault) await clearDefaults(supabase, user.id);
  const { data, error } = await supabase
    .from("coach_workspace_views")
    .insert({
      user_id: user.id,
      name,
      description: optional(formString(formData, "viewDescription")),
      kind: "saved",
      system_view_id: null,
      configuration: config,
      display_order: displayOrder,
      is_default: setDefault
    })
    .select("id")
    .single();
  if (error || !data?.id) redirect(workspaceHref(state, { customize: true }));
  revalidatePath("/squad");
  redirect(`/squad?savedView=${data.id}`);
}

export async function updateWorkspaceSavedView(formData: FormData) {
  const { supabase, user } = await requireUser();
  const state = parseWorkspaceState(formToParams(formData));
  const savedViewId = formString(formData, "savedViewId");
  const config = parseConfigurationForm(formData, state.view, state);
  const { error } = await supabase
    .from("coach_workspace_views")
    .update({ configuration: config })
    .eq("id", savedViewId)
    .eq("user_id", user.id)
    .eq("kind", "saved");
  if (error) redirect(workspaceHref(state, { customize: true }));
  revalidatePath("/squad");
  redirect(`/squad?savedView=${savedViewId}`);
}

export async function renameWorkspaceSavedView(formData: FormData) {
  const { supabase, user } = await requireUser();
  const savedViewId = formString(formData, "savedViewId");
  const name = formString(formData, "viewName");
  if (!validName(name)) redirect("/squad");
  const duplicate = await nameExists(supabase, user.id, name, savedViewId);
  if (duplicate) redirect(`/squad?savedView=${savedViewId}`);
  await supabase
    .from("coach_workspace_views")
    .update({ name, description: optional(formString(formData, "viewDescription")) })
    .eq("id", savedViewId)
    .eq("user_id", user.id)
    .eq("kind", "saved");
  revalidatePath("/squad");
  redirect(`/squad?savedView=${savedViewId}`);
}

export async function duplicateWorkspaceSavedView(formData: FormData) {
  const { supabase, user } = await requireUser();
  const savedViewId = formString(formData, "savedViewId");
  const { data } = await supabase.from("coach_workspace_views").select("*").eq("id", savedViewId).eq("user_id", user.id).eq("kind", "saved").maybeSingle();
  if (!data) redirect("/squad");
  const name = await uniqueCopyName(supabase, user.id, String(data.name));
  const displayOrder = await nextDisplayOrder(supabase, user.id);
  const { data: copy } = await supabase
    .from("coach_workspace_views")
    .insert({
      user_id: user.id,
      name,
      description: data.description,
      kind: "saved",
      system_view_id: null,
      configuration: data.configuration,
      display_order: displayOrder,
      is_default: false
    })
    .select("id")
    .single();
  revalidatePath("/squad");
  redirect(copy?.id ? `/squad?savedView=${copy.id}` : "/squad");
}

export async function deleteWorkspaceSavedView(formData: FormData) {
  const { supabase, user } = await requireUser();
  const savedViewId = formString(formData, "savedViewId");
  await supabase.from("coach_workspace_views").delete().eq("id", savedViewId).eq("user_id", user.id).eq("kind", "saved");
  revalidatePath("/squad");
  redirect("/squad");
}

export async function setDefaultWorkspaceView(formData: FormData) {
  const { supabase, user } = await requireUser();
  const savedViewId = formString(formData, "savedViewId");
  const systemViewId = formString(formData, "systemViewId") as WorkspaceView;
  await clearDefaults(supabase, user.id);
  if (savedViewId) {
    await supabase.from("coach_workspace_views").update({ is_default: true }).eq("id", savedViewId).eq("user_id", user.id).eq("kind", "saved");
    revalidatePath("/squad");
    redirect(`/squad?savedView=${savedViewId}`);
  }
  if (systemViewId) {
    const existing = await getSystemOverride(supabase, user.id, systemViewId);
    const config = existing?.configuration ?? defaultWorkspaceConfiguration(systemViewId);
    if (existing) {
      await supabase.from("coach_workspace_views").update({ is_default: true }).eq("id", existing.id).eq("user_id", user.id);
    } else {
      await supabase.from("coach_workspace_views").insert({
        user_id: user.id,
        name: `System default: ${systemViewId}`,
        kind: "system",
        system_view_id: systemViewId,
        configuration: config,
        display_order: 0,
        is_default: true
      });
    }
  }
  revalidatePath("/squad");
  redirect(systemViewId ? `/squad?view=${systemViewId}` : "/squad");
}

export async function moveWorkspaceSavedView(formData: FormData) {
  const { supabase, user } = await requireUser();
  const savedViewId = formString(formData, "savedViewId");
  const direction = formString(formData, "move");
  const views = await listSavedViews(supabase, user.id);
  const index = views.findIndex((view) => view.id === savedViewId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= views.length) redirect("/squad");
  const current = views[index];
  const target = views[targetIndex];
  await Promise.all([
    supabase.from("coach_workspace_views").update({ display_order: target.displayOrder }).eq("id", current.id).eq("user_id", user.id),
    supabase.from("coach_workspace_views").update({ display_order: current.displayOrder }).eq("id", target.id).eq("user_id", user.id)
  ]);
  revalidatePath("/squad");
  redirect(`/squad?savedView=${savedViewId}`);
}

export async function saveWorkspaceColumnOrder(input: {
  view: WorkspaceView;
  savedViewId?: string;
  columnOrder: string[];
}) {
  const { supabase, user } = await requireUser();
  const fallback = defaultWorkspaceConfiguration(input.view);
  const allowed = new Set<string>(workspaceColumns.map((column) => column.id));
  const requested = input.columnOrder.filter((id): id is WorkspaceConfiguration["columnOrder"][number] => allowed.has(id));
  const locked = workspaceColumns.filter((column) => column.required).map((column) => column.id);
  const rest = requested.filter((id) => !locked.includes(id));
  const missing = workspaceColumns.map((column) => column.id).filter((id) => !locked.includes(id) && !rest.includes(id));
  const columnOrder = [...locked, ...rest, ...missing] as WorkspaceConfiguration["columnOrder"];

  if (input.savedViewId) {
    const { data } = await supabase
      .from("coach_workspace_views")
      .select("*")
      .eq("id", input.savedViewId)
      .eq("user_id", user.id)
      .eq("kind", "saved")
      .maybeSingle();
    if (!data) return { ok: false, error: "Saved view not found." };
    const config = normalizeWorkspaceConfiguration(data.configuration, input.view);
    const { error } = await supabase
      .from("coach_workspace_views")
      .update({ configuration: { ...config, columnOrder } })
      .eq("id", input.savedViewId)
      .eq("user_id", user.id)
      .eq("kind", "saved");
    if (error) return { ok: false, error: "The new column order could not be saved." };
    revalidatePath("/squad");
    return { ok: true };
  }

  const existing = await getSystemOverride(supabase, user.id, input.view);
  const config = existing?.configuration ?? fallback;
  const payload = {
    user_id: user.id,
    name: `System override: ${input.view}`,
    kind: "system",
    system_view_id: input.view,
    configuration: { ...config, columnOrder },
    display_order: 0,
    is_default: existing?.isDefault ?? false
  };
  const query = existing
    ? supabase.from("coach_workspace_views").update(payload).eq("id", existing.id).eq("user_id", user.id)
    : supabase.from("coach_workspace_views").insert(payload);
  const { error } = await query;
  if (error) return { ok: false, error: "The new column order could not be saved." };
  revalidatePath("/squad");
  return { ok: true };
}

function parseConfigurationForm(formData: FormData, view: WorkspaceView, state: ReturnType<typeof parseWorkspaceState>): WorkspaceConfiguration {
  const current = configurationFromState(state, defaultWorkspaceConfiguration(view));
  const visibleColumns = workspaceColumns
    .filter((column) => column.required || formData.get(`column:${column.id}`) === "on")
    .map((column) => column.id);
  const columnOrder = [...workspaceColumns.map((column) => column.id)].sort((a, b) => orderValue(formData, a) - orderValue(formData, b));
  const mobileMetrics = ["mobileMetric1", "mobileMetric2", "mobileMetric3", "mobileMetric4"]
    .map((key) => formString(formData, key))
    .filter((value, index, values) => value && values.indexOf(value) === index);
  return normalizeWorkspaceConfiguration({
    ...current,
    visibleColumns,
    columnOrder,
    mobileMetrics,
    groupMode: groupModeValue(formString(formData, "groupMode")),
    density: formString(formData, "density") === "comfortable" ? "comfortable" : "compact",
    inspectorMode: inspectorModeValue(formString(formData, "inspectorMode")),
    showAttentionIndicators: formData.get("showAttentionIndicators") === "on"
  }, view);
}

function formToParams(formData: FormData) {
  const params: Record<string, string> = {};
  for (const key of ["view", "savedView", "players", "position", "availability", "period", "sort", "direction", "search", "selectedPlayer", "coachAssessment", "developmentStatus", "reviewStatus", "evidenceBase", "ratingStatus", "from", "to"]) {
    const value = formString(formData, key);
    if (value) params[key] = value;
  }
  return params;
}

function orderValue(formData: FormData, columnId: string) {
  const value = Number(formData.get(`order:${columnId}`));
  return Number.isFinite(value) ? value : 999;
}

function groupModeValue(value: string): WorkspaceGroupMode {
  return value === "positionGroup" || value === "playerType" ? value : "none";
}

function inspectorModeValue(value: string): WorkspaceInspectorMode {
  return value === "collapsed" ? "collapsed" : "open";
}

async function getSystemOverride(supabase: SupabaseClient, userId: string, view: WorkspaceView): Promise<WorkspaceSavedView | undefined> {
  const { data } = await supabase.from("coach_workspace_views").select("*").eq("user_id", userId).eq("kind", "system").eq("system_view_id", view).maybeSingle();
  if (!data) return undefined;
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? undefined,
    kind: "system",
    systemViewId: view,
    configuration: normalizeWorkspaceConfiguration(data.configuration, view),
    displayOrder: data.display_order ?? 0,
    isDefault: Boolean(data.is_default),
    updatedAt: data.updated_at
  };
}

async function listSavedViews(supabase: SupabaseClient, userId: string): Promise<WorkspaceSavedView[]> {
  const { data } = await supabase.from("coach_workspace_views").select("*").eq("user_id", userId).eq("kind", "saved").order("display_order", { ascending: true });
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    kind: "saved",
    configuration: normalizeWorkspaceConfiguration(row.configuration, row.configuration?.quickViewId ?? "all"),
    displayOrder: row.display_order ?? 0,
    isDefault: Boolean(row.is_default),
    updatedAt: row.updated_at
  }));
}

async function clearDefaults(supabase: SupabaseClient, userId: string) {
  await supabase.from("coach_workspace_views").update({ is_default: false }).eq("user_id", userId);
}

async function nextDisplayOrder(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("coach_workspace_views").select("display_order").eq("user_id", userId).eq("kind", "saved").order("display_order", { ascending: false }).limit(1);
  return ((data?.[0]?.display_order as number | null | undefined) ?? -1) + 1;
}

async function nameExists(supabase: SupabaseClient, userId: string, name: string, exceptId?: string) {
  let query = supabase.from("coach_workspace_views").select("id").eq("user_id", userId).eq("kind", "saved").ilike("name", name);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query.limit(1);
  return Boolean(data?.length);
}

async function uniqueCopyName(supabase: SupabaseClient, userId: string, base: string) {
  for (let index = 1; index <= 50; index += 1) {
    const name = `${base} copy${index > 1 ? ` ${index}` : ""}`;
    if (!await nameExists(supabase, userId, name)) return name;
  }
  return `${base} copy`;
}

function validName(name: string) {
  return name.length > 0 && name.length <= 80;
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: string) {
  return value ? value : null;
}
