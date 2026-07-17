import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { mapDrillRow, type DrillRow } from "@/lib/drills/mappers";
import { parseEditorState } from "@/lib/drills/editor";
import { calculateSessionDuration, normalizePlayerGroups, normalizeSimultaneousGroup } from "@/lib/sessions/utils";
import type { Database, Json } from "@/types/database";
import type { Drill, TrainingSession, TrainingSessionDrill } from "@/types/domain";
import type { DrillEditorState } from "@/types/editor";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type SessionRow = Database["public"]["Tables"]["training_sessions"]["Row"];
type SessionDrillRow = Database["public"]["Tables"]["training_session_drills"]["Row"];

export type SessionDrillDetail = TrainingSessionDrill & {
  drill: Drill;
  graphic?: DrillEditorState;
};

export type TrainingSessionDetail = Omit<TrainingSession, "drills"> & {
  drills: SessionDrillDetail[];
};

export type SessionSummary = TrainingSession & {
  drillCount: number;
  totalDuration: number;
};

export type SessionListView = "active" | "archived" | "trash";

export function parseSessionListView(searchParams: Record<string, string | string[] | undefined>): SessionListView {
  const value = searchParams.view;
  const view = Array.isArray(value) ? value[0] : value;
  return view === "archived" || view === "trash" ? view : "active";
}

export async function listUserSessions(supabase: SupabaseServerClient, userId: string, view: SessionListView = "active"): Promise<SessionSummary[]> {
  const db = supabase as unknown as SupabaseClient;
  let query = db
    .from("training_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (view === "active") query = query.is("archived_at", null).is("deleted_at", null);
  if (view === "archived") query = query.not("archived_at", "is", null).is("deleted_at", null);
  if (view === "trash") query = query.not("deleted_at", "is", null);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SessionRow[];
  if (!rows.length) return [];

  const { data: itemData, error: itemError } = await db
    .from("training_session_drills")
    .select("*")
    .eq("user_id", userId)
    .in("session_id", rows.map((row) => row.id));

  if (itemError) throw new Error(itemError.message);
  const items = ((itemData ?? []) as SessionDrillRow[]).reduce<Record<string, SessionDrillRow[]>>((groups, item) => {
    groups[item.session_id] = [...(groups[item.session_id] ?? []), item];
    return groups;
  }, {});

  return rows.map((row) => {
    const drills = (items[row.id] ?? []).map(mapSessionDrillRow);
    return {
      ...mapSessionRow(row, drills),
      drillCount: drills.length,
      totalDuration: calculateSessionDuration(drills)
    };
  });
}

export async function getUserSession(
  supabase: SupabaseServerClient,
  userId: string,
  sessionId: string
): Promise<TrainingSessionDetail | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data: sessionData, error } = await db
    .from("training_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!sessionData) return null;

  const { data: itemData, error: itemError } = await db
    .from("training_session_drills")
    .select("*")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  if (itemError) throw new Error(itemError.message);
  const items = (itemData ?? []) as SessionDrillRow[];
  const drillIds = items.map((item) => item.drill_id);

  const [drillsById, graphicsByDrillId] = await Promise.all([
    getDrillsById(supabase, userId, drillIds),
    getGraphicsByDrillId(supabase, userId, drillIds)
  ]);

  const sessionDrills: SessionDrillDetail[] = [];
  for (const item of items) {
    const drill = drillsById.get(item.drill_id);
    if (!drill) continue;
    sessionDrills.push({
      ...mapSessionDrillRow(item),
      drill,
      graphic: graphicsByDrillId.get(item.drill_id)
    });
  }

  return {
    ...mapSessionRow(sessionData as SessionRow, []),
    drills: sessionDrills
  };
}

export async function getDrillsForSessionBuilder(supabase: SupabaseServerClient, userId: string) {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("drills")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  const drills = ((data ?? []) as DrillRow[]).map(mapDrillRow);
  const graphics = await getGraphicsByDrillId(supabase, userId, drills.map((drill) => drill.id));
  return drills.map((drill) => ({ ...drill, graphic: graphics.get(drill.id) }));
}

async function getDrillsById(supabase: SupabaseServerClient, userId: string, drillIds: string[]) {
  const drills = new Map<string, Drill>();
  if (!drillIds.length) return drills;
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db.from("drills").select("*").eq("user_id", userId).in("id", drillIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as DrillRow[]) {
    const drill = mapDrillRow(row);
    drills.set(drill.id, drill);
  }
  return drills;
}

async function getGraphicsByDrillId(supabase: SupabaseServerClient, userId: string, drillIds: string[]) {
  const graphics = new Map<string, DrillEditorState>();
  if (!drillIds.length) return graphics;
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("drill_graphics")
    .select("drill_id, canvas_json")
    .eq("user_id", userId)
    .in("drill_id", drillIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ drill_id: string; canvas_json: Json }>) {
    graphics.set(row.drill_id, parseEditorState(row.canvas_json));
  }
  return graphics;
}

function mapSessionRow(row: SessionRow, drills: TrainingSessionDrill[]): TrainingSession {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    date: row.session_date ?? undefined,
    startTime: row.start_time?.slice(0, 5) ?? undefined,
    teamAgeGroup: row.team_age_group as TrainingSession["teamAgeGroup"],
    mainFocus: row.main_focus as TrainingSession["mainFocus"],
    secondaryFocus: row.secondary_focus ?? undefined,
    expectedPlayers: row.expected_players ?? undefined,
    durationTargetMinutes: row.duration_target_minutes ?? undefined,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    playerGroups: normalizePlayerGroups(row.player_groups),
    drills,
    archivedAt: row.archived_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSessionDrillRow(row: SessionDrillRow): TrainingSessionDrill {
  return {
    id: row.id,
    drillId: row.drill_id,
    block: row.block as TrainingSessionDrill["block"],
    orderIndex: row.order_index,
    plannedDurationMinutes: row.planned_duration_minutes,
    coachNotes: row.coach_notes ?? undefined,
    timingMode: row.timing_mode ?? "sequential",
    simultaneousGroup: normalizeSimultaneousGroup(row.simultaneous_group),
    participatingGroups: row.participating_groups ?? undefined,
    startingGroup: row.starting_group ?? undefined
  };
}
