"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PlayerCoachAssessmentValue } from "@/types/domain";

const assessmentValues: PlayerCoachAssessmentValue[] = [
  "decision_open",
  "continue_observing",
  "positive_development",
  "prospect_player",
  "squad_candidate",
  "below_required_level"
];

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: string) {
  return value ? value : null;
}

export async function createPlayerCoachAssessment(formData: FormData) {
  const playerId = formString(formData, "playerId");
  const assessment = formString(formData, "assessment") as PlayerCoachAssessmentValue;
  const assessmentDate = formString(formData, "assessmentDate");
  const reviewDate = formString(formData, "reviewDate");
  const returnTo = formString(formData, "returnTo") || `/squad/players/${playerId}`;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!playerId || !assessmentValues.includes(assessment)) redirect(returnTo);

  const db = supabase as unknown as SupabaseClient;
  const { data: player, error: playerError } = await db
    .from("squad_players")
    .select("id")
    .eq("id", playerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (!player) redirect(returnTo);

  const { error } = await db.from("player_coach_assessments").insert({
    user_id: user.id,
    player_id: playerId,
    assessment,
    reason: optional(formString(formData, "reason")),
    assessment_date: assessmentDate || new Date().toISOString().slice(0, 10),
    review_date: optional(reviewDate)
  });
  if (error) throw new Error(error.message);

  revalidatePath("/squad/analysis");
  revalidatePath(`/squad/players/${playerId}`);
  revalidatePath(`/squad/players/${playerId}/report`);
  redirect(returnTo);
}
