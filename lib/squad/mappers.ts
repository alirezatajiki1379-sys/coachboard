import type { Database } from "@/types/database";
import type { PlayerContact, PlayerHeaderPreferences, PlayerMedicalPeriod, SquadPlayer } from "@/types/domain";

export type SquadPlayerRow = Database["public"]["Tables"]["squad_players"]["Row"];
export type SquadPlayerInsert = Database["public"]["Tables"]["squad_players"]["Insert"];
export type SquadPlayerUpdate = Database["public"]["Tables"]["squad_players"]["Update"];
export type PlayerContactRow = Database["public"]["Tables"]["player_contacts"]["Row"];
export type PlayerMedicalPeriodRow = Database["public"]["Tables"]["player_medical_periods"]["Row"];
export type PlayerHeaderPreferencesRow = Database["public"]["Tables"]["player_header_preferences"]["Row"];

function optional(value: string | null) {
  return value ?? undefined;
}

export function mapSquadPlayerRow(row: SquadPlayerRow): SquadPlayer {
  return {
    id: row.id,
    userId: row.user_id,
    playerType: row.player_type ?? "roster",
    firstName: row.first_name,
    lastName: row.last_name ?? undefined,
    dateOfBirth: optional(row.date_of_birth),
    position: optional(row.position),
    secondaryPositions: Array.isArray(row.secondary_positions) ? row.secondary_positions : [],
    strongFoot: optional(row.strong_foot),
    club: optional(row.club),
    playerEmail: optional(row.player_email),
    parentPhone: optional(row.parent_phone),
    playerPhone: optional(row.player_phone),
    parentEmail: optional(row.parent_email),
    heightCm: row.height_cm ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    jerseyNumber: optional(row.jersey_number),
    captainStatus: row.captain_status ?? undefined,
    joinedDate: optional(row.joined_date),
    allergies: optional(row.allergies),
    medication: optional(row.medication),
    medicalNotes: optional(row.medical_notes),
    hobbies: optional(row.hobbies),
    developmentGoal: optional(row.development_goal),
    workOn: optional(row.work_on),
    notes: optional(row.notes),
    convertedAt: optional(row.converted_at),
    archivedAt: optional(row.archived_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapPlayerContactRow(row: PlayerContactRow): PlayerContact {
  return {
    id: row.id,
    userId: row.user_id,
    playerId: row.player_id,
    name: optional(row.name),
    relationship: row.relationship,
    phone: optional(row.phone),
    email: optional(row.email),
    isPrimary: row.is_primary,
    isEmergency: row.is_emergency,
    notes: optional(row.notes),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapPlayerMedicalPeriodRow(row: PlayerMedicalPeriodRow): PlayerMedicalPeriod {
  return {
    id: row.id,
    userId: row.user_id,
    playerId: row.player_id,
    type: row.type,
    startDate: row.start_date,
    endDate: optional(row.end_date),
    expectedReturnDate: optional(row.expected_return_date),
    actualReturnDate: optional(row.actual_return_date),
    description: row.description,
    notes: optional(row.notes),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const defaultPlayerHeaderPreferences: PlayerHeaderPreferences = {
  showHeight: false,
  showWeight: false,
  showJerseyNumber: false,
  showCaptain: false,
  showJoinedDate: false,
  showLastTraining: false
};

export function mapPlayerHeaderPreferencesRow(row?: PlayerHeaderPreferencesRow | null): PlayerHeaderPreferences {
  if (!row) return defaultPlayerHeaderPreferences;
  return {
    showHeight: row.show_height,
    showWeight: row.show_weight,
    showJerseyNumber: row.show_jersey_number,
    showCaptain: row.show_captain,
    showJoinedDate: row.show_joined_date,
    showLastTraining: row.show_last_training
  };
}
