import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import {
  analyticsPeriodLabels,
  type AnalyticsPeriod,
  type PlayerAnalyticsRecord
} from "@/lib/squad/analytics";
import { getPlayerAnalytics } from "@/lib/squad/analytics-queries";
import { mapAttendanceRow, mapTrainingEventRow, type SquadAttendanceRow, type SquadTrainingEventRow } from "@/lib/squad/attendance-mappers";
import { formatEventDate, finalStatusLabel, plannedReasonLabel } from "@/lib/squad/attendance-format";
import { getPlayerDevelopmentProfile, type PlayerDevelopmentProfile } from "@/lib/squad/development";
import {
  mapPlayerContactRow,
  mapPlayerHeaderPreferencesRow,
  mapPlayerMedicalPeriodRow,
  mapSquadPlayerRow,
  type PlayerContactRow,
  type PlayerHeaderPreferencesRow,
  type PlayerMedicalPeriodRow,
  type SquadPlayerRow
} from "@/lib/squad/mappers";
import type {
  PlayerCoachAssessment,
  PlayerContact,
  PlayerHeaderPreferences,
  PlayerMedicalPeriod,
  PlayerMedicalPeriodType,
  SquadPlayer
} from "@/types/domain";
import type { Database } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AssessmentRow = Database["public"]["Tables"]["player_coach_assessments"]["Row"];

export type PlayerHubTab = "overview" | "analytics" | "development" | "history" | "attendance" | "medical" | "notes" | "details";
export type PlayerTimelineFilter = "all" | "trainings" | "ratings" | "attendance" | "development" | "observations" | "medical" | "coach";

export type PlayerTimelineEvent = {
  id: string;
  date: string;
  type: PlayerTimelineFilter;
  title: string;
  detail?: string;
  href?: string;
  label?: string;
  sensitive?: boolean;
};

export type PlayerHubData = {
  player: SquadPlayer;
  analytics: NonNullable<Awaited<ReturnType<typeof getPlayerAnalytics>>>;
  periodLabel: string;
  periodRangeLabel: string;
  development: PlayerDevelopmentProfile;
  contacts: PlayerContact[];
  medicalPeriods: PlayerMedicalPeriod[];
  currentMedical?: PlayerMedicalPeriod;
  headerPreferences: PlayerHeaderPreferences;
  timeline: PlayerTimelineEvent[];
  lifetime: {
    trainings: number;
    ratings: number;
    observations: number;
    completedGoals: number;
    coachAssessments: number;
  };
};

export function parsePlayerHubTab(value?: string | string[]): PlayerHubTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "analytics" || raw === "development" || raw === "history" || raw === "attendance" || raw === "medical" || raw === "notes" || raw === "details"
    ? raw
    : "overview";
}

export function parsePlayerHubTimelineFilter(value?: string | string[]): PlayerTimelineFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "trainings" || raw === "ratings" || raw === "attendance" || raw === "development" || raw === "observations" || raw === "medical" || raw === "coach"
    ? raw
    : "all";
}

export function parsePlayerHubPeriod(searchParams: Record<string, string | string[] | undefined>) {
  const raw = one(searchParams.period);
  const period: AnalyticsPeriod =
    raw === "last5" || raw === "last10" || raw === "30d" || raw === "90d" || raw === "season" || raw === "all" || raw === "custom"
      ? raw
      : "season";
  return {
    period,
    customFrom: normalizeDateParam(one(searchParams.from)),
    customTo: normalizeDateParam(one(searchParams.to))
  };
}

export async function getPlayerHubData(
  supabase: SupabaseServerClient,
  userId: string,
  playerId: string,
  period: AnalyticsPeriod,
  customFrom?: string,
  customTo?: string
): Promise<PlayerHubData | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data: playerData, error: playerError } = await db.from("squad_players").select("*").eq("user_id", userId).eq("id", playerId).maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (!playerData) return null;

  const player = mapSquadPlayerRow(playerData as SquadPlayerRow);
  const [records, assessments, development, contacts, medicalPeriods, preferences] = await Promise.all([
    listPlayerRecords(db, userId, playerId),
    listAssessments(db, userId, playerId),
    getPlayerDevelopmentProfile(supabase, userId, playerId),
    listContacts(db, userId, playerId),
    listMedicalPeriods(db, userId, playerId),
    getHeaderPreferences(db, userId)
  ]);

  const analyticsBase = await getPlayerAnalytics(supabase, userId, playerId, period, customFrom, customTo);
  if (!analyticsBase) return null;
  return {
    player,
    analytics: analyticsBase,
    periodLabel: analyticsPeriodLabels[period],
    periodRangeLabel: period === "custom" && customFrom && customTo ? `${formatEventDate(customFrom)} - ${formatEventDate(customTo)}` : analyticsPeriodLabels[period],
    development,
    contacts,
    medicalPeriods,
    currentMedical: currentMedicalPeriod(medicalPeriods),
    headerPreferences: preferences,
    timeline: buildPlayerTimeline(records, assessments, development, medicalPeriods, player),
    lifetime: {
      trainings: records.length,
      ratings: records.filter((record) => record.overallRating).length,
      observations: development.observations.length,
      completedGoals: development.goals.filter((goal) => goal.status === "completed").length,
      coachAssessments: assessments.length
    }
  };
}

export function currentMedicalPeriod(periods: PlayerMedicalPeriod[], date = new Date().toISOString().slice(0, 10)) {
  return latestApplicableMedicalPeriod(periods, date);
}

export function isMedicalPeriodActiveOnDate(period: PlayerMedicalPeriod, date: string) {
  if (period.status !== "active") return false;
  if (date < period.startDate) return false;
  if (period.actualReturnDate && date > period.actualReturnDate) return false;
  if (period.endDate && date > period.endDate) return false;
  return true;
}

export function medicalReasonForType(type: PlayerMedicalPeriodType) {
  return type === "injured" ? "V" : "K";
}

export function medicalLabel(period: PlayerMedicalPeriod) {
  return period.type === "injured" ? "Injured" : "Sick";
}

export function latestApplicableMedicalPeriod(periods: PlayerMedicalPeriod[], date: string) {
  return periods
    .filter((period) => isMedicalPeriodActiveOnDate(period, date))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function medicalNeedsReview(period: PlayerMedicalPeriod, date = new Date().toISOString().slice(0, 10)) {
  return period.status === "active" && Boolean(period.expectedReturnDate) && !period.actualReturnDate && (period.expectedReturnDate ?? "") < date;
}

function buildPlayerTimeline(
  records: PlayerAnalyticsRecord[],
  assessments: PlayerCoachAssessment[],
  development: PlayerDevelopmentProfile,
  medicalPeriods: PlayerMedicalPeriod[],
  player: SquadPlayer
): PlayerTimelineEvent[] {
  const items: PlayerTimelineEvent[] = [];
  for (const record of records) {
    const date = record.event?.date ?? record.createdAt.slice(0, 10);
    items.push({
      id: `attendance-${record.id}`,
      date,
      type: "attendance",
      title: record.finalStatus ? `Attendance: ${finalStatusLabel(record.finalStatus)}` : "Training attendance planned",
      detail: record.plannedReason ? `Reason: ${plannedReasonLabel(record.plannedReason)}` : record.event?.label ?? "Training",
      href: record.event ? `/trainings/${record.event.id}` : undefined
    });
    if (record.overallRating) {
      items.push({
        id: `rating-${record.id}`,
        date,
        type: "ratings",
        title: "Training rating added",
        detail: `Overall rating: ${record.overallRating}`,
        href: record.event ? `/trainings/${record.event.id}/ratings` : undefined
      });
    }
    if (record.coachNote) {
      items.push({
        id: `note-${record.id}`,
        date,
        type: "coach",
        title: record.sensitiveNote ? "Private coach note" : "Coach note",
        detail: record.sensitiveNote ? "Sensitive note saved in Player Hub only." : record.coachNote,
        href: record.event ? `/trainings/${record.event.id}/ratings` : undefined,
        sensitive: record.sensitiveNote
      });
    }
  }
  for (const assessment of assessments) {
    items.push({
      id: `assessment-${assessment.id}`,
      date: assessment.assessmentDate,
      type: "coach",
      title: "Coach assessment added",
      detail: assessment.reason,
      label: assessment.assessment
    });
  }
  for (const item of development.timeline) {
    items.push({
      id: `development-${item.id}`,
      date: item.date,
      type: item.type === "observation" ? "observations" : "development",
      title: item.title,
      detail: item.detail
    });
  }
  for (const period of medicalPeriods) {
    items.push({
      id: `medical-${period.id}-start`,
      date: period.startDate,
      type: "medical",
      title: `${medicalLabel(period)} period started`,
      detail: period.description
    });
    const end = period.actualReturnDate ?? period.endDate;
    if (end) {
      items.push({
        id: `medical-${period.id}-end`,
        date: end,
        type: "medical",
        title: `${medicalLabel(period)} period ended`,
        detail: period.description
      });
    }
  }
  if (player.convertedAt) {
    items.push({
      id: `trial-converted-${player.id}`,
      date: player.convertedAt.slice(0, 10),
      type: "coach",
      title: "Trial player converted",
      detail: "Converted into the permanent squad."
    });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

async function listPlayerRecords(db: SupabaseClient, userId: string, playerId: string): Promise<PlayerAnalyticsRecord[]> {
  const { data, error } = await db
    .from("squad_attendance_records")
    .select("*, squad_training_events(*)")
    .eq("user_id", userId)
    .eq("player_id", playerId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<SquadAttendanceRow & { squad_training_events?: SquadTrainingEventRow | null }>)
    .filter((row) => row.squad_training_events && !row.squad_training_events.deleted_at)
    .map((row) => ({ ...mapAttendanceRow(row), event: row.squad_training_events ? mapTrainingEventRow(row.squad_training_events) : undefined }));
}

async function listAssessments(db: SupabaseClient, userId: string, playerId: string): Promise<PlayerCoachAssessment[]> {
  const { data, error } = await db
    .from("player_coach_assessments")
    .select("*")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .order("assessment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AssessmentRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    playerId: row.player_id,
    assessment: row.assessment,
    reason: row.reason ?? undefined,
    assessmentDate: row.assessment_date,
    reviewDate: row.review_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function listContacts(db: SupabaseClient, userId: string, playerId: string) {
  const { data, error } = await db
    .from("player_contacts")
    .select("*")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as PlayerContactRow[]).map(mapPlayerContactRow);
}

async function listMedicalPeriods(db: SupabaseClient, userId: string, playerId: string) {
  const { data, error } = await db
    .from("player_medical_periods")
    .select("*")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .order("start_date", { ascending: false });
  if (error) return [];
  return ((data ?? []) as PlayerMedicalPeriodRow[]).map(mapPlayerMedicalPeriodRow);
}

async function getHeaderPreferences(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("player_header_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) return mapPlayerHeaderPreferencesRow();
  return mapPlayerHeaderPreferencesRow(data as PlayerHeaderPreferencesRow | null);
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
