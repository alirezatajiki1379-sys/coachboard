import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import type { Database } from "@/types/database";
import type { SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";

export type SquadTrainingEventRow = Database["public"]["Tables"]["squad_training_events"]["Row"];
export type SquadAttendanceRow = Database["public"]["Tables"]["squad_attendance_records"]["Row"];

export function mapTrainingEventRow(row: SquadTrainingEventRow, linkedTitle?: string, squadName?: string): SquadTrainingEvent {
  return {
    id: row.id,
    userId: row.user_id,
    squadId: row.squad_id ?? undefined,
    squadName,
    squadNeedsReview: row.squad_assignment_needs_review,
    recurrenceSeriesId: row.recurrence_series_id ?? undefined,
    recurrenceSequence: row.recurrence_sequence ?? undefined,
    isSeriesException: row.is_series_exception,
    exceptionType: row.exception_type ?? undefined,
    recurrenceOriginalDate: row.recurrence_original_date ?? undefined,
    date: row.date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time?.slice(0, 5) ?? undefined,
    label: row.label ?? undefined,
    location: row.location ?? undefined,
    focus: row.focus ?? undefined,
    seasonLabel: row.season_label ?? undefined,
    linkedTrainingSessionId: row.linked_training_session_id ?? undefined,
    linkedTrainingSessionTitle: linkedTitle,
    status: row.status,
    generalNotes: row.general_notes ?? undefined,
    completedAt: row.completed_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapAttendanceRow(row: SquadAttendanceRow, player?: SquadPlayerRow): SquadAttendanceEntry {
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    playerId: row.player_id,
    plannedStatus: row.planned_status ?? undefined,
    plannedReason: row.planned_reason ?? undefined,
    plannedReasonNote: row.planned_reason_note ?? undefined,
    plannedStatusSource: row.planned_status_source ?? undefined,
    finalStatus: row.final_status ?? undefined,
    lateMinutes: row.late_minutes ?? undefined,
    latePenaltyApplied: row.late_penalty_applied,
    overallRating: row.overall_rating ?? undefined,
    ratingTechnique: row.rating_technique ?? undefined,
    ratingGameUnderstanding: row.rating_game_understanding ?? undefined,
    ratingIntensity: row.rating_intensity ?? undefined,
    ratingBehavior: row.rating_behavior ?? undefined,
    ratingAutoSuggestion: row.rating_auto_suggestion ?? undefined,
    coachNote: row.coach_note ?? undefined,
    sensitiveNote: row.sensitive_note,
    player: player ? mapSquadPlayerRow(player) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
