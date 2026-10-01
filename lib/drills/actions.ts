"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseDrillDraftForm, parseDrillForm, toDrillUpdate } from "@/lib/drills/form";
import type { DrillFormField, DrillFormValues } from "@/lib/drills/form";
import {
  deleteDrillImageAsset,
  duplicateDrillVisual,
  finalizeDrillVisualUpload,
  getDrillVisual,
  saveDrillVisual,
  saveDrillVisualCanvas,
  type DrillVisualFormInput
} from "@/lib/drills/graphics";
import { drillImageExtension, DrillImageError, type DrillImageErrorCode, type DrillImageMimeType } from "@/lib/drills/image-upload";
import { getUserDrill } from "@/lib/drills/queries";
import { mapDrillToDuplicateInsert } from "@/lib/drills/mappers";

export type DrillActionState = {
  error?: string;
  imageError?: DrillImageErrorCode;
  fieldErrors?: Partial<Record<DrillFormField, string>>;
  values?: DrillFormValues;
  pendingImageUpload?: {
    drillId: string;
    path: string;
    destination: string;
    createdDrill: boolean;
  };
  completedImageUpload?: {
    drillId: string;
    destination: string;
  };
  submissionId?: number;
};

export type DrillDeleteState = {
  error?: string;
  submissionId?: number;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function safeReturnTo(formData: FormData) {
  const returnTo = formString(formData, "returnTo");
  return returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "";
}

function hasPendingImageUpload(formData: FormData) {
  return formString(formData, "visualSource") === "upload"
    && Boolean(formString(formData, "pendingUploadedImageName"))
    && Number(formString(formData, "pendingUploadedImageSize")) > 0;
}

function visualInput(formData: FormData): DrillVisualFormInput {
  return {
    source: formString(formData, "visualSource") === "upload" ? "upload" : "editor",
    removeUploadedImage: formString(formData, "removeUploadedImage") === "true"
  };
}

function pendingImageUpload(formData: FormData, userId: string, drillId: string, destination: string, createdDrill: boolean) {
  if (!hasPendingImageUpload(formData)) return undefined;
  const declaredType = formString(formData, "pendingUploadedImageType") as DrillImageMimeType;
  const mimeType: DrillImageMimeType = declaredType === "image/png" || declaredType === "image/webp" ? declaredType : "image/jpeg";
  return {
    drillId,
    path: `${userId}/${drillId}/${crypto.randomUUID()}.${drillImageExtension(mimeType)}`,
    destination,
    createdDrill
  };
}

function visualSaveError(error: unknown, fallback: string): DrillActionState {
  if (error instanceof DrillImageError) {
    return { error: error.message, imageError: error.code, submissionId: Date.now() };
  }
  return { error: error instanceof Error ? error.message : fallback, submissionId: Date.now() };
}

async function saveSubmittedVisual(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  drillId: string,
  graphic: Parameters<typeof saveDrillVisualCanvas>[3],
  formData: FormData,
  hasPendingUpload: boolean
) {
  if (hasPendingUpload) {
    await saveDrillVisualCanvas(supabase, userId, drillId, graphic);
    return;
  }
  await saveDrillVisual(supabase, userId, drillId, graphic, visualInput(formData));
}

export async function createDrill(_: DrillActionState, formData: FormData): Promise<DrillActionState> {
  const retryDrillId = formString(formData, "retryDrillId");
  if (retryDrillId) {
    formData.set("drillId", retryDrillId);
    return updateDrill(_, formData);
  }
  const returnTo = safeReturnTo(formData);
  const intent = formString(formData, "intent");
  if (intent === "saveDraft") return createDrillDraft(formData, returnTo);
  const parsed = parseDrillForm(formData);
  if (!parsed.ok) {
    return {
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
      submissionId: Date.now()
    };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("drills")
    .insert({
      ...parsed.data,
      user_id: user.id
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message, submissionId: Date.now() };
  }

  const upload = pendingImageUpload(formData, user.id, data.id, returnTo || `/drills/${data.id}`, true);
  try {
    await saveSubmittedVisual(supabase, user.id, data.id, parsed.graphic, formData, Boolean(upload));
  } catch (graphicError) {
    await db.from("drill_graphics").delete().eq("drill_id", data.id).eq("user_id", user.id);
    await db.from("drills").delete().eq("id", data.id).eq("user_id", user.id);
    return visualSaveError(graphicError, "The Drill could not be created because its visual could not be saved.");
  }

  revalidatePath("/drills");
  if (upload) return { pendingImageUpload: upload, submissionId: Date.now() };
  redirect(returnTo || `/drills/${data.id}`);
}

export async function updateDrill(_: DrillActionState, formData: FormData): Promise<DrillActionState> {
  const returnTo = safeReturnTo(formData);
  const drillId = formString(formData, "drillId");
  if (!drillId) {
    return { error: "Missing drill id." };
  }
  const intent = formString(formData, "intent");
  if (intent === "saveDraft") return updateDrillDraft(formData, drillId, returnTo);

  const parsed = parseDrillForm(formData);
  if (!parsed.ok) {
    return {
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
      submissionId: Date.now()
    };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const update = toDrillUpdate(parsed.data);
  if (intent === "publish") update.status = "published";
  const { error } = await db
    .from("drills")
    .update(update)
    .eq("id", drillId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message, submissionId: Date.now() };
  }

  const upload = pendingImageUpload(formData, user.id, drillId, returnTo || `/drills/${drillId}`, false);
  try {
    await saveSubmittedVisual(supabase, user.id, drillId, parsed.graphic, formData, Boolean(upload));
  } catch (graphicError) {
    return visualSaveError(graphicError, "The Drill details were saved, but the visual could not be saved.");
  }

  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
  if (upload) return { pendingImageUpload: upload, submissionId: Date.now() };
  redirect(returnTo || (intent === "publish" ? `/drills/${drillId}` : `/drills/${drillId}`));
}

async function createDrillDraft(formData: FormData, returnTo: string): Promise<DrillActionState> {
  const parsed = parseDrillDraftForm(formData);
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("drills")
    .insert({
      ...parsed.data,
      user_id: user.id,
      status: "draft"
    })
    .select("id")
    .single();

  if (error) return { error: error.message, values: parsed.values, submissionId: Date.now() };

  const upload = pendingImageUpload(formData, user.id, data.id, returnTo || "/drills?view=drafts", true);
  try {
    await saveSubmittedVisual(supabase, user.id, data.id, parsed.graphic, formData, Boolean(upload));
  } catch (graphicError) {
    await db.from("drill_graphics").delete().eq("drill_id", data.id).eq("user_id", user.id);
    await db.from("drills").delete().eq("id", data.id).eq("user_id", user.id);
    return { ...visualSaveError(graphicError, "The Drill draft could not be created because its visual could not be saved."), values: parsed.values };
  }

  revalidatePath("/drills");
  if (upload) return { pendingImageUpload: upload, submissionId: Date.now() };
  redirect(returnTo || "/drills?view=drafts");
}

async function updateDrillDraft(formData: FormData, drillId: string, returnTo: string): Promise<DrillActionState> {
  const parsed = parseDrillDraftForm(formData);
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("drills")
    .update({
      ...toDrillUpdate(parsed.data),
      status: "draft"
    })
    .eq("id", drillId)
    .eq("user_id", user.id);

  if (error) return { error: error.message, values: parsed.values, submissionId: Date.now() };

  const upload = pendingImageUpload(formData, user.id, drillId, returnTo || "/drills?view=drafts", false);
  try {
    await saveSubmittedVisual(supabase, user.id, drillId, parsed.graphic, formData, Boolean(upload));
  } catch (graphicError) {
    return { ...visualSaveError(graphicError, "The Drill draft details were saved, but the visual could not be saved."), values: parsed.values };
  }

  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
  if (upload) return { pendingImageUpload: upload, submissionId: Date.now() };
  redirect(returnTo || "/drills?view=drafts");
}

export async function finalizePendingDrillImageUpload(formData: FormData): Promise<DrillActionState> {
  const drillId = formString(formData, "drillId");
  const path = formString(formData, "path");
  const requestedDestination = formString(formData, "destination");
  const destination = requestedDestination.startsWith("/") && !requestedDestination.startsWith("//") ? requestedDestination : "";
  if (!drillId || !path) return { error: "Missing image upload details.", imageError: "upload_failed", submissionId: Date.now() };
  const { supabase, user } = await requireUser();
  const drill = await getUserDrill(supabase, user.id, drillId);
  if (!drill) return { error: "Drill not found.", imageError: "upload_failed", submissionId: Date.now() };
  try {
    await finalizeDrillVisualUpload(supabase, user.id, drillId, path);
  } catch (error) {
    return visualSaveError(error, "The uploaded image could not be verified or saved.");
  }
  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
  return {
    completedImageUpload: {
      drillId,
      destination: destination || `/drills/${drillId}`
    },
    submissionId: Date.now()
  };
}

export async function deleteDrill(_: DrillDeleteState, formData: FormData): Promise<DrillDeleteState> {
  return moveDrillToTrash(formData);
}

export async function archiveDrill(formData: FormData) {
  const drillId = formString(formData, "drillId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await db
    .from("drills")
    .update({ archived_at: new Date().toISOString(), deleted_at: null })
    .eq("id", drillId)
    .eq("user_id", user.id);
  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
  redirect("/drills");
}

export async function restoreDrill(formData: FormData) {
  const drillId = formString(formData, "drillId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await db
    .from("drills")
    .update({ archived_at: null, deleted_at: null })
    .eq("id", drillId)
    .eq("user_id", user.id);
  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
  redirect("/drills");
}

export async function moveDrillToTrash(formData: FormData): Promise<DrillDeleteState> {
  const drillId = formString(formData, "drillId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("drills")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", drillId)
    .eq("user_id", user.id);

  if (error) return { error: error.message, submissionId: Date.now() };

  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
  redirect("/drills?view=trash");
}

export async function permanentlyDeleteDrill(_: DrillDeleteState, formData: FormData): Promise<DrillDeleteState> {
  const drillId = formString(formData, "drillId");
  if (!drillId) {
    return { error: "Missing drill id.", submissionId: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { count, error: usageError } = await db
    .from("training_session_drills")
    .select("id", { count: "exact", head: true })
    .eq("drill_id", drillId)
    .eq("user_id", user.id);

  if (usageError) {
    return { error: usageError.message, submissionId: Date.now() };
  }

  if ((count ?? 0) > 0) {
    return {
      error: "This drill is used in one or more sessions. Remove it from those sessions before deleting.",
      submissionId: Date.now()
    };
  }

  const visual = await getDrillVisual(supabase, user.id, drillId);
  await db.from("drill_graphics").delete().eq("drill_id", drillId).eq("user_id", user.id);
  const { error } = await db.from("drills").delete().eq("id", drillId).eq("user_id", user.id).not("deleted_at", "is", null);

  if (error) {
    if (error.code === "23503") {
      return {
        error: "This drill is used in one or more sessions. Remove it from those sessions before deleting.",
        submissionId: Date.now()
      };
    }
    return { error: error.message, submissionId: Date.now() };
  }

  await deleteDrillImageAsset(supabase, visual.uploadedImagePath);

  revalidatePath("/drills");
  revalidatePath("/dashboard");
  redirect("/drills?view=trash");
}

export async function duplicateDrill(formData: FormData) {
  const drillId = formString(formData, "drillId");
  const { supabase, user } = await requireUser();
  const drill = await getUserDrill(supabase, user.id, drillId);

  if (!drill) {
    redirect("/drills");
  }

  const db = supabase as unknown as SupabaseClient;
  const { data } = await db
    .from("drills")
    .insert(mapDrillToDuplicateInsert(drill, user.id))
    .select("id")
    .single();

  if (data?.id) {
    try {
      await duplicateDrillVisual(supabase, user.id, drillId, data.id);
    } catch {
      await db.from("drill_graphics").delete().eq("drill_id", data.id).eq("user_id", user.id);
      await db.from("drills").delete().eq("id", data.id).eq("user_id", user.id);
      redirect(`/drills/${drillId}`);
    }
  }

  revalidatePath("/drills");
  redirect(data?.id ? `/drills/${data.id}/edit` : "/drills");
}

export async function toggleFavorite(formData: FormData) {
  const drillId = formString(formData, "drillId");
  const nextFavorite = formString(formData, "nextFavorite") === "true";
  if (!drillId) return { error: "Missing drill id." };
  const { supabase, user } = await requireUser();

  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("drills")
    .update({ is_favorite: nextFavorite })
    .eq("id", drillId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
  return { ok: true };
}
