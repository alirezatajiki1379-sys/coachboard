"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseSquadPlayerForm, toSquadPlayerUpdate, type SquadPlayerFormField, type SquadPlayerFormValues } from "@/lib/squad/form";
import { ensureActiveSquad } from "@/lib/squad/squads";

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
  const activeSquad = await ensureActiveSquad(supabase, user.id);
  const { data, error } = await db
    .from("squad_players")
    .insert({ ...parsed.data, user_id: user.id, squad_id: activeSquad.id })
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

export async function permanentlyDeleteSquadPlayer(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const typedName = formString(formData, "confirmName").trim().toLowerCase();
  const confirmed = formData.get("confirmDelete") === "on";
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;

  const { data: player, error: playerError } = await db
    .from("squad_players")
    .select("id, first_name, last_name")
    .eq("id", playerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (!player) redirect("/squad");

  const fullName = [player.first_name, player.last_name].filter(Boolean).join(" ").trim();
  if (!confirmed || typedName !== fullName.toLowerCase()) {
    redirect(`/squad/players/${playerId}?tab=details&deleteError=confirm`);
  }

  await db.from("player_import_rows").update({ player_id: null, matched_player_id: null }).eq("user_id", user.id).or(`player_id.eq.${playerId},matched_player_id.eq.${playerId}`);
  const { error } = await db.from("squad_players").delete().eq("id", playerId).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/squad");
  redirect("/squad");
}
