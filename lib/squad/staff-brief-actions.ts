"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type StaffBriefActionState = { ok: boolean; message: string };
type BriefingPayload = {
  eventId: string;
  sections: Array<{ id: string; text: string }>;
  drills: Array<{ id: string; text: string }>;
};

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parsePayload(formData: FormData): BriefingPayload | undefined {
  try {
    const payload = JSON.parse(formString(formData, "briefingPayload")) as BriefingPayload;
    if (!payload?.eventId || !Array.isArray(payload.sections) || !Array.isArray(payload.drills)) return undefined;
    if ([...payload.sections, ...payload.drills].some((item) => !item.id || typeof item.text !== "string" || item.text.length > 2000)) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

export async function saveStaffBriefContent(
  _previous: StaffBriefActionState,
  formData: FormData
): Promise<StaffBriefActionState> {
  const payload = parsePayload(formData);
  if (!payload) return { ok: false, message: "Check the Briefing text and try again." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const db = supabase as unknown as SupabaseClient;
  const { data: event, error: eventError } = await db
    .from("squad_training_events")
    .select("id")
    .eq("id", payload.eventId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (eventError || !event) return { ok: false, message: "Training is not available." };

  const [sectionResult, drillResult] = await Promise.all([
    db.from("training_section_briefs").select("id").eq("user_id", user.id).eq("event_id", payload.eventId),
    db.from("training_session_drill_instances").select("id,override_json").eq("user_id", user.id).eq("event_id", payload.eventId).neq("status", "removed")
  ]);
  if (sectionResult.error || drillResult.error) return { ok: false, message: "Briefing content could not be loaded." };
  const sectionIds = new Set((sectionResult.data ?? []).map((row) => row.id as string));
  const drillById = new Map((drillResult.data ?? []).map((row) => [row.id as string, row.override_json as Json]));
  if (payload.sections.some((item) => !sectionIds.has(item.id)) || payload.drills.some((item) => !drillById.has(item.id))) {
    return { ok: false, message: "The Session Plan changed. Reload the Brief before saving." };
  }

  const sectionUpdates = payload.sections.map((item) => db
    .from("training_section_briefs")
    .update({ briefing_text: item.text.trim() || null })
    .eq("id", item.id)
    .eq("user_id", user.id)
    .eq("event_id", payload.eventId));
  const drillUpdates = payload.drills.map((item) => {
    const current = drillById.get(item.id);
    const override = current && typeof current === "object" && !Array.isArray(current) ? current : {};
    return db
      .from("training_session_drill_instances")
      .update({ override_json: { ...override, briefingText: item.text.trim() || null } })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .eq("event_id", payload.eventId);
  });
  const results = await Promise.all([...sectionUpdates, ...drillUpdates]);
  if (results.some((result) => result.error)) return { ok: false, message: "Briefing text could not be saved. Your edits are still here." };
  revalidatePath(`/trainings/${payload.eventId}/brief`);
  revalidatePath(`/trainings/${payload.eventId}/plan`);
  return { ok: true, message: "Briefing text saved." };
}
