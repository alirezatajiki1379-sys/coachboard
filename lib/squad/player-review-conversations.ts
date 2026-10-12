import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/database";

export type PlayerConversationType = "development_review" | "trial_feedback" | "general" | "season_review";
export type PlayerConversationStatus = "draft" | "finalized";

export type PlayerConversationOptions = {
  conversationDate?: string;
  conversationType: PlayerConversationType;
  coachSummary?: string;
  selectedObservationIds: string[];
  sections?: Record<string, boolean>;
  reportVersion: number;
};

export type PlayerReviewConversation = {
  id: string;
  playerId: string;
  squadId: string;
  reportType: "player_conversation" | "internal_coach_report";
  periodStart: string;
  periodEnd: string;
  title?: string;
  strengths?: string;
  developmentFocus?: string;
  playerPerspective?: string;
  coachSummary?: string;
  agreedNextSteps?: string;
  nextReviewOn?: string;
  conversationDate: string;
  conversationType: PlayerConversationType;
  selectedObservationIds: string[];
  selectedNoteIds: string[];
  sections?: Record<string, boolean>;
  reportVersion: number;
  contentSnapshot: Json;
  status: PlayerConversationStatus;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationRow = {
  id: string;
  player_id: string;
  squad_id: string;
  report_type: "player_conversation" | "internal_coach_report";
  period_start: string;
  period_end: string;
  title: string | null;
  strengths: string | null;
  development_focus: string | null;
  player_perspective: string | null;
  agreed_next_steps: string | null;
  next_review_on: string | null;
  section_options: Json;
  content_snapshot: Json;
  status: PlayerConversationStatus;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listPlayerReviewConversations(db: SupabaseClient, userId: string, playerId: string) {
  const { data, error } = await db
    .from("player_review_conversations")
    .select("id,player_id,squad_id,report_type,period_start,period_end,title,strengths,development_focus,player_perspective,agreed_next_steps,next_review_on,section_options,content_snapshot,status,finalized_at,created_at,updated_at")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .order("finalized_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ConversationRow[];
  const noteIdsByConversation = await conversationNoteIds(db, userId, rows.map((row) => row.id));
  return rows.map((row) => mapConversation(row, noteIdsByConversation.get(row.id) ?? []));
}

export async function getPlayerReviewConversation(db: SupabaseClient, userId: string, conversationId: string) {
  const { data, error } = await db
    .from("player_review_conversations")
    .select("id,player_id,squad_id,report_type,period_start,period_end,title,strengths,development_focus,player_perspective,agreed_next_steps,next_review_on,section_options,content_snapshot,status,finalized_at,created_at,updated_at")
    .eq("user_id", userId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const noteIds = await conversationNoteIds(db, userId, [conversationId]);
  return mapConversation(data as ConversationRow, noteIds.get(conversationId) ?? []);
}

export function latestCompletedConversation(conversations: PlayerReviewConversation[]) {
  return conversations
    .filter((conversation) => conversation.status === "finalized")
    .sort((a, b) => b.conversationDate.localeCompare(a.conversationDate) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

function mapConversation(row: ConversationRow, selectedNoteIds: string[]): PlayerReviewConversation {
  const options = parseOptions(row.section_options);
  return {
    id: row.id,
    playerId: row.player_id,
    squadId: row.squad_id,
    reportType: row.report_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    title: row.title ?? undefined,
    strengths: row.strengths ?? undefined,
    developmentFocus: row.development_focus ?? undefined,
    playerPerspective: row.player_perspective ?? undefined,
    coachSummary: options.coachSummary,
    agreedNextSteps: row.agreed_next_steps ?? undefined,
    nextReviewOn: row.next_review_on ?? undefined,
    conversationDate: options.conversationDate ?? (row.finalized_at ?? row.created_at).slice(0, 10),
    conversationType: options.conversationType,
    selectedObservationIds: options.selectedObservationIds,
    selectedNoteIds,
    sections: options.sections,
    reportVersion: options.reportVersion,
    contentSnapshot: row.content_snapshot,
    status: row.status,
    finalizedAt: row.finalized_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseOptions(value: Json): PlayerConversationOptions {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
  const rawType = object.conversationType;
  const conversationType: PlayerConversationType = rawType === "trial_feedback" || rawType === "general" || rawType === "season_review" ? rawType : "development_review";
  const selectedObservationIds = Array.isArray(object.selectedObservationIds)
    ? object.selectedObservationIds.filter((item): item is string => typeof item === "string")
    : [];
  const rawSections = object.sections;
  const sections = rawSections && typeof rawSections === "object" && !Array.isArray(rawSections)
    ? Object.fromEntries(Object.entries(rawSections).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"))
    : undefined;
  return {
    conversationDate: typeof object.conversationDate === "string" ? object.conversationDate : undefined,
    conversationType,
    coachSummary: typeof object.coachSummary === "string" ? object.coachSummary : undefined,
    selectedObservationIds,
    sections,
    reportVersion: typeof object.reportVersion === "number" ? object.reportVersion : 1
  };
}

async function conversationNoteIds(db: SupabaseClient, userId: string, conversationIds: string[]) {
  const result = new Map<string, string[]>();
  if (!conversationIds.length) return result;
  const { data, error } = await db
    .from("player_review_conversation_notes")
    .select("conversation_id,note_id")
    .eq("user_id", userId)
    .in("conversation_id", conversationIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const ids = result.get(row.conversation_id as string) ?? [];
    ids.push(row.note_id as string);
    result.set(row.conversation_id as string, ids);
  }
  return result;
}
