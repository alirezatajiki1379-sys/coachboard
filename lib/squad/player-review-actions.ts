"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { PlayerConversationType } from "@/lib/squad/player-review-conversations";

export async function savePlayerConversationDraft(formData: FormData) {
  return persistConversation(formData, false);
}

export async function completePlayerConversation(formData: FormData) {
  return persistConversation(formData, true);
}

async function persistConversation(formData: FormData, complete: boolean) {
  const playerId = text(formData, "playerId");
  const existingId = text(formData, "conversationId");
  const locale = text(formData, "locale") === "de" ? "de" : "en";
  const periodStart = date(text(formData, "periodStart"));
  const periodEnd = date(text(formData, "periodEnd"));
  const conversationDate = date(text(formData, "conversationDate"));
  if (!playerId || !periodStart || !periodEnd || !conversationDate || periodEnd < periodStart) {
    redirect(reportHref(playerId, existingId, locale === "de" ? "Bitte prüfe Gesprächsdatum und Berichtszeitraum." : "Check the conversation date and report period."));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const db = supabase as unknown as SupabaseClient;
  const { data: player } = await db.from("squad_players").select("id,squad_id").eq("id", playerId).eq("user_id", user.id).maybeSingle();
  if (!player?.squad_id) redirect(reportHref(playerId, existingId, locale === "de" ? "Der Spieler ist keiner Mannschaft zugeordnet." : "The player is not assigned to a Team."));

  if (existingId) {
    const { data: existing } = await db.from("player_review_conversations").select("id,status").eq("id", existingId).eq("player_id", playerId).eq("user_id", user.id).maybeSingle();
    if (!existing || existing.status === "finalized") redirect(reportHref(playerId, existingId, locale === "de" ? "Ein abgeschlossenes Gespräch kann nicht verändert werden." : "A completed conversation cannot be changed."));
  }

  const requestedNoteIds = formData.getAll("note").filter((value): value is string => typeof value === "string");
  const requestedObservationIds = formData.getAll("observation").filter((value): value is string => typeof value === "string");
  const selectedNotes = requestedNoteIds.length ? await db.from("player_notes").select("id,user_id,squad_id,player_id,note,note_date,visibility,pinned,created_at,updated_at").eq("user_id", user.id).eq("player_id", playerId).eq("visibility", "conversation_eligible").in("id", requestedNoteIds) : { data: [], error: null };
  if (selectedNotes.error) redirect(reportHref(playerId, existingId, locale === "de" ? "Die ausgewählten Notizen konnten nicht geprüft werden." : "Selected notes could not be verified."));
  const selectedNoteIds = (selectedNotes.data ?? []).map((note) => note.id as string);
  const selectedObservations = requestedObservationIds.length ? await db.from("player_observations").select("id,user_id,player_id,goal_id,event_id,observation_date,category,note,created_at,updated_at").eq("user_id", user.id).eq("player_id", playerId).in("id", requestedObservationIds) : { data: [], error: null };
  if (selectedObservations.error) redirect(reportHref(playerId, existingId, locale === "de" ? "Die ausgewählten Beobachtungen konnten nicht geprüft werden." : "Selected observations could not be verified."));
  const selectedObservationIds = (selectedObservations.data ?? []).map((observation) => observation.id as string);
  const sections = Object.fromEntries(["attendance", "absenceReasons", "availability", "performance", "developmentGoals", "observations", "playerNotes"].map((key) => [key, formData.get(key) === "1"]));
  const conversationType = parseConversationType(text(formData, "conversationType"));
  const reportVersion = 1;
  const contentSnapshot = complete ? snapshot(formData, sections, selectedNoteIds, selectedObservationIds, selectedNotes.data ?? [], selectedObservations.data ?? []) : {};
  const payload = {
    user_id: user.id,
    squad_id: player.squad_id,
    player_id: playerId,
    report_type: "player_conversation",
    period_start: periodStart,
    period_end: periodEnd,
    title: conversationTitle(conversationType),
    strengths: nullable(formData, "strengths"),
    development_focus: nullable(formData, "developmentFocus"),
    player_perspective: nullable(formData, "playerPerspective"),
    agreed_next_steps: nullable(formData, "agreedNextSteps"),
    next_review_on: date(text(formData, "nextReviewOn")) ?? null,
    section_options: {
      conversationDate,
      conversationType,
      coachSummary: text(formData, "coachSummary") || null,
      selectedObservationIds,
      sections,
      reportVersion
    },
    content_snapshot: contentSnapshot,
    status: complete ? "finalized" : "draft",
    finalized_at: complete ? new Date().toISOString() : null
  };

  let conversationId = existingId;
  if (existingId) {
    const { error } = await db.from("player_review_conversations").update(payload).eq("id", existingId).eq("user_id", user.id).eq("status", "draft");
    if (error) redirect(reportHref(playerId, existingId, locale === "de" ? "Das Gespräch konnte nicht gespeichert werden." : "The conversation could not be saved."));
  } else {
    const { data, error } = await db.from("player_review_conversations").insert(payload).select("id").single();
    if (error || !data) redirect(reportHref(playerId, undefined, locale === "de" ? "Das Gespräch konnte nicht gespeichert werden." : "The conversation could not be saved."));
    conversationId = data.id as string;
  }

  const { error: clearError } = await db.from("player_review_conversation_notes").delete().eq("conversation_id", conversationId).eq("user_id", user.id);
  if (clearError) redirect(reportHref(playerId, conversationId, locale === "de" ? "Die ausgewählten Notizen konnten nicht gespeichert werden." : "Selected notes could not be saved."));
  if (selectedNoteIds.length) {
    const { error: noteError } = await db.from("player_review_conversation_notes").insert(selectedNoteIds.map((noteId) => ({ conversation_id: conversationId, note_id: noteId, user_id: user.id })));
    if (noteError) redirect(reportHref(playerId, conversationId, locale === "de" ? "Die ausgewählten Notizen konnten nicht gespeichert werden." : "Selected notes could not be saved."));
  }
  if (complete) {
    await db.from("squad_players").update({ last_performance_review_date: conversationDate }).eq("id", playerId).eq("user_id", user.id);
  }

  revalidatePath(`/squad/players/${playerId}`);
  revalidatePath(`/squad/players/${playerId}/report`);
  redirect(`/squad/players/${playerId}/report?conversation=${conversationId}&saved=${complete ? "completed" : "draft"}`);
}

function snapshot(formData: FormData, sections: Record<string, boolean>, selectedNoteIds: string[], selectedObservationIds: string[], notes: Array<Record<string, unknown>>, observations: Array<Record<string, unknown>>): Json {
  const value = formData.get("reportSnapshot");
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, Json | undefined>;
    const development = parsed.development && typeof parsed.development === "object" && !Array.isArray(parsed.development) ? parsed.development as Record<string, Json | undefined> : {};
    return {
      ...parsed,
      development: {
        ...development,
        observations: observations.map((observation) => ({
          id: observation.id,
          userId: observation.user_id,
          playerId: observation.player_id,
          goalId: observation.goal_id,
          eventId: observation.event_id,
          observationDate: observation.observation_date,
          category: observation.category,
          note: observation.note,
          createdAt: observation.created_at,
          updatedAt: observation.updated_at
        })) as Json
      },
      sections,
      selectedNoteIds,
      selectedObservationIds,
      notes: notes.map((note) => ({
        id: note.id,
        userId: note.user_id,
        squadId: note.squad_id,
        playerId: note.player_id,
        note: note.note,
        noteDate: note.note_date,
        visibility: note.visibility,
        pinned: note.pinned,
        createdAt: note.created_at,
        updatedAt: note.updated_at
      })) as Json,
      conversation: {
        strengths: text(formData, "strengths"),
        developmentFocus: text(formData, "developmentFocus"),
        playerPerspective: text(formData, "playerPerspective"),
        coachSummary: text(formData, "coachSummary"),
        agreedNextSteps: text(formData, "agreedNextSteps"),
        nextReviewOn: date(text(formData, "nextReviewOn")) ?? null,
        conversationDate: date(text(formData, "conversationDate")) ?? null,
        conversationType: parseConversationType(text(formData, "conversationType"))
      }
    };
  } catch {
    return {};
  }
}

function parseConversationType(value: string): PlayerConversationType {
  return value === "trial_feedback" || value === "general" || value === "season_review" ? value : "development_review";
}

function conversationTitle(value: PlayerConversationType) {
  return value === "trial_feedback" ? "Trial feedback" : value === "season_review" ? "Season review" : value === "general" ? "General conversation" : "Development review";
}

function reportHref(playerId: string, conversationId?: string, error?: string) {
  const query = new URLSearchParams();
  if (conversationId) query.set("conversation", conversationId);
  if (error) query.set("reportError", error);
  return `/squad/players/${playerId}/report?${query.toString()}`;
}

function nullable(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function date(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
