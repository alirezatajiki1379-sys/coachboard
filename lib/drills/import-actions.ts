"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultEditorState } from "@/types/editor";
import type { Json } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { finalizeDrillVisualUpload, upsertDrillGraphic } from "@/lib/drills/graphics";
import { materialsToJson } from "@/lib/drills/materials";
import {
  findDrillDuplicate,
  maxDrillsPerImport,
  validateNormalizedImportItem,
  type DrillDuplicateCandidate,
  type DrillImportItem
} from "@/lib/drills/import-schema";

export type DrillImportDecision = "import" | "import_anyway" | "update" | "skip";

export type DrillImportPayloadItem = {
  index: number;
  selected: boolean;
  decision: DrillImportDecision;
  matchedDrillId?: string;
  item: DrillImportItem;
};

export type StartDrillImportPayload = {
  name: string;
  schemaVersion: number;
  sourceFilename: string;
  packageSizeBytes: number;
  items: DrillImportPayloadItem[];
};

export type DrillImportUploadTask = {
  itemId: string;
  itemIndex: number;
  drillId: string;
  updateExisting: boolean;
};

export type DrillImportActionResult = {
  ok: boolean;
  error?: string;
  batchId?: string;
  tasks?: DrillImportUploadTask[];
  summary?: { imported: number; skipped: number; failed: number };
};

async function requireImportUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user, db: supabase as unknown as SupabaseClient };
}

export async function startDrillImport(payload: StartDrillImportPayload): Promise<DrillImportActionResult> {
  const context = await requireImportUser();
  if (!context) return { ok: false, error: "Your session expired. Sign in again before importing." };
  if (!payload || typeof payload !== "object") return { ok: false, error: "The import request is invalid." };
  if (payload.schemaVersion !== 1) return { ok: false, error: "This import schema version is not supported." };
  if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > maxDrillsPerImport) {
    return { ok: false, error: `An import must contain between 1 and ${maxDrillsPerImport} drills.` };
  }
  if (payload.items.some((item) => !item || typeof item !== "object")) return { ok: false, error: "The import contains an invalid item." };
  const indexes = payload.items.map((item) => item.index);
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= maxDrillsPerImport) || new Set(indexes).size !== indexes.length) {
    return { ok: false, error: "The import contains invalid or duplicate item indexes." };
  }
  const { supabase, user, db } = context;
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 160) || "Drill import" : "Drill import";
  const sourceFilename = typeof payload.sourceFilename === "string" ? payload.sourceFilename.trim().slice(0, 500) : "";
  const packageSizeBytes = Number.isFinite(payload.packageSizeBytes) ? Math.max(0, Math.round(payload.packageSizeBytes)) : 0;
  const { data: batch, error: batchError } = await db.from("drill_import_batches").insert({
    user_id: user.id,
    name,
    schema_version: 1,
    source_filename: sourceFilename || null,
    status: "importing",
    total_items: payload.items.length,
    metadata: { package_size_bytes: packageSizeBytes }
  }).select("id").single();
  if (batchError || !batch?.id) return { ok: false, error: batchError?.message ?? "The import batch could not be created." };

  const candidates = await loadDuplicateCandidates(db, user.id);
  const tasks: DrillImportUploadTask[] = [];

  for (const payloadItem of payload.items) {
    const validated = validateNormalizedImportItem(payloadItem.item, payloadItem.index);
    const safePayloadItem: DrillImportPayloadItem = { ...payloadItem, item: validated.item };
    const validationError = validated.issues.find((entry) => entry.severity === "error");
    const duplicate = findDrillDuplicate(validated.item, candidates);
    const requestedDecision = isImportDecision(payloadItem.decision) ? payloadItem.decision : "skip";
    const decision = payloadItem.selected === true ? requestedDecision : "skip";

    if (decision === "skip" || (decision === "import" && duplicate)) {
      await insertImportItem(db, user.id, batch.id, safePayloadItem, "skipped", decision, duplicate?.drillId, null, duplicate ? "Possible duplicate skipped." : null);
      continue;
    }
    if (validationError) {
      await insertImportItem(db, user.id, batch.id, safePayloadItem, "failed", decision, duplicate?.drillId, null, `Validation failed: ${validationError.field} (${validationError.code}).`);
      continue;
    }

    const updateTarget = decision === "update" ? duplicate : undefined;
    if (decision === "update" && (!updateTarget?.safeToUpdate || updateTarget.drillId !== payloadItem.matchedDrillId)) {
      await insertImportItem(db, user.id, batch.id, safePayloadItem, "failed", decision, duplicate?.drillId, null, "The existing Drill match is not explicit enough to update safely.");
      continue;
    }

    if (updateTarget) {
      const pendingImage = Boolean(validated.item.image);
      if (!pendingImage) {
        const { error } = await db.from("drills").update(drillMutation(validated.item, batch.id)).eq("id", updateTarget.drillId).eq("user_id", user.id);
        await insertImportItem(db, user.id, batch.id, safePayloadItem, error ? "failed" : "imported", decision, updateTarget.drillId, updateTarget.drillId, error?.message ?? null);
        continue;
      }
      const itemRow = await insertImportItem(db, user.id, batch.id, safePayloadItem, "pending", decision, updateTarget.drillId, updateTarget.drillId, null);
      if (itemRow?.id) tasks.push({ itemId: itemRow.id, itemIndex: payloadItem.index, drillId: updateTarget.drillId, updateExisting: true });
      continue;
    }

    const { data: drill, error: drillError } = await db.from("drills").insert({
      ...drillMutation(validated.item, batch.id),
      user_id: user.id
    }).select("id").single();
    if (drillError || !drill?.id) {
      await insertImportItem(db, user.id, batch.id, safePayloadItem, "failed", decision, duplicate?.drillId, null, drillError?.message ?? "The Drill could not be created.");
      continue;
    }

    try {
      await upsertDrillGraphic(supabase, user.id, drill.id, defaultEditorState);
    } catch (error) {
      await db.from("drills").delete().eq("id", drill.id).eq("user_id", user.id);
      await insertImportItem(db, user.id, batch.id, safePayloadItem, "failed", decision, duplicate?.drillId, null, error instanceof Error ? error.message : "The Drill visual could not be prepared.");
      continue;
    }

    const status = validated.item.image ? "pending" : "imported";
    const itemRow = await insertImportItem(db, user.id, batch.id, safePayloadItem, status, decision, duplicate?.drillId, drill.id, null);
    if (!itemRow?.id) {
      await db.from("drill_graphics").delete().eq("drill_id", drill.id).eq("user_id", user.id);
      await db.from("drills").delete().eq("id", drill.id).eq("user_id", user.id);
      continue;
    }
    if (validated.item.image) tasks.push({ itemId: itemRow.id, itemIndex: payloadItem.index, drillId: drill.id, updateExisting: false });
    candidates.push(candidateFromImportedDrill(drill.id, validated.item));
  }

  if (!tasks.length) return completeDrillImport(batch.id);
  await refreshBatchCounts(db, user.id, batch.id, false);
  revalidateImportPaths(batch.id);
  return { ok: true, batchId: batch.id, tasks };
}

export async function finalizeDrillImportImage(input: {
  batchId: string;
  itemId: string;
  path?: string;
  error?: string;
}): Promise<DrillImportActionResult> {
  const context = await requireImportUser();
  if (!context) return { ok: false, error: "Your session expired." };
  const { supabase, user, db } = context;
  const { data } = await db.from("drill_import_items")
    .select("id,batch_id,drill_id,requested_action,source_json,status")
    .eq("id", input.itemId)
    .eq("batch_id", input.batchId)
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as { id: string; batch_id: string; drill_id: string | null; requested_action: DrillImportDecision; source_json: Json; status: string } | null;
  if (!row?.drill_id) return { ok: false, error: "The pending import item no longer exists." };
  if (row.status !== "pending") return { ok: true, batchId: input.batchId };

  if (input.error || !input.path) {
    await failPendingItem(db, user.id, row, input.error || "The image upload failed.");
    return { ok: false, batchId: input.batchId, error: input.error || "The image upload failed." };
  }

  try {
    await finalizeDrillVisualUpload(supabase, user.id, row.drill_id, input.path);
    if (row.requested_action === "update") {
      const source = sourceItemFromJson(row.source_json);
      if (!source) throw new Error("The reviewed Drill data could not be restored.");
      const { error } = await db.from("drills").update(drillMutation(source, input.batchId)).eq("id", row.drill_id).eq("user_id", user.id);
      if (error) throw new Error(error.message);
    }
    await db.from("drill_import_items").update({ status: "imported", error_message: null }).eq("id", row.id).eq("user_id", user.id);
    return { ok: true, batchId: input.batchId };
  } catch (error) {
    await failPendingItem(db, user.id, row, error instanceof Error ? error.message : "The image could not be finalized.");
    return { ok: false, batchId: input.batchId, error: error instanceof Error ? error.message : "The image could not be finalized." };
  }
}

export async function completeDrillImport(batchId: string): Promise<DrillImportActionResult> {
  const context = await requireImportUser();
  if (!context) return { ok: false, error: "Your session expired." };
  const { user, db } = context;
  const summary = await refreshBatchCounts(db, user.id, batchId, true);
  if (!summary) return { ok: false, error: "The import batch could not be completed." };
  revalidateImportPaths(batchId);
  return { ok: true, batchId, summary };
}

export async function archiveDrillImportBatch(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const context = await requireImportUser();
  if (!context || !batchId) return;
  const { user, db } = context;
  await db.from("drills").update({ archived_at: new Date().toISOString(), deleted_at: null }).eq("user_id", user.id).eq("import_batch_id", batchId).is("deleted_at", null);
  revalidateImportPaths(batchId);
}

async function loadDuplicateCandidates(db: SupabaseClient, userId: string): Promise<DrillDuplicateCandidate[]> {
  const { data } = await db.from("drills")
    .select("id,title,import_external_id,source_title,source_publisher,source_page")
    .eq("user_id", userId)
    .is("deleted_at", null);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    importExternalId: row.import_external_id ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    sourcePublisher: row.source_publisher ?? undefined,
    sourcePage: row.source_page ?? undefined
  }));
}

function drillMutation(item: DrillImportItem, batchId: string) {
  return {
    title: item.title,
    short_description: item.shortDescription ?? null,
    organization: item.organization ?? null,
    coaching_points: item.coachingPoints ?? null,
    variations: item.variations ?? null,
    easier_version: item.easierVersion ?? null,
    harder_version: item.harderVersion ?? null,
    age_mode: item.ageMode,
    age_groups: item.ageGroups,
    minimum_age: item.ageMode === "custom_range" ? item.minimumAge ?? null : null,
    maximum_age: item.ageMode === "custom_range" ? item.maximumAge ?? null : null,
    main_focus: item.mainFocus,
    sub_focus: item.subFocus ?? null,
    training_blocks: item.trainingBlocks,
    drill_type: item.drillType,
    duration_minutes: item.durationMinutes,
    min_players: item.minPlayers,
    max_players: item.maxPlayers,
    materials: materialsToJson(item.materials),
    difficulty_level: item.difficultyLevel,
    intensity_level: item.intensityLevel,
    tags: item.tags,
    status: "published" as const,
    archived_at: null,
    deleted_at: null,
    import_batch_id: batchId,
    import_external_id: item.externalId ?? null,
    source_title: item.source.title ?? null,
    source_publisher: item.source.publisher ?? null,
    source_page: item.source.page ?? null,
    source_reference: item.source.reference ?? null
  };
}

async function insertImportItem(
  db: SupabaseClient,
  userId: string,
  batchId: string,
  payloadItem: DrillImportPayloadItem,
  status: "pending" | "imported" | "skipped" | "failed",
  decision: DrillImportDecision,
  matchedDrillId: string | undefined,
  drillId: string | null,
  errorMessage: string | null
) {
  const { data } = await db.from("drill_import_items").insert({
    user_id: userId,
    batch_id: batchId,
    item_index: payloadItem.index,
    external_id: payloadItem.item.externalId ?? null,
    title: payloadItem.item.title || `Item ${payloadItem.index + 1}`,
    requested_action: decision,
    status,
    matched_drill_id: matchedDrillId ?? null,
    drill_id: drillId,
    source_json: payloadItem.item as unknown as Json,
    error_message: errorMessage
  }).select("id").maybeSingle();
  return data as { id: string } | null;
}

async function failPendingItem(db: SupabaseClient, userId: string, row: { id: string; drill_id: string | null; requested_action: DrillImportDecision }, message: string) {
  if (row.drill_id && row.requested_action !== "update") {
    await db.from("drill_graphics").delete().eq("drill_id", row.drill_id).eq("user_id", userId);
    await db.from("drills").delete().eq("id", row.drill_id).eq("user_id", userId);
  }
  await db.from("drill_import_items").update({ status: "failed", error_message: message.slice(0, 2000) }).eq("id", row.id).eq("user_id", userId);
}

async function refreshBatchCounts(db: SupabaseClient, userId: string, batchId: string, finish: boolean) {
  const { data, error } = await db.from("drill_import_items").select("status").eq("batch_id", batchId).eq("user_id", userId);
  if (error) return null;
  const imported = (data ?? []).filter((row) => row.status === "imported").length;
  const skipped = (data ?? []).filter((row) => row.status === "skipped").length;
  const failed = (data ?? []).filter((row) => row.status === "failed").length;
  const pending = (data ?? []).filter((row) => row.status === "pending").length;
  const update = {
    imported_count: imported,
    skipped_count: skipped,
    failed_count: failed,
    status: finish && !pending ? (failed ? "completed_with_errors" : "completed") : "importing",
    completed_at: finish && !pending ? new Date().toISOString() : null
  };
  const { error: updateError } = await db.from("drill_import_batches").update(update).eq("id", batchId).eq("user_id", userId);
  return updateError ? null : { imported, skipped, failed };
}

function candidateFromImportedDrill(id: string, item: DrillImportItem): DrillDuplicateCandidate {
  return { id, title: item.title, importExternalId: item.externalId, sourceTitle: item.source.title, sourcePublisher: item.source.publisher, sourcePage: item.source.page };
}

function isImportDecision(value: unknown): value is DrillImportDecision {
  return value === "import" || value === "import_anyway" || value === "update" || value === "skip";
}

function sourceItemFromJson(value: Json): DrillImportItem | null {
  const validated = validateNormalizedImportItem(value, 0);
  return validated.issues.some((entry) => entry.severity === "error") ? null : validated.item;
}

function revalidateImportPaths(batchId: string) {
  revalidatePath("/drills");
  revalidatePath("/drills/import");
  revalidatePath(`/drills/import/${batchId}`);
}
