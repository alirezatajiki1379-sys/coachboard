import type { SupabaseClient } from "@supabase/supabase-js";
import type { SquadAttendanceReason, SquadPlannedAttendanceSource } from "@/types/domain";

export type PlayerAbsenceReason = "injured" | "sick" | "school" | "work" | "holiday" | "private" | "other";

export type PlayerAvailabilityMatch = {
  playerId: string;
  reason: PlayerAbsenceReason;
  plannedReason: SquadAttendanceReason;
  note?: string;
  source: Exclude<SquadPlannedAttendanceSource, "default" | "manual">;
};

type MedicalRow = {
  player_id: string;
  type: "injured" | "sick";
  start_date: string;
  end_date: string | null;
  actual_return_date: string | null;
  description: string | null;
  status: string;
  updated_at: string;
};

type AvailabilityRow = {
  player_id: string;
  reason: PlayerAbsenceReason;
  starts_on: string;
  ends_on: string | null;
  note: string | null;
  status: string;
  updated_at: string;
};

export const playerAbsenceReasonLabels: Record<PlayerAbsenceReason, string> = {
  injured: "Injured",
  sick: "Sick",
  school: "School",
  work: "Work",
  holiday: "Holiday",
  private: "Private",
  other: "Other"
};

export function absenceReasonToPlannedReason(reason: PlayerAbsenceReason): SquadAttendanceReason {
  if (reason === "injured") return "injured";
  if (reason === "sick") return "sick";
  if (reason === "school") return "school";
  if (reason === "work") return "work";
  if (reason === "holiday") return "holiday";
  if (reason === "private") return "private";
  return "other";
}

export async function getAvailabilityByPlayerOnDate(db: SupabaseClient, userId: string, date: string, playerIds: string[]) {
  const uniquePlayerIds = Array.from(new Set(playerIds)).filter(Boolean);
  const result = new Map<string, PlayerAvailabilityMatch>();
  if (!uniquePlayerIds.length || !date) return result;

  const [medicalResult, availabilityResult] = await Promise.all([
    db
      .from("player_medical_periods")
      .select("player_id,type,start_date,end_date,actual_return_date,description,status,updated_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("player_id", uniquePlayerIds)
      .lte("start_date", date),
    db
      .from("player_availability_periods")
      .select("player_id,reason,starts_on,ends_on,note,status,updated_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("player_id", uniquePlayerIds)
      .lte("starts_on", date)
  ]);

  if (medicalResult.error) throw new Error(medicalResult.error.message);
  if (availabilityResult.error) throw new Error(availabilityResult.error.message);

  const medicalRows = ((medicalResult.data ?? []) as MedicalRow[])
    .filter((row) => dateInRange(date, row.start_date, row.actual_return_date ?? row.end_date))
    .sort((a, b) => b.start_date.localeCompare(a.start_date) || b.updated_at.localeCompare(a.updated_at));

  for (const row of medicalRows) {
    if (result.has(row.player_id)) continue;
    const reason = row.type === "sick" ? "sick" : "injured";
    result.set(row.player_id, {
      playerId: row.player_id,
      reason,
      plannedReason: absenceReasonToPlannedReason(reason),
      note: row.description ?? undefined,
      source: "medical"
    });
  }

  const availabilityRows = ((availabilityResult.data ?? []) as AvailabilityRow[])
    .filter((row) => dateInRange(date, row.starts_on, row.ends_on))
    .sort((a, b) => reasonPriority(a.reason) - reasonPriority(b.reason) || b.starts_on.localeCompare(a.starts_on) || b.updated_at.localeCompare(a.updated_at));

  for (const row of availabilityRows) {
    if (result.has(row.player_id)) continue;
    result.set(row.player_id, {
      playerId: row.player_id,
      reason: row.reason,
      plannedReason: absenceReasonToPlannedReason(row.reason),
      note: row.note ?? undefined,
      source: "availability"
    });
  }

  return result;
}

export async function syncPlayerAvailabilityToFutureTrainings(db: SupabaseClient, userId: string, playerId: string) {
  const today = todayDateString();
  const { data, error } = await db
    .from("squad_attendance_records")
    .select("id,player_id,planned_status_source,final_status,squad_training_events!inner(id,date,status,deleted_at)")
    .eq("user_id", userId)
    .eq("player_id", playerId)
    .is("final_status", null);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as Array<{
    id: string;
    player_id: string;
    planned_status_source: SquadPlannedAttendanceSource | null;
    final_status: string | null;
    squad_training_events?: { id: string; date: string; status: string; deleted_at: string | null } | Array<{ id: string; date: string; status: string; deleted_at: string | null }> | null;
  }>).filter((row) => {
    const event = Array.isArray(row.squad_training_events) ? row.squad_training_events[0] : row.squad_training_events;
    return Boolean(event && !event.deleted_at && event.date >= today && event.status !== "completed" && row.planned_status_source !== "manual");
  });

  for (const row of rows) {
    const event = Array.isArray(row.squad_training_events) ? row.squad_training_events[0] : row.squad_training_events;
    if (!event) continue;
    const availability = (await getAvailabilityByPlayerOnDate(db, userId, event.date, [playerId])).get(playerId);
    const { error: updateError } = await db
      .from("squad_attendance_records")
      .update(availability ? {
        planned_status: "unavailable",
        planned_reason: availability.plannedReason,
        planned_reason_note: availability.note ?? null,
        planned_status_source: availability.source
      } : {
        planned_status: "expected",
        planned_reason: null,
        planned_reason_note: null,
        planned_status_source: "default"
      })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
  }
}

function dateInRange(date: string, start: string, end?: string | null) {
  if (date < start) return false;
  if (end && date > end) return false;
  return true;
}

function reasonPriority(reason: PlayerAbsenceReason) {
  const priorities: Record<PlayerAbsenceReason, number> = {
    injured: 1,
    sick: 2,
    school: 3,
    work: 4,
    holiday: 5,
    private: 6,
    other: 7
  };
  return priorities[reason];
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
