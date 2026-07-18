import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type {
  PlayerDevelopmentGoal,
  PlayerDevelopmentGoalCategory,
  PlayerDevelopmentGoalPriority,
  PlayerDevelopmentGoalStatus,
  PlayerDevelopmentProgress,
  PlayerGoalAction,
  PlayerObservation
} from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type GoalRow = Database["public"]["Tables"]["player_development_goals"]["Row"];
type ActionRow = Database["public"]["Tables"]["player_goal_actions"]["Row"];
type ObservationRow = Database["public"]["Tables"]["player_observations"]["Row"];

export type PlayerDevelopmentProfile = {
  goals: PlayerDevelopmentGoal[];
  observations: PlayerObservation[];
  timeline: DevelopmentTimelineItem[];
};

export type DevelopmentTimelineItem = {
  id: string;
  date: string;
  type: "goal_created" | "goal_completed" | "observation" | "review";
  title: string;
  detail?: string;
};

export type DevelopmentDashboardSummary = {
  playersNeedingReview: number;
  activeHighPriorityGoals: number;
  observationsThisWeek: number;
};

export async function getPlayerDevelopmentProfile(supabase: SupabaseServerClient, userId: string, playerId: string): Promise<PlayerDevelopmentProfile> {
  const db = supabase as unknown as SupabaseClient;
  try {
    const [goalsResult, actionsResult, observationsResult] = await Promise.all([
      db.from("player_development_goals").select("*").eq("user_id", userId).eq("player_id", playerId).order("created_at", { ascending: false }),
      db.from("player_goal_actions").select("*, player_development_goals!inner(player_id)").eq("user_id", userId).eq("player_development_goals.player_id", playerId).order("created_at", { ascending: true }),
      db.from("player_observations").select("*").eq("user_id", userId).eq("player_id", playerId).order("observation_date", { ascending: false }).order("created_at", { ascending: false })
    ]);
    if (goalsResult.error || actionsResult.error || observationsResult.error) return emptyProfile();

    const actionsByGoal = new Map<string, PlayerGoalAction[]>();
    for (const row of (actionsResult.data ?? []) as Array<ActionRow & { player_development_goals?: { player_id: string } }>) {
      const mapped = mapActionRow(row);
      actionsByGoal.set(mapped.goalId, [...(actionsByGoal.get(mapped.goalId) ?? []), mapped]);
    }

    const observations = ((observationsResult.data ?? []) as ObservationRow[]).map(mapObservationRow);
    const observationsByGoal = new Map<string, PlayerObservation[]>();
    for (const observation of observations) {
      if (!observation.goalId) continue;
      observationsByGoal.set(observation.goalId, [...(observationsByGoal.get(observation.goalId) ?? []), observation]);
    }

    const goals = ((goalsResult.data ?? []) as GoalRow[]).map((goal) => ({
      ...mapGoalRow(goal),
      actions: actionsByGoal.get(goal.id) ?? [],
      observations: observationsByGoal.get(goal.id) ?? []
    }));

    return { goals, observations, timeline: buildDevelopmentTimeline(goals, observations) };
  } catch {
    return emptyProfile();
  }
}

export async function getDevelopmentOverview(
  supabase: SupabaseServerClient,
  userId: string,
  filters: { status?: string; category?: string; priority?: string; review?: string; search?: string }
) {
  const db = supabase as unknown as SupabaseClient;
  try {
    const { data, error } = await db
      .from("player_development_goals")
      .select("*, squad_players!inner(first_name,last_name,position,player_type)")
      .eq("user_id", userId)
      .order("review_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (error) return { goals: [], stats: emptyDashboardSummary() };

    const today = todayDate();
    const endOfMonth = today.slice(0, 8) + String(daysInMonth(today)).padStart(2, "0");
    const goals = ((data ?? []) as Array<GoalRow & { squad_players?: { first_name: string; last_name: string | null; position: string | null; player_type: string } }>)
      .filter((row) => {
        if (filters.status && row.status !== filters.status) return false;
        if (filters.category && row.category !== filters.category) return false;
        if (filters.priority && row.priority !== filters.priority) return false;
        if (filters.review === "overdue" && (!row.review_date || row.review_date >= today || row.status !== "active")) return false;
        if (filters.review === "month" && (!row.review_date || row.review_date < today || row.review_date > endOfMonth || row.status !== "active")) return false;
        if (filters.search) {
          const haystack = `${row.title} ${row.description ?? ""} ${row.squad_players?.first_name ?? ""} ${row.squad_players?.last_name ?? ""}`.toLowerCase();
          if (!haystack.includes(filters.search.toLowerCase())) return false;
        }
        return true;
      })
      .map((row) => ({
        goal: mapGoalRow(row),
        playerName: [row.squad_players?.first_name, row.squad_players?.last_name].filter(Boolean).join(" "),
        playerPosition: row.squad_players?.position ?? undefined,
        playerType: row.squad_players?.player_type ?? "roster"
      }));

    return { goals, stats: await getDevelopmentDashboardSummary(supabase, userId) };
  } catch {
    return { goals: [], stats: emptyDashboardSummary() };
  }
}

export async function getActiveDevelopmentGoalsForPlayers(
  supabase: SupabaseServerClient,
  userId: string,
  playerIds: string[]
): Promise<Map<string, PlayerDevelopmentGoal[]>> {
  const result = new Map<string, PlayerDevelopmentGoal[]>();
  if (!playerIds.length) return result;
  const db = supabase as unknown as SupabaseClient;
  try {
    const { data, error } = await db
      .from("player_development_goals")
      .select("*")
      .eq("user_id", userId)
      .in("player_id", Array.from(new Set(playerIds)))
      .eq("status", "active")
      .order("review_date", { ascending: true, nullsFirst: false });
    if (error) return result;
    for (const row of (data ?? []) as GoalRow[]) {
      const goal = { ...mapGoalRow(row), actions: [], observations: [] };
      result.set(goal.playerId, [...(result.get(goal.playerId) ?? []), goal]);
    }
    return result;
  } catch {
    return result;
  }
}

export async function getDevelopmentDashboardSummary(supabase: SupabaseServerClient, userId: string): Promise<DevelopmentDashboardSummary> {
  const db = supabase as unknown as SupabaseClient;
  try {
    const today = todayDate();
    const weekStart = startOfWeekDate();
    const [reviewResult, highResult, observationsResult] = await Promise.all([
      db.from("player_development_goals").select("player_id", { count: "exact", head: false }).eq("user_id", userId).eq("status", "active").lte("review_date", today),
      db.from("player_development_goals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active").eq("priority", "high"),
      db.from("player_observations").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("observation_date", weekStart)
    ]);
    const reviewedPlayers = new Set(((reviewResult.data ?? []) as Array<{ player_id: string }>).map((row) => row.player_id));
    return {
      playersNeedingReview: reviewResult.error ? 0 : reviewedPlayers.size,
      activeHighPriorityGoals: highResult.error ? 0 : highResult.count ?? 0,
      observationsThisWeek: observationsResult.error ? 0 : observationsResult.count ?? 0
    };
  } catch {
    return emptyDashboardSummary();
  }
}

export function mapGoalRow(row: GoalRow): Omit<PlayerDevelopmentGoal, "actions" | "observations"> {
  return {
    id: row.id,
    userId: row.user_id,
    playerId: row.player_id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    priority: row.priority,
    status: row.status,
    progress: row.progress,
    startDate: row.start_date,
    targetDate: row.target_date ?? undefined,
    reviewDate: row.review_date ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapActionRow(row: ActionRow): PlayerGoalAction {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    description: row.description,
    completed: row.completed,
    dueDate: row.due_date ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapObservationRow(row: ObservationRow): PlayerObservation {
  return {
    id: row.id,
    userId: row.user_id,
    playerId: row.player_id,
    goalId: row.goal_id ?? undefined,
    eventId: row.event_id ?? undefined,
    observationDate: row.observation_date,
    category: row.category ?? undefined,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function isGoalCategory(value: FormDataEntryValue | null): value is PlayerDevelopmentGoalCategory {
  return typeof value === "string" && ["technique", "tactical_understanding", "decision_making", "physical", "mental", "communication", "leadership", "goalkeeping", "behaviour", "individual"].includes(value);
}

export function isGoalPriority(value: FormDataEntryValue | null): value is PlayerDevelopmentGoalPriority {
  return typeof value === "string" && ["low", "medium", "high"].includes(value);
}

export function isGoalStatus(value: FormDataEntryValue | null): value is PlayerDevelopmentGoalStatus {
  return typeof value === "string" && ["active", "completed", "paused", "cancelled"].includes(value);
}

export function isGoalProgress(value: FormDataEntryValue | null): value is PlayerDevelopmentProgress {
  return typeof value === "string" && ["not_started", "in_progress", "almost_there", "completed"].includes(value);
}

function buildDevelopmentTimeline(goals: PlayerDevelopmentGoal[], observations: PlayerObservation[]): DevelopmentTimelineItem[] {
  const items: DevelopmentTimelineItem[] = [];
  for (const goal of goals) {
    items.push({ id: `${goal.id}-created`, date: goal.startDate, type: "goal_created", title: "Goal created", detail: goal.title });
    if (goal.reviewDate && goal.status === "active") items.push({ id: `${goal.id}-review`, date: goal.reviewDate, type: "review", title: "Coach review", detail: goal.title });
    if (goal.completedAt) items.push({ id: `${goal.id}-completed`, date: goal.completedAt.slice(0, 10), type: "goal_completed", title: "Goal completed", detail: goal.title });
  }
  for (const observation of observations) {
    items.push({ id: observation.id, date: observation.observationDate, type: "observation", title: "Observation added", detail: observation.note });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

function emptyProfile(): PlayerDevelopmentProfile {
  return { goals: [], observations: [], timeline: [] };
}

function emptyDashboardSummary(): DevelopmentDashboardSummary {
  return { playersNeedingReview: 0, activeHighPriorityGoals: 0, observationsThisWeek: 0 };
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeekDate() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(date: string) {
  const [year, month] = date.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month, 0).getDate();
}
