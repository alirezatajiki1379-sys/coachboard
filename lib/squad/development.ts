import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { ensureActiveSquad } from "@/lib/squad/squads";
import type { Database } from "@/types/database";
import type {
  PlayerDevelopmentGoal,
  PlayerDevelopmentGoalCategory,
  PlayerDevelopmentGoalPriority,
  PlayerDevelopmentGoalStatus,
  PlayerDevelopmentProgress,
  PlayerDevelopmentProgressUpdate,
  PlayerGoalAction,
  PlayerObservation,
  SquadPlayer
} from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type GoalRow = Database["public"]["Tables"]["player_development_goals"]["Row"];
type ActionRow = Database["public"]["Tables"]["player_goal_actions"]["Row"];
type ObservationRow = Database["public"]["Tables"]["player_observations"]["Row"];
type ProgressRow = Database["public"]["Tables"]["player_development_progress"]["Row"];

export type PlayerDevelopmentProfile = {
  goals: PlayerDevelopmentGoal[];
  observations: PlayerObservation[];
  timeline: DevelopmentTimelineItem[];
};

export type DevelopmentTimelineItem = {
  id: string;
  date: string;
  type: "goal_created" | "goal_achieved" | "observation" | "review" | "progress";
  title: string;
  detail?: string;
};

export type DevelopmentDashboardSummary = {
  playersTotal: number;
  playersWithActiveGoals: number;
  playersWithoutActiveGoals: number;
  goalsDueForReview: number;
  activeHighPriorityGoals: number;
  observationsThisWeek: number;
};

export type DevelopmentOverviewPlayer = {
  player: Pick<SquadPlayer, "id" | "firstName" | "lastName" | "position" | "playerType">;
  goals: PlayerDevelopmentGoal[];
  activeGoals: PlayerDevelopmentGoal[];
  latestGoal?: PlayerDevelopmentGoal;
  latestProgress?: PlayerDevelopmentProgressUpdate;
  nextReviewDate?: string;
  lastDevelopmentUpdate?: string;
  highPriorityGoalCount: number;
};

export type DevelopmentOverviewData = {
  players: DevelopmentOverviewPlayer[];
  stats: DevelopmentDashboardSummary;
};

export const activeGoalStatuses: PlayerDevelopmentGoalStatus[] = ["identified", "in_progress"];

export async function getPlayerDevelopmentProfile(supabase: SupabaseServerClient, userId: string, playerId: string): Promise<PlayerDevelopmentProfile> {
  const db = supabase as unknown as SupabaseClient;
  try {
    const { data: playerData, error: playerError } = await db
      .from("squad_players")
      .select("id,squad_id")
      .eq("user_id", userId)
      .eq("id", playerId)
      .maybeSingle();
    if (playerError || !playerData) return emptyProfile();

    const [goalsResult, actionsResult, observationsResult, progressResult] = await Promise.all([
      db.from("player_development_goals").select("*").eq("user_id", userId).eq("player_id", playerId).eq("squad_id", playerData.squad_id).order("updated_at", { ascending: false }),
      db.from("player_goal_actions").select("*, player_development_goals!inner(player_id,squad_id)").eq("user_id", userId).eq("player_development_goals.player_id", playerId).eq("player_development_goals.squad_id", playerData.squad_id).order("created_at", { ascending: true }),
      db.from("player_observations").select("*").eq("user_id", userId).eq("player_id", playerId).order("observation_date", { ascending: false }).order("created_at", { ascending: false }),
      db.from("player_development_progress").select("*, squad_training_events(label,date)").eq("user_id", userId).eq("player_id", playerId).eq("squad_id", playerData.squad_id).order("recorded_at", { ascending: false }).order("created_at", { ascending: false })
    ]);
    if (goalsResult.error || actionsResult.error || observationsResult.error || progressResult.error) return emptyProfile();

    const actionsByGoal = new Map<string, PlayerGoalAction[]>();
    for (const row of (actionsResult.data ?? []) as Array<ActionRow & { player_development_goals?: { player_id: string; squad_id: string } }>) {
      const mapped = mapActionRow(row);
      actionsByGoal.set(mapped.goalId, [...(actionsByGoal.get(mapped.goalId) ?? []), mapped]);
    }

    const observations = ((observationsResult.data ?? []) as ObservationRow[]).map(mapObservationRow);
    const observationsByGoal = new Map<string, PlayerObservation[]>();
    for (const observation of observations) {
      if (!observation.goalId) continue;
      observationsByGoal.set(observation.goalId, [...(observationsByGoal.get(observation.goalId) ?? []), observation]);
    }

    const progressRows = ((progressResult.data ?? []) as Array<ProgressRow & { squad_training_events?: { label: string | null; date: string | null } | null }>).map(mapProgressRow);
    const progressByGoal = new Map<string, PlayerDevelopmentProgressUpdate[]>();
    for (const progress of progressRows) {
      progressByGoal.set(progress.goalId, [...(progressByGoal.get(progress.goalId) ?? []), progress]);
    }

    const goals = ((goalsResult.data ?? []) as GoalRow[]).map((goal) => ({
      ...mapGoalRow(goal),
      actions: actionsByGoal.get(goal.id) ?? [],
      observations: observationsByGoal.get(goal.id) ?? [],
      progressUpdates: progressByGoal.get(goal.id) ?? []
    }));

    return { goals, observations, timeline: buildDevelopmentTimeline(goals, observations) };
  } catch {
    return emptyProfile();
  }
}

export async function getDevelopmentOverview(
  supabase: SupabaseServerClient,
  userId: string,
  filters: { status?: string; category?: string; priority?: string; review?: string; search?: string; sort?: string; direction?: string }
): Promise<DevelopmentOverviewData> {
  const db = supabase as unknown as SupabaseClient;
  try {
    const activeSquad = await ensureActiveSquad(supabase, userId);
    const { data: playerData, error: playerError } = await db
      .from("squad_players")
      .select("id,first_name,last_name,position,player_type")
      .eq("user_id", userId)
      .eq("squad_id", activeSquad.id)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    if (playerError) return { players: [], stats: emptyDashboardSummary() };

    const players = ((playerData ?? []) as Array<{ id: string; first_name: string; last_name: string | null; position: string | null; player_type: "roster" | "trial" }>).map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name ?? undefined,
      position: row.position ?? undefined,
      playerType: row.player_type
    }));

    const playerIds = players.map((player) => player.id);
    const [goalsResult, progressResult, observationsResult] = await Promise.all([
      playerIds.length
        ? db.from("player_development_goals").select("*").eq("user_id", userId).eq("squad_id", activeSquad.id).in("player_id", playerIds).order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      playerIds.length
        ? db.from("player_development_progress").select("*, squad_training_events(label,date)").eq("user_id", userId).eq("squad_id", activeSquad.id).in("player_id", playerIds).order("recorded_at", { ascending: false }).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      db.from("player_observations").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("observation_date", startOfWeekDate())
    ]);
    if (goalsResult.error || progressResult.error || observationsResult.error) return { players: [], stats: emptyDashboardSummary() };

    const progressByGoal = new Map<string, PlayerDevelopmentProgressUpdate[]>();
    for (const row of (progressResult.data ?? []) as Array<ProgressRow & { squad_training_events?: { label: string | null; date: string | null } | null }>) {
      const progress = mapProgressRow(row);
      progressByGoal.set(progress.goalId, [...(progressByGoal.get(progress.goalId) ?? []), progress]);
    }

    const goalsByPlayer = new Map<string, PlayerDevelopmentGoal[]>();
    for (const row of (goalsResult.data ?? []) as GoalRow[]) {
      const goal = { ...mapGoalRow(row), actions: [], observations: [], progressUpdates: progressByGoal.get(row.id) ?? [] };
      goalsByPlayer.set(goal.playerId, [...(goalsByPlayer.get(goal.playerId) ?? []), goal]);
    }

    const today = todayDate();
    const overviewPlayers = players
      .map((player) => {
        const goals = goalsByPlayer.get(player.id) ?? [];
        const activeGoals = goals.filter(isActiveGoal);
        const latestGoal = [...goals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        const latestProgress = goals.flatMap((goal) => goal.progressUpdates).sort((a, b) => `${b.recordedAt} ${b.createdAt}`.localeCompare(`${a.recordedAt} ${a.createdAt}`))[0];
        const nextReviewDate = activeGoals.map((goal) => goal.reviewDate).filter((date): date is string => Boolean(date)).sort()[0];
        const lastDevelopmentUpdate = [latestGoal?.updatedAt.slice(0, 10), latestProgress?.recordedAt].filter((date): date is string => Boolean(date)).sort().at(-1);
        return {
          player,
          goals,
          activeGoals,
          latestGoal,
          latestProgress,
          nextReviewDate,
          lastDevelopmentUpdate,
          highPriorityGoalCount: activeGoals.filter((goal) => goal.priority === "high").length
        };
      })
      .filter((item) => {
        if (filters.status === "active" && !item.activeGoals.length) return false;
        if (filters.status === "none" && item.activeGoals.length) return false;
        if (filters.status && ["identified", "in_progress", "achieved", "paused"].includes(filters.status) && !item.goals.some((goal) => goal.status === filters.status)) return false;
        if (filters.priority === "high" && item.highPriorityGoalCount === 0) return false;
        if (filters.priority && filters.priority !== "high" && !item.goals.some((goal) => goal.priority === filters.priority)) return false;
        if (filters.category && !item.goals.some((goal) => goal.category === filters.category)) return false;
        if (filters.review === "due" && !item.activeGoals.some((goal) => goal.reviewDate && goal.reviewDate <= today)) return false;
        if (filters.review === "soon" && !item.activeGoals.some((goal) => goal.reviewDate && goal.reviewDate > today && goal.reviewDate <= addDays(7))) return false;
        if (filters.search) {
          const haystack = `${item.player.firstName} ${item.player.lastName ?? ""} ${item.player.position ?? ""} ${item.goals.map((goal) => `${goal.title} ${goal.successCriteria}`).join(" ")}`.toLowerCase();
          if (!haystack.includes(filters.search.toLowerCase())) return false;
        }
        return true;
      });

    const sorted = sortOverviewPlayers(overviewPlayers, filters.sort, filters.direction);
    const allGoals = Array.from(goalsByPlayer.values()).flat();
    return {
      players: sorted,
      stats: {
        playersTotal: players.length,
        playersWithActiveGoals: overviewPlayersFromAll(players, goalsByPlayer).filter((item) => item.activeGoals.length).length,
        playersWithoutActiveGoals: overviewPlayersFromAll(players, goalsByPlayer).filter((item) => !item.activeGoals.length).length,
        goalsDueForReview: allGoals.filter((goal) => isActiveGoal(goal) && goal.reviewDate && goal.reviewDate <= today).length,
        activeHighPriorityGoals: allGoals.filter((goal) => isActiveGoal(goal) && goal.priority === "high").length,
        observationsThisWeek: observationsResult.count ?? 0
      }
    };
  } catch {
    return { players: [], stats: emptyDashboardSummary() };
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
      .in("status", activeGoalStatuses)
      .order("review_date", { ascending: true, nullsFirst: false });
    if (error) return result;
    for (const row of (data ?? []) as GoalRow[]) {
      const goal = { ...mapGoalRow(row), actions: [], observations: [], progressUpdates: [] };
      result.set(goal.playerId, [...(result.get(goal.playerId) ?? []), goal]);
    }
    return result;
  } catch {
    return result;
  }
}

export async function getDevelopmentDashboardSummary(supabase: SupabaseServerClient, userId: string, squadId?: string): Promise<DevelopmentDashboardSummary> {
  const data = await getDevelopmentOverview(supabase, userId, { status: "all" });
  if (!squadId) return data.stats;
  return data.stats;
}

export function mapGoalRow(row: GoalRow): Omit<PlayerDevelopmentGoal, "actions" | "observations" | "progressUpdates"> {
  return {
    id: row.id,
    userId: row.user_id,
    squadId: row.squad_id,
    playerId: row.player_id,
    title: row.title,
    description: row.description ?? undefined,
    successCriteria: row.success_criteria,
    coachNotes: row.coach_notes ?? undefined,
    category: row.category,
    priority: row.priority,
    status: row.status,
    progress: row.progress,
    startDate: row.start_date,
    targetDate: row.target_date ?? undefined,
    reviewDate: row.review_date ?? undefined,
    completedAt: row.completed_at ?? undefined,
    achievedAt: row.achieved_at ?? undefined,
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

export function mapProgressRow(row: ProgressRow & { squad_training_events?: { label: string | null; date: string | null } | null }): PlayerDevelopmentProgressUpdate {
  return {
    id: row.id,
    userId: row.user_id,
    squadId: row.squad_id,
    playerId: row.player_id,
    goalId: row.goal_id,
    trainingEventId: row.training_event_id ?? undefined,
    trainingLabel: row.squad_training_events?.label ?? undefined,
    trainingDate: row.squad_training_events?.date ?? undefined,
    progressLevel: row.progress_level,
    note: row.note,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function isGoalCategory(value: FormDataEntryValue | null): value is PlayerDevelopmentGoalCategory {
  return typeof value === "string" && ["technical", "tactical", "physical", "mental", "other"].includes(value);
}

export function isGoalPriority(value: FormDataEntryValue | null): value is PlayerDevelopmentGoalPriority {
  return typeof value === "string" && ["low", "medium", "high"].includes(value);
}

export function isGoalStatus(value: FormDataEntryValue | null): value is PlayerDevelopmentGoalStatus {
  return typeof value === "string" && ["identified", "in_progress", "achieved", "paused"].includes(value);
}

export function isGoalProgress(value: FormDataEntryValue | null): value is PlayerDevelopmentProgress {
  return typeof value === "string" && ["needs_attention", "developing", "consistent", "achieved"].includes(value);
}

export function isActiveGoal(goal: Pick<PlayerDevelopmentGoal, "status">) {
  return activeGoalStatuses.includes(goal.status);
}

function buildDevelopmentTimeline(goals: PlayerDevelopmentGoal[], observations: PlayerObservation[]): DevelopmentTimelineItem[] {
  const items: DevelopmentTimelineItem[] = [];
  for (const goal of goals) {
    items.push({ id: `${goal.id}-created`, date: goal.startDate, type: "goal_created", title: "Goal created", detail: goal.title });
    if (goal.reviewDate && isActiveGoal(goal)) items.push({ id: `${goal.id}-review`, date: goal.reviewDate, type: "review", title: "Target review date", detail: goal.title });
    if (goal.achievedAt || goal.completedAt) items.push({ id: `${goal.id}-achieved`, date: (goal.achievedAt ?? goal.completedAt ?? "").slice(0, 10), type: "goal_achieved", title: "Goal achieved", detail: goal.title });
    for (const progress of goal.progressUpdates) {
      items.push({ id: progress.id, date: progress.recordedAt, type: "progress", title: `Progress: ${progress.progressLevel.replaceAll("_", " ")}`, detail: progress.note });
    }
  }
  for (const observation of observations) {
    items.push({ id: observation.id, date: observation.observationDate, type: "observation", title: "Observation added", detail: observation.note });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

function sortOverviewPlayers(players: DevelopmentOverviewPlayer[], sort = "nextReview", direction = "asc") {
  const modifier = direction === "desc" ? -1 : 1;
  return [...players].sort((a, b) => {
    const value = compareOverviewPlayer(a, b, sort);
    return value * modifier || playerName(a).localeCompare(playerName(b));
  });
}

function compareOverviewPlayer(a: DevelopmentOverviewPlayer, b: DevelopmentOverviewPlayer, sort: string) {
  if (sort === "player") return playerName(a).localeCompare(playerName(b));
  if (sort === "goals") return a.activeGoals.length - b.activeGoals.length;
  if (sort === "priority") return priorityRank(b) - priorityRank(a);
  if (sort === "lastUpdate") return (a.lastDevelopmentUpdate ?? "").localeCompare(b.lastDevelopmentUpdate ?? "");
  return (a.nextReviewDate ?? "9999-12-31").localeCompare(b.nextReviewDate ?? "9999-12-31");
}

function priorityRank(player: DevelopmentOverviewPlayer) {
  if (player.activeGoals.some((goal) => goal.priority === "high")) return 3;
  if (player.activeGoals.some((goal) => goal.priority === "medium")) return 2;
  if (player.activeGoals.some((goal) => goal.priority === "low")) return 1;
  return 0;
}

function playerName(item: DevelopmentOverviewPlayer) {
  return `${item.player.lastName ?? ""} ${item.player.firstName}`;
}

function overviewPlayersFromAll(players: DevelopmentOverviewPlayer["player"][], goalsByPlayer: Map<string, PlayerDevelopmentGoal[]>) {
  return players.map((player) => {
    const goals = goalsByPlayer.get(player.id) ?? [];
    return { player, goals, activeGoals: goals.filter(isActiveGoal) };
  });
}

function emptyProfile(): PlayerDevelopmentProfile {
  return { goals: [], observations: [], timeline: [] };
}

function emptyDashboardSummary(): DevelopmentDashboardSummary {
  return { playersTotal: 0, playersWithActiveGoals: 0, playersWithoutActiveGoals: 0, goalsDueForReview: 0, activeHighPriorityGoals: 0, observationsThisWeek: 0 };
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

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
