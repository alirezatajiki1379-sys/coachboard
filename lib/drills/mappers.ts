import type { Database } from "@/types/database";
import type { Drill } from "@/types/domain";
import { jsonToMaterials, materialsToJson } from "@/lib/drills/materials";

export type DrillRow = Database["public"]["Tables"]["drills"]["Row"];
export type DrillInsert = Database["public"]["Tables"]["drills"]["Insert"];
export type DrillUpdate = Database["public"]["Tables"]["drills"]["Update"];

function toLevel(value: number): 1 | 2 | 3 | 4 | 5 {
  if (value <= 1) return 1;
  if (value === 2) return 2;
  if (value === 4) return 4;
  if (value >= 5) return 5;
  return 3;
}

export function mapDrillRow(row: DrillRow): Drill {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    shortDescription: row.short_description ?? undefined,
    organization: row.organization ?? undefined,
    coachingPoints: row.coaching_points ?? undefined,
    variations: row.variations ?? undefined,
    easierVersion: row.easier_version ?? undefined,
    harderVersion: row.harder_version ?? undefined,
    ageGroups: row.age_groups as Drill["ageGroups"],
    mainFocus: row.main_focus as Drill["mainFocus"],
    subFocus: row.sub_focus ?? undefined,
    trainingBlocks: row.training_blocks as Drill["trainingBlocks"],
    drillType: row.drill_type as Drill["drillType"],
    durationMinutes: row.duration_minutes,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    materials: jsonToMaterials(row.materials),
    pitchArea: row.pitch_area ?? undefined,
    difficultyLevel: toLevel(row.difficulty_level),
    intensityLevel: toLevel(row.intensity_level),
    isFavorite: row.is_favorite,
    tags: row.tags,
    archivedAt: row.archived_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapDrillToDuplicateInsert(drill: Drill, userId: string): DrillInsert {
  return {
    user_id: userId,
    title: `${drill.title} copy`,
    short_description: drill.shortDescription ?? null,
    organization: drill.organization ?? null,
    coaching_points: drill.coachingPoints ?? null,
    variations: drill.variations ?? null,
    easier_version: drill.easierVersion ?? null,
    harder_version: drill.harderVersion ?? null,
    age_groups: drill.ageGroups,
    main_focus: drill.mainFocus,
    sub_focus: drill.subFocus ?? null,
    training_blocks: drill.trainingBlocks,
    drill_type: drill.drillType,
    duration_minutes: drill.durationMinutes,
    min_players: drill.minPlayers,
    max_players: drill.maxPlayers,
    materials: materialsToJson(drill.materials),
    pitch_area: drill.pitchArea ?? null,
    difficulty_level: drill.difficultyLevel,
    intensity_level: drill.intensityLevel,
    is_favorite: false,
    tags: drill.tags
  };
}
