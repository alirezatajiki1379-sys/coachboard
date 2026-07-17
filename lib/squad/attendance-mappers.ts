import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import type { Database } from "@/types/database";
import type { SquadAttendanceEntry, SquadTrialPlayer, SquadTrainingEvent } from "@/types/domain";

export type SquadTrainingEventRow = Database["public"]["Tables"]["squad_training_events"]["Row"];
export type SquadAttendanceRow = Database["public"]["Tables"]["squad_event_attendance"]["Row"];
export type SquadTrialPlayerRow = Database["public"]["Tables"]["squad_trial_players"]["Row"];

export function mapTrialPlayerRow(row: SquadTrialPlayerRow): SquadTrialPlayer {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    contact: row.contact ?? undefined,
    notes: row.notes ?? undefined,
    convertedPlayerId: row.converted_player_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapTrainingEventRow(row: SquadTrainingEventRow, linkedTitle?: string): SquadTrainingEvent {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time?.slice(0, 5) ?? undefined,
    label: row.label ?? undefined,
    linkedTrainingSessionId: row.linked_training_session_id ?? undefined,
    linkedTrainingSessionTitle: linkedTitle,
    status: row.status,
    generalNotes: row.general_notes ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapAttendanceRow(
  row: SquadAttendanceRow,
  player?: SquadPlayerRow,
  trialPlayer?: SquadTrialPlayerRow
): SquadAttendanceEntry {
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    playerId: row.player_id ?? undefined,
    trialPlayerId: row.trial_player_id ?? undefined,
    status: row.status,
    plannedStatus: row.planned_status,
    rating: row.rating ?? undefined,
    effortRating: row.effort_rating ?? undefined,
    notes: row.notes ?? undefined,
    player: player ? mapSquadPlayerRow(player) : undefined,
    trialPlayer: trialPlayer ? mapTrialPlayerRow(trialPlayer) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
