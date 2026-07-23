import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { mapAttendanceRow, mapTrainingEventRow, type SquadAttendanceRow, type SquadTrainingEventRow } from "@/lib/squad/attendance-mappers";
import { createPlayerAnalyticsSummary, defaultSortDirection, isPastAttendanceEvent, sortPlayerAnalytics, type AnalyticsPeriod, type AnalyticsPlayerTypeFilter, type AnalyticsSortDirection, type AnalyticsSortKey, type PlayerAnalyticsRecord, type PlayerAnalyticsSummary } from "@/lib/squad/analytics";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import type { Database } from "@/types/database";
import type { PlayerCoachAssessment, SquadPlayer } from "@/types/domain";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AssessmentRow = Database["public"]["Tables"]["player_coach_assessments"]["Row"];

export type AnalyticsFilters = {
  period: AnalyticsPeriod;
  playerType: AnalyticsPlayerTypeFilter;
  position?: string;
  ratedOnly: boolean;
  sort: AnalyticsSortKey;
  direction: AnalyticsSortDirection;
  customFrom?: string;
  customTo?: string;
};

export function parseAnalyticsFilters(searchParams: Record<string, string | string[] | undefined>): AnalyticsFilters {
  const period = one(searchParams.period);
  const playerType = one(searchParams.playerType);
  const sort = one(searchParams.sort);
  const parsedSort: AnalyticsSortKey =
    sort === "position" ||
    sort === "status" ||
    sort === "trainings" ||
    sort === "rated" ||
    sort === "average" ||
    sort === "latestFive" ||
    sort === "trend" ||
    sort === "attendance" ||
    sort === "reliability" ||
    sort === "lastTraining" ||
    sort === "evidence" ||
    sort === "coachAssessment"
      ? sort
      : "name";
  const direction = one(searchParams.direction);
  return {
    period: period === "last5" || period === "last10" || period === "30d" || period === "90d" || period === "season" || period === "all" || period === "custom" ? period : "season",
    playerType: playerType === "roster" || playerType === "trial" ? playerType : "all",
    position: one(searchParams.position) || undefined,
    ratedOnly: one(searchParams.ratedOnly) === "true",
    customFrom: normalizeDateParam(one(searchParams.from)),
    customTo: normalizeDateParam(one(searchParams.to)),
    sort: parsedSort,
    direction: direction === "asc" || direction === "desc" ? direction : defaultSortDirection(parsedSort)
  };
}

export async function getSquadAnalyticsOverview(
  supabase: SupabaseServerClient,
  userId: string,
  filters: AnalyticsFilters
): Promise<{ summaries: PlayerAnalyticsSummary[]; positions: string[]; seasonSettings: { seasonStartMonth: number; seasonStartDay: number } }> {
  const db = supabase as unknown as SupabaseClient;
  const [players, records, assessments, seasonSettings] = await Promise.all([
    listAnalyticsPlayers(db, userId),
    listAnalyticsRecords(db, userId),
    listLatestAssessments(db, userId),
    getSeasonSettings(db, userId)
  ]);
  const assessmentByPlayer = new Map(assessments.map((assessment) => [assessment.playerId, assessment]));

  const positions = Array.from(new Set(players.map((player) => player.position).filter((position): position is string => Boolean(position)))).sort((a, b) => a.localeCompare(b));
  const filteredPlayers = players.filter((player) => {
    if (filters.playerType !== "all" && player.playerType !== filters.playerType) return false;
    if (filters.position && player.position !== filters.position) return false;
    return true;
  });
  const summaries = filteredPlayers
    .map((player) =>
      createPlayerAnalyticsSummary(
        player,
        records,
        filters.period,
        assessmentByPlayer.get(player.id),
        seasonSettings.seasonStartMonth,
        seasonSettings.seasonStartDay,
        filters.customFrom,
        filters.customTo
      )
    )
    .filter((summary) => (filters.ratedOnly ? summary.rated > 0 : true));

  return { summaries: sortPlayerAnalytics(summaries, filters.sort, filters.direction), positions, seasonSettings };
}

export async function getPlayerAnalytics(
  supabase: SupabaseServerClient,
  userId: string,
  playerId: string,
  period: AnalyticsPeriod,
  customFrom?: string,
  customTo?: string
): Promise<{ player: SquadPlayer; summary: PlayerAnalyticsSummary; assessmentHistory: PlayerCoachAssessment[] } | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data: playerData, error: playerError } = await db.from("squad_players").select("*").eq("user_id", userId).eq("id", playerId).maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (!playerData) return null;

  const [records, assessments, seasonSettings] = await Promise.all([
    listAnalyticsRecords(db, userId, playerId),
    listAssessmentsForPlayer(db, userId, playerId),
    getSeasonSettings(db, userId)
  ]);
  const player = mapSquadPlayerRow(playerData as SquadPlayerRow);
  return {
    player,
    summary: createPlayerAnalyticsSummary(player, records, period, assessments[0], seasonSettings.seasonStartMonth, seasonSettings.seasonStartDay, customFrom, customTo),
    assessmentHistory: assessments
  };
}

async function getSeasonSettings(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("profiles").select("season_start_month, season_start_day").eq("id", userId).maybeSingle();
  if (error) {
    return { seasonStartMonth: 7, seasonStartDay: 1 };
  }
  return {
    seasonStartMonth: typeof data?.season_start_month === "number" ? data.season_start_month : 7,
    seasonStartDay: typeof data?.season_start_day === "number" ? data.season_start_day : 1
  };
}

async function listAnalyticsPlayers(db: SupabaseClient, userId: string): Promise<SquadPlayer[]> {
  const { data, error } = await db
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);
}

async function listAnalyticsRecords(db: SupabaseClient, userId: string, playerId?: string): Promise<PlayerAnalyticsRecord[]> {
  let query = db
    .from("squad_attendance_records")
    .select("*, squad_training_events(*)")
    .eq("user_id", userId);
  if (playerId) query = query.eq("player_id", playerId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<SquadAttendanceRow & { squad_training_events?: SquadTrainingEventRow | null }>)
    .filter((row) => row.squad_training_events && !row.squad_training_events.deleted_at)
    .map((row) => ({
      ...mapAttendanceRow(row),
      event: row.squad_training_events ? mapTrainingEventRow(row.squad_training_events) : undefined
    }))
    .filter((record) => isPastAttendanceEvent(record.event));
}

async function listLatestAssessments(db: SupabaseClient, userId: string): Promise<PlayerCoachAssessment[]> {
  const { data, error } = await db
    .from("player_coach_assessments")
    .select("*")
    .eq("user_id", userId)
    .order("assessment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const latest = new Map<string, PlayerCoachAssessment>();
  for (const row of (data ?? []) as AssessmentRow[]) {
    if (!latest.has(row.player_id)) latest.set(row.player_id, mapAssessmentRow(row));
  }
  return Array.from(latest.values());
}

async function listAssessmentsForPlayer(db: SupabaseClient, userId: string, playerId: string): Promise<PlayerCoachAssessment[]> {
  const { data, error } = await db
    .from("player_coach_assessments")
    .select("*")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .order("assessment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AssessmentRow[]).map(mapAssessmentRow);
}

function mapAssessmentRow(row: AssessmentRow): PlayerCoachAssessment {
  return {
    id: row.id,
    userId: row.user_id,
    playerId: row.player_id,
    assessment: row.assessment,
    reason: row.reason ?? undefined,
    assessmentDate: row.assessment_date,
    reviewDate: row.review_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateParam(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
