import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/database";
import { defaultEditorState, type DrillEditorState } from "@/types/editor";
import type { DrillVisual, DrillVisualSource } from "@/types/domain";
import { editorStateToJson, parseEditorState } from "@/lib/drills/editor";
import {
  drillImageBucket,
  drillImageExtension,
  DrillImageError,
  validateDrillImageFile
} from "@/lib/drills/image-upload";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type DrillGraphicRow = {
  drill_id: string;
  canvas_json: Json;
  visual_source: DrillVisualSource;
  uploaded_image_path: string | null;
  uploaded_image_mime_type: string | null;
  uploaded_image_size_bytes: number | null;
};

export type DrillVisualFormInput = {
  source: DrillVisualSource;
  image?: File;
  removeUploadedImage: boolean;
};

const visualColumns = "drill_id,canvas_json,visual_source,uploaded_image_path,uploaded_image_mime_type,uploaded_image_size_bytes";

export async function getDrillGraphic(
  supabase: SupabaseServerClient,
  userId: string,
  drillId: string
): Promise<DrillEditorState> {
  const row = await getDrillGraphicRow(supabase, userId, drillId);
  return row ? parseEditorState(row.canvas_json) : defaultEditorState;
}

export async function getDrillVisual(
  supabase: SupabaseServerClient,
  userId: string,
  drillId: string
): Promise<DrillVisual> {
  const visuals = await getDrillVisualsByDrillId(supabase, userId, [drillId]);
  return visuals.get(drillId) ?? { graphic: defaultEditorState, source: "editor" };
}

export async function getDrillVisualsByDrillId(
  supabase: SupabaseServerClient,
  userId: string,
  drillIds: string[]
) {
  const visuals = new Map<string, DrillVisual>();
  if (!drillIds.length) return visuals;
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("drill_graphics")
    .select(visualColumns)
    .eq("user_id", userId)
    .in("drill_id", drillIds);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as DrillGraphicRow[];
  const paths = rows.flatMap((row) => row.uploaded_image_path ? [row.uploaded_image_path] : []);
  const signedUrls = await createSignedImageUrlMap(supabase, paths);
  for (const row of rows) {
    visuals.set(row.drill_id, rowToVisual(row, signedUrls.get(row.uploaded_image_path ?? "")));
  }
  return visuals;
}

export async function upsertDrillGraphic(
  supabase: SupabaseServerClient,
  userId: string,
  drillId: string,
  state: DrillEditorState
) {
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("drill_graphics").upsert(
    { drill_id: drillId, user_id: userId, canvas_json: editorStateToJson(state) },
    { onConflict: "drill_id" }
  );
  if (error) throw new Error(error.message);
}

export async function saveDrillVisual(
  supabase: SupabaseServerClient,
  userId: string,
  drillId: string,
  state: DrillEditorState,
  input: DrillVisualFormInput
) {
  const db = supabase as unknown as SupabaseClient;
  const existing = await getDrillGraphicRow(supabase, userId, drillId);
  const oldPath = existing?.uploaded_image_path ?? null;
  let nextPath = input.removeUploadedImage ? null : oldPath;
  let nextMimeType = input.removeUploadedImage ? null : existing?.uploaded_image_mime_type ?? null;
  let nextSize = input.removeUploadedImage ? null : existing?.uploaded_image_size_bytes ?? null;
  let newlyUploadedPath: string | null = null;

  if (input.image?.size) {
    const mimeType = await validateDrillImageFile(input.image);
    const path = `${userId}/${drillId}/${crypto.randomUUID()}.${drillImageExtension(mimeType)}`;
    const { error: uploadError } = await supabase.storage.from(drillImageBucket).upload(path, input.image, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false
    });
    if (uploadError) throw new DrillImageError("upload_failed", uploadError.message);
    newlyUploadedPath = path;
    nextPath = path;
    nextMimeType = mimeType;
    nextSize = input.image.size;
  }

  if (input.source === "upload" && !nextPath) {
    throw new DrillImageError("missing_upload", "Select an image before using the uploaded image visual.");
  }
  const nextSource: DrillVisualSource = input.source === "upload" && nextPath ? "upload" : "editor";
  const { error } = await db.from("drill_graphics").upsert({
    drill_id: drillId,
    user_id: userId,
    canvas_json: editorStateToJson(state),
    visual_source: nextSource,
    uploaded_image_path: nextPath,
    uploaded_image_mime_type: nextMimeType,
    uploaded_image_size_bytes: nextSize
  }, { onConflict: "drill_id" });
  if (error) {
    if (newlyUploadedPath) await supabase.storage.from(drillImageBucket).remove([newlyUploadedPath]);
    throw new DrillImageError("upload_failed", error.message);
  }

  if (oldPath && oldPath !== nextPath) {
    await supabase.storage.from(drillImageBucket).remove([oldPath]);
  }
}

export async function duplicateDrillVisual(
  supabase: SupabaseServerClient,
  userId: string,
  sourceDrillId: string,
  targetDrillId: string
) {
  const source = await getDrillGraphicRow(supabase, userId, sourceDrillId);
  if (!source) {
    await upsertDrillGraphic(supabase, userId, targetDrillId, defaultEditorState);
    return;
  }

  let copiedPath: string | null = null;
  if (source.uploaded_image_path && source.uploaded_image_mime_type) {
    const extension = source.uploaded_image_path.split(".").pop() || "jpg";
    copiedPath = `${userId}/${targetDrillId}/${crypto.randomUUID()}.${extension}`;
    const { error: copyError } = await supabase.storage.from(drillImageBucket).copy(source.uploaded_image_path, copiedPath);
    if (copyError) throw new DrillImageError("upload_failed", copyError.message);
  }

  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("drill_graphics").upsert({
    drill_id: targetDrillId,
    user_id: userId,
    canvas_json: source.canvas_json,
    visual_source: source.visual_source === "upload" && copiedPath ? "upload" : "editor",
    uploaded_image_path: copiedPath,
    uploaded_image_mime_type: copiedPath ? source.uploaded_image_mime_type : null,
    uploaded_image_size_bytes: copiedPath ? source.uploaded_image_size_bytes : null
  }, { onConflict: "drill_id" });
  if (error) {
    if (copiedPath) await supabase.storage.from(drillImageBucket).remove([copiedPath]);
    throw new Error(error.message);
  }
}

export async function deleteDrillImageAsset(supabase: SupabaseServerClient, path?: string | null) {
  if (!path) return;
  await supabase.storage.from(drillImageBucket).remove([path]);
}

export async function deleteDrillImageAssets(supabase: SupabaseClient, paths: string[]) {
  if (!paths.length) return;
  await supabase.storage.from(drillImageBucket).remove(paths);
}

export async function copyDrillImageForSnapshot(
  supabase: SupabaseClient,
  userId: string,
  drillId: string,
  sourcePath?: string | null
) {
  if (!sourcePath) return undefined;
  const extension = sourcePath.split(".").pop() || "jpg";
  const targetPath = `${userId}/${drillId}/snapshots/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(drillImageBucket).copy(sourcePath, targetPath);
  if (error) throw new DrillImageError("upload_failed", error.message);
  return targetPath;
}

async function getDrillGraphicRow(supabase: SupabaseServerClient, userId: string, drillId: string) {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("drill_graphics")
    .select(visualColumns)
    .eq("user_id", userId)
    .eq("drill_id", drillId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as DrillGraphicRow | null;
}

async function createSignedImageUrlMap(supabase: SupabaseServerClient, paths: string[]) {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data, error } = await supabase.storage.from(drillImageBucket).createSignedUrls(paths, 60 * 60);
  if (error) return urls;
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

function rowToVisual(row: DrillGraphicRow, uploadedImageUrl?: string): DrillVisual {
  const hasUpload = Boolean(row.uploaded_image_path);
  return {
    graphic: parseEditorState(row.canvas_json),
    source: row.visual_source === "upload" && hasUpload ? "upload" : "editor",
    uploadedImagePath: row.uploaded_image_path ?? undefined,
    uploadedImageUrl,
    uploadedImageMimeType: row.uploaded_image_mime_type ?? undefined,
    uploadedImageSizeBytes: row.uploaded_image_size_bytes ?? undefined
  };
}
