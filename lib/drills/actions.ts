"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseDrillDraftForm, parseDrillForm, toDrillUpdate } from "@/lib/drills/form";
import type { DrillFormField, DrillFormValues } from "@/lib/drills/form";
import { getDrillGraphic, upsertDrillGraphic } from "@/lib/drills/graphics";
import { getUserDrill } from "@/lib/drills/queries";
import { mapDrillToDuplicateInsert } from "@/lib/drills/mappers";

export type DrillActionState = {
  error?: string;
  fieldErrors?: Partial<Record<DrillFormField, string>>;
  values?: DrillFormValues;
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

export async function createDrill(_: DrillActionState, formData: FormData): Promise<DrillActionState> {
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

  try {
    await upsertDrillGraphic(supabase, user.id, data.id, parsed.graphic);
  } catch (graphicError) {
    return {
      error: graphicError instanceof Error ? graphicError.message : "The drill was created, but the graphic could not be saved.",
      submissionId: Date.now()
    };
  }

  revalidatePath("/drills");
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

  try {
    await upsertDrillGraphic(supabase, user.id, drillId, parsed.graphic);
  } catch (graphicError) {
    return {
      error: graphicError instanceof Error ? graphicError.message : "The drill details were saved, but the graphic could not be saved.",
      submissionId: Date.now()
    };
  }

  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
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

  try {
    await upsertDrillGraphic(supabase, user.id, data.id, parsed.graphic);
  } catch (graphicError) {
    return {
      error: graphicError instanceof Error ? graphicError.message : "The drill draft was created, but the graphic could not be saved.",
      values: parsed.values,
      submissionId: Date.now()
    };
  }

  revalidatePath("/drills");
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

  try {
    await upsertDrillGraphic(supabase, user.id, drillId, parsed.graphic);
  } catch (graphicError) {
    return {
      error: graphicError instanceof Error ? graphicError.message : "The drill draft was saved, but the graphic could not be saved.",
      values: parsed.values,
      submissionId: Date.now()
    };
  }

  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
  redirect(returnTo || "/drills?view=drafts");
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
    const graphic = await getDrillGraphic(supabase, user.id, drillId);
    await upsertDrillGraphic(supabase, user.id, data.id, graphic);
  }

  revalidatePath("/drills");
  redirect(data?.id ? `/drills/${data.id}/edit` : "/drills");
}

export async function toggleFavorite(formData: FormData) {
  const drillId = formString(formData, "drillId");
  const nextFavorite = formString(formData, "nextFavorite") === "true";
  const { supabase, user } = await requireUser();

  const db = supabase as unknown as SupabaseClient;
  await db
    .from("drills")
    .update({ is_favorite: nextFavorite })
    .eq("id", drillId)
    .eq("user_id", user.id);

  revalidatePath("/drills");
  revalidatePath(`/drills/${drillId}`);
}
