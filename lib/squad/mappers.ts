import type { Database } from "@/types/database";
import type { SquadPlayer } from "@/types/domain";

export type SquadPlayerRow = Database["public"]["Tables"]["squad_players"]["Row"];
export type SquadPlayerInsert = Database["public"]["Tables"]["squad_players"]["Insert"];
export type SquadPlayerUpdate = Database["public"]["Tables"]["squad_players"]["Update"];

function optional(value: string | null) {
  return value ?? undefined;
}

export function mapSquadPlayerRow(row: SquadPlayerRow): SquadPlayer {
  return {
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name ?? undefined,
    dateOfBirth: optional(row.date_of_birth),
    position: optional(row.position),
    strongFoot: optional(row.strong_foot),
    club: optional(row.club),
    parentPhone: optional(row.parent_phone),
    playerPhone: optional(row.player_phone),
    parentEmail: optional(row.parent_email),
    hobbies: optional(row.hobbies),
    developmentGoal: optional(row.development_goal),
    workOn: optional(row.work_on),
    notes: optional(row.notes),
    archivedAt: optional(row.archived_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
