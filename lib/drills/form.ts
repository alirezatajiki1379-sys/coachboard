import { ageGroups, drillTypes, mainFocuses, trainingBlocks } from "@/config/options";
import { parseEditorJsonString } from "@/lib/drills/editor";
import { detectMaterialsFromGraphic, materialsToJson, parseMaterials, parseMaterialsJson } from "@/lib/drills/materials";
import type { DrillInsert, DrillUpdate } from "@/lib/drills/mappers";
import type { AgeGroup, DrillType, MainFocus, TrainingBlock } from "@/types/domain";
import type { DrillEditorState } from "@/types/editor";

export type DrillFormField =
  | "title"
  | "shortDescription"
  | "organization"
  | "coachingPoints"
  | "variations"
  | "easierVersion"
  | "harderVersion"
  | "ageGroups"
  | "mainFocus"
  | "subFocus"
  | "trainingBlocks"
  | "drillType"
  | "durationMinutes"
  | "minPlayers"
  | "maxPlayers"
  | "materials"
  | "difficultyLevel"
  | "intensityLevel"
  | "tags"
  | "isFavorite";

export type DrillFormValues = {
  title: string;
  shortDescription: string;
  organization: string;
  coachingPoints: string;
  variations: string;
  easierVersion: string;
  harderVersion: string;
  ageGroups: string[];
  mainFocus: string;
  subFocus: string;
  trainingBlocks: string[];
  drillType: string;
  durationMinutes: string;
  minPlayers: string;
  maxPlayers: string;
  materials: string;
  materialsJson: string;
  difficultyLevel: string;
  intensityLevel: string;
  tags: string;
  isFavorite: boolean;
  graphicJson: string;
};

export type DrillFormResult =
  | { ok: true; data: Omit<DrillInsert, "user_id">; graphic: DrillEditorState }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<DrillFormField, string>>;
      values: DrillFormValues;
    };

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const value = Number.parseInt(text(formData, key), 10);
  return Number.isFinite(value) ? value : fallback;
}

function checkedValues<T extends string>(formData: FormData, key: string, allowed: readonly T[]) {
  const values = formData.getAll(key).filter((value): value is string => typeof value === "string");
  return values.filter((value): value is T => allowed.includes(value as T));
}

function optionalText(value: string) {
  return value ? value : null;
}

export function snapshotDrillFormValues(formData: FormData): DrillFormValues {
  return {
    title: text(formData, "title"),
    shortDescription: text(formData, "shortDescription"),
    organization: text(formData, "organization"),
    coachingPoints: text(formData, "coachingPoints"),
    variations: text(formData, "variations"),
    easierVersion: text(formData, "easierVersion"),
    harderVersion: text(formData, "harderVersion"),
    ageGroups: formData.getAll("ageGroups").filter((value): value is string => typeof value === "string"),
    mainFocus: text(formData, "mainFocus"),
    subFocus: text(formData, "subFocus"),
    trainingBlocks: formData.getAll("trainingBlocks").filter((value): value is string => typeof value === "string"),
    drillType: text(formData, "drillType"),
    durationMinutes: text(formData, "durationMinutes"),
    minPlayers: text(formData, "minPlayers"),
    maxPlayers: text(formData, "maxPlayers"),
    materials: text(formData, "materials"),
    materialsJson: text(formData, "materialsJson"),
    difficultyLevel: text(formData, "difficultyLevel"),
    intensityLevel: text(formData, "intensityLevel"),
    tags: text(formData, "tags"),
    isFavorite: formData.get("isFavorite") === "on",
    graphicJson: text(formData, "graphicJson")
  };
}

export function parseDrillForm(formData: FormData): DrillFormResult {
  const values = snapshotDrillFormValues(formData);
  const fieldErrors: Partial<Record<DrillFormField, string>> = {};
  const title = text(formData, "title");
  const mainFocus = text(formData, "mainFocus");
  const drillType = text(formData, "drillType");
  const ageGroupValues = checkedValues<AgeGroup>(formData, "ageGroups", ageGroups);
  const blockValues = checkedValues<TrainingBlock>(formData, "trainingBlocks", trainingBlocks);
  const duration = numberValue(formData, "durationMinutes", 10);
  const minPlayers = numberValue(formData, "minPlayers", 1);
  const maxPlayers = numberValue(formData, "maxPlayers", Math.max(minPlayers, 1));
  const difficulty = numberValue(formData, "difficultyLevel", 3);
  const intensity = numberValue(formData, "intensityLevel", 3);

  if (!title) fieldErrors.title = "Give this drill a clear title.";
  if (!mainFocuses.includes(mainFocus as MainFocus)) fieldErrors.mainFocus = "Choose the main coaching focus.";
  if (!drillTypes.includes(drillType as DrillType)) fieldErrors.drillType = "Choose the drill type.";
  if (!ageGroupValues.length) fieldErrors.ageGroups = "Select at least one age group for this drill.";
  if (!blockValues.length) fieldErrors.trainingBlocks = "Select at least one training block.";
  if (duration <= 0) fieldErrors.durationMinutes = "Duration must be at least 1 minute.";
  if (minPlayers <= 0) fieldErrors.minPlayers = "Minimum players must be at least 1.";
  if (maxPlayers <= 0) fieldErrors.maxPlayers = "Maximum players must be at least 1.";
  if (maxPlayers < minPlayers) fieldErrors.maxPlayers = "Maximum players must be the same as or higher than minimum players.";

  const firstError = Object.values(fieldErrors)[0];
  if (firstError) {
    return {
      ok: false,
      error: "Please fix the highlighted fields. Your entered drill details are still here.",
      fieldErrors,
      values
    };
  }

  const tags = text(formData, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const graphic = parseEditorJsonString(values.graphicJson);
  const materialRows = parseMaterialsJson(text(formData, "materialsJson")) ?? parseMaterials(text(formData, "materials"));
  const finalMaterials = materialRows.length ? materialRows : detectMaterialsFromGraphic(graphic);

  return {
    ok: true,
    data: {
      title,
      short_description: optionalText(text(formData, "shortDescription")),
      organization: optionalText(text(formData, "organization")),
      coaching_points: optionalText(text(formData, "coachingPoints")),
      variations: optionalText(text(formData, "variations")),
      easier_version: optionalText(text(formData, "easierVersion")),
      harder_version: optionalText(text(formData, "harderVersion")),
      age_groups: ageGroupValues,
      main_focus: mainFocus as MainFocus,
      sub_focus: optionalText(text(formData, "subFocus")),
      training_blocks: blockValues,
      drill_type: drillType as DrillType,
      duration_minutes: duration,
      min_players: minPlayers,
      max_players: maxPlayers,
      materials: materialsToJson(finalMaterials),
      pitch_area: null,
      difficulty_level: Math.min(Math.max(difficulty, 1), 5),
      intensity_level: Math.min(Math.max(intensity, 1), 5),
      is_favorite: formData.get("isFavorite") === "on",
      tags
    },
    graphic
  };
}

export function toDrillUpdate(data: Omit<DrillInsert, "user_id">): DrillUpdate {
  return data;
}
