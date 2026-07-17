"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseSquadPlayerForm, toSquadPlayerUpdate, type SquadPlayerFormField, type SquadPlayerFormValues } from "@/lib/squad/form";

export type SquadPlayerActionState = {
  error?: string;
  fieldErrors?: Partial<Record<SquadPlayerFormField, string>>;
  values?: SquadPlayerFormValues;
  submissionId?: number;
};

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
  return typeof value === "string" ? value : "";
}

export async function createSquadPlayer(_: SquadPlayerActionState, formData: FormData): Promise<SquadPlayerActionState> {
  const parsed = parseSquadPlayerForm(formData);
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
    .from("squad_players")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();

  if (error) return { error: error.message, submissionId: Date.now() };

  revalidatePath("/squad");
  redirect(data?.id ? `/squad/players/${data.id}` : "/squad");
}

export async function updateSquadPlayer(_: SquadPlayerActionState, formData: FormData): Promise<SquadPlayerActionState> {
  const playerId = formString(formData, "playerId");
  if (!playerId) return { error: "Missing player id.", submissionId: Date.now() };

  const parsed = parseSquadPlayerForm(formData);
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
  const { error } = await db
    .from("squad_players")
    .update(toSquadPlayerUpdate(parsed.data))
    .eq("id", playerId)
    .eq("user_id", user.id);

  if (error) return { error: error.message, submissionId: Date.now() };

  revalidatePath("/squad");
  revalidatePath(`/squad/players/${playerId}`);
  redirect(`/squad/players/${playerId}`);
}

export async function archiveSquadPlayer(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await db
    .from("squad_players")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", playerId)
    .eq("user_id", user.id);
  revalidatePath("/squad");
  revalidatePath(`/squad/players/${playerId}`);
  redirect("/squad?view=archived");
}

export async function restoreSquadPlayer(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await db
    .from("squad_players")
    .update({ archived_at: null })
    .eq("id", playerId)
    .eq("user_id", user.id);
  revalidatePath("/squad");
  revalidatePath(`/squad/players/${playerId}`);
  redirect("/squad");
}
