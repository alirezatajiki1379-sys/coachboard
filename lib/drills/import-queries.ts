import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type { DrillDuplicateCandidate } from "@/lib/drills/import-schema";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DrillImportBatchSummary = {
  id: string;
  name: string;
  sourceFilename?: string;
  status: string;
  schemaVersion: number;
  totalItems: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  completedAt?: string;
  createdAt: string;
};

export type DrillImportBatchItem = {
  id: string;
  index: number;
  title: string;
  status: string;
  action: string;
  error?: string;
  drillId?: string;
};

export async function listDrillImportBatches(supabase: SupabaseServerClient, userId: string, limit = 12): Promise<DrillImportBatchSummary[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db.from("drill_import_batches")
    .select("id,name,source_filename,status,schema_version,total_items,imported_count,skipped_count,failed_count,completed_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sourceFilename: row.source_filename ?? undefined,
    status: row.status,
    schemaVersion: row.schema_version,
    totalItems: row.total_items,
    importedCount: row.imported_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at
  }));
}

export async function getDrillImportBatch(supabase: SupabaseServerClient, userId: string, batchId: string) {
  const db = supabase as unknown as SupabaseClient;
  const [{ data: batch, error }, { data: items, error: itemError }] = await Promise.all([
    db.from("drill_import_batches").select("*").eq("id", batchId).eq("user_id", userId).maybeSingle(),
    db.from("drill_import_items").select("id,item_index,title,status,requested_action,error_message,drill_id").eq("batch_id", batchId).eq("user_id", userId).order("item_index")
  ]);
  if (error) throw new Error(error.message);
  if (itemError) throw new Error(itemError.message);
  if (!batch) return null;
  return {
    batch: {
      id: batch.id,
      name: batch.name,
      sourceFilename: batch.source_filename ?? undefined,
      status: batch.status,
      schemaVersion: batch.schema_version,
      totalItems: batch.total_items,
      importedCount: batch.imported_count,
      skippedCount: batch.skipped_count,
      failedCount: batch.failed_count,
      completedAt: batch.completed_at ?? undefined,
      createdAt: batch.created_at
    } satisfies DrillImportBatchSummary,
    items: (items ?? []).map((item) => ({
      id: item.id,
      index: item.item_index,
      title: item.title,
      status: item.status,
      action: item.requested_action,
      error: item.error_message ?? undefined,
      drillId: item.drill_id ?? undefined
    })) satisfies DrillImportBatchItem[]
  };
}

export async function listDrillDuplicateCandidates(supabase: SupabaseServerClient, userId: string): Promise<DrillDuplicateCandidate[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db.from("drills")
    .select("id,title,import_external_id,source_title,source_publisher,source_page")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    importExternalId: row.import_external_id ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    sourcePublisher: row.source_publisher ?? undefined,
    sourcePage: row.source_page ?? undefined
  }));
}
