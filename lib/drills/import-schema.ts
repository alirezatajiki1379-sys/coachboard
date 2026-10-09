import { ageGroups, drillTypes, mainFocuses, trainingBlocks } from "@/config/options";
import { jsonToMaterials } from "@/lib/drills/materials";
import type { Json } from "@/types/database";
import type { AgeGroup, DrillAgeMode, DrillType, MainFocus, MaterialItem, TrainingBlock } from "@/types/domain";

export const drillImportSchemaVersion = 1;
export const maxDrillsPerImport = 100;

export type DrillImportSource = {
  title?: string;
  publisher?: string;
  page?: string;
  reference?: string;
};

export type DrillImportItem = {
  externalId?: string;
  title: string;
  shortDescription?: string;
  organization?: string;
  coachingPoints?: string;
  variations?: string;
  easierVersion?: string;
  harderVersion?: string;
  durationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  mainFocus: MainFocus | "";
  subFocus?: string;
  trainingBlocks: TrainingBlock[];
  drillType: DrillType | "";
  ageMode: DrillAgeMode;
  ageGroups: AgeGroup[];
  minimumAge?: number;
  maximumAge?: number;
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  intensityLevel: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  materials: MaterialItem[];
  image?: string;
  source: DrillImportSource;
};

export type DrillImportValidationIssue = {
  field: string;
  code: string;
  severity: "error" | "warning";
};

export type ValidatedDrillImportItem = {
  index: number;
  item: DrillImportItem;
  issues: DrillImportValidationIssue[];
};

export type DrillImportManifest = {
  schemaVersion: 1;
  batch: {
    name: string;
    source?: DrillImportSource;
  };
  drills: ValidatedDrillImportItem[];
};

export type DrillDuplicateCandidate = {
  id: string;
  title: string;
  importExternalId?: string;
  sourceTitle?: string;
  sourcePublisher?: string;
  sourcePage?: string;
};

export type DrillDuplicateMatch = {
  drillId: string;
  title: string;
  kind: "external_id" | "source_page" | "exact_title" | "similar_title";
  safeToUpdate: boolean;
};

export function parseDrillImportManifest(value: unknown): DrillImportManifest {
  const root = record(value, "The manifest must contain a JSON object.");
  if (root.schemaVersion !== drillImportSchemaVersion) {
    throw new Error(`Unsupported schema version. CoachBoard currently supports version ${drillImportSchemaVersion}.`);
  }
  if (!Array.isArray(root.drills) || !root.drills.length) throw new Error("The manifest does not contain any drills.");
  if (root.drills.length > maxDrillsPerImport) throw new Error(`One package may contain at most ${maxDrillsPerImport} drills.`);
  const batch = optionalRecord(root.batch);
  const batchSource = parseSource(batch?.source);
  const name = text(batch?.name, 160) || batchSource.title || "Drill import";

  return {
    schemaVersion: 1,
    batch: { name, source: hasSource(batchSource) ? batchSource : undefined },
    drills: root.drills.map((item, index) => validateImportItem(item, index, batchSource))
  };
}

export function validateNormalizedImportItem(item: unknown, index: number): ValidatedDrillImportItem {
  return validateImportItem(item, index, {});
}

export function findDrillDuplicate(item: DrillImportItem, candidates: DrillDuplicateCandidate[]): DrillDuplicateMatch | undefined {
  const externalId = normalizeIdentity(item.externalId);
  if (externalId) {
    const match = candidates.find((candidate) => normalizeIdentity(candidate.importExternalId) === externalId);
    if (match) return { drillId: match.id, title: match.title, kind: "external_id", safeToUpdate: true };
  }

  const sourceTitle = normalizeIdentity(item.source.title);
  const sourcePage = normalizeIdentity(item.source.page);
  if (sourceTitle && sourcePage) {
    const match = candidates.find((candidate) =>
      normalizeIdentity(candidate.sourceTitle) === sourceTitle
      && normalizeIdentity(candidate.sourcePage) === sourcePage
    );
    if (match) return { drillId: match.id, title: match.title, kind: "source_page", safeToUpdate: true };
  }

  const normalizedTitle = normalizeTitle(item.title);
  const exact = candidates.find((candidate) => normalizeTitle(candidate.title) === normalizedTitle);
  if (exact) return { drillId: exact.id, title: exact.title, kind: "exact_title", safeToUpdate: false };

  const similar = candidates
    .map((candidate) => ({ candidate, score: titleSimilarity(normalizedTitle, normalizeTitle(candidate.title)) }))
    .filter(({ score }) => score >= 0.86)
    .sort((a, b) => b.score - a.score)[0];
  return similar ? { drillId: similar.candidate.id, title: similar.candidate.title, kind: "similar_title", safeToUpdate: false } : undefined;
}

export function normalizeImportTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateImportItem(value: unknown, index: number, batchSource: DrillImportSource): ValidatedDrillImportItem {
  const raw = optionalRecord(value) ?? {};
  const issues: DrillImportValidationIssue[] = [];
  const title = normalizeImportTitle(text(raw.title, 240));
  if (!title) issues.push(issue("title", "required", "error"));

  const mainFocusValue = text(raw.mainFocus, 120);
  const mainFocus = mainFocuses.includes(mainFocusValue as MainFocus) ? mainFocusValue as MainFocus : "";
  if (!mainFocus) issues.push(issue("mainFocus", mainFocusValue ? "unsupported" : "required", "error"));

  const drillTypeValue = text(raw.drillType, 120);
  const drillType = drillTypes.includes(drillTypeValue as DrillType) ? drillTypeValue as DrillType : "";
  if (!drillType) issues.push(issue("drillType", drillTypeValue ? "unsupported" : "required", "error"));

  const durationMinutes = integer(raw.durationMinutes, 1, 300);
  const minPlayers = integer(raw.minPlayers, 1, 100);
  const maxPlayers = integer(raw.maxPlayers, 1, 100);
  const normalizedDuration = durationMinutes ?? 10;
  const normalizedMin = minPlayers ?? 1;
  const normalizedMax = maxPlayers ?? normalizedMin;
  if (durationMinutes == null) issues.push(issue("durationMinutes", "defaulted", "warning"));
  if (minPlayers == null) issues.push(issue("minPlayers", "defaulted", "warning"));
  if (maxPlayers == null) issues.push(issue("maxPlayers", "defaulted", "warning"));
  if (normalizedMax < normalizedMin) issues.push(issue("maxPlayers", "below_minimum", "error"));

  const rawBlocks = stringArray(raw.trainingBlocks, 12);
  const normalizedBlocks = rawBlocks.filter((block): block is TrainingBlock => trainingBlocks.includes(block as TrainingBlock));
  if (normalizedBlocks.length !== rawBlocks.length) issues.push(issue("trainingBlocks", "unsupported_values_removed", "warning"));

  const rawAgeGroups = stringArray(raw.ageGroups, ageGroups.length);
  const normalizedAgeGroups = rawAgeGroups.filter((group): group is AgeGroup => ageGroups.includes(group as AgeGroup));
  const requestedAgeMode = text(raw.ageMode, 30);
  const ageMode: DrillAgeMode = requestedAgeMode === "custom_range" || requestedAgeMode === "preset" ? requestedAgeMode : normalizedAgeGroups.length ? "preset" : "all_ages";
  const minimumAge = integer(raw.minimumAge, 3, 99);
  const maximumAge = integer(raw.maximumAge, 3, 99);
  if (ageMode === "preset" && !normalizedAgeGroups.length) issues.push(issue("ageGroups", "required_for_preset", "error"));
  if (ageMode === "custom_range" && (minimumAge == null || maximumAge == null || maximumAge < minimumAge)) {
    issues.push(issue("ageGroups", "invalid_custom_range", "error"));
  }

  const itemSource = parseSource(raw.source);
  const source = {
    title: itemSource.title ?? batchSource.title,
    publisher: itemSource.publisher ?? batchSource.publisher,
    page: itemSource.page,
    reference: itemSource.reference ?? batchSource.reference
  };
  const materials = Array.isArray(raw.materials) ? jsonToMaterials(raw.materials as Json) : [];
  if (raw.materials != null && !Array.isArray(raw.materials)) issues.push(issue("materials", "invalid", "warning"));

  const item: DrillImportItem = {
    externalId: text(raw.externalId, 240) || undefined,
    title,
    shortDescription: text(raw.shortDescription ?? raw.description, 2000) || undefined,
    organization: text(raw.organization, 8000) || undefined,
    coachingPoints: orderedText(raw.coachingPoints, 8000) || undefined,
    variations: orderedText(raw.variations, 8000) || undefined,
    easierVersion: text(raw.easierVersion, 4000) || undefined,
    harderVersion: text(raw.harderVersion, 4000) || undefined,
    durationMinutes: normalizedDuration,
    minPlayers: normalizedMin,
    maxPlayers: normalizedMax,
    mainFocus,
    subFocus: text(raw.subFocus, 240) || undefined,
    trainingBlocks: normalizedBlocks,
    drillType,
    ageMode,
    ageGroups: ageMode === "all_ages" ? ["all_ages"] : normalizedAgeGroups,
    minimumAge: ageMode === "custom_range" ? minimumAge ?? undefined : undefined,
    maximumAge: ageMode === "custom_range" ? maximumAge ?? undefined : undefined,
    difficultyLevel: level(raw.difficultyLevel),
    intensityLevel: level(raw.intensityLevel),
    tags: stringArray(raw.tags, 30).map((tag) => tag.slice(0, 80)),
    materials,
    image: text(raw.image, 500) || undefined,
    source
  };
  if (item.image && !isSafePackagePath(item.image)) issues.push(issue("image", "unsafe_path", "error"));
  return { index, item, issues };
}

export function isSafePackagePath(value: string) {
  const path = value.replaceAll("\\", "/");
  return Boolean(path)
    && !value.includes("\\")
    && !/[\u0000-\u001f]/.test(value)
    && !path.startsWith("/")
    && !/^[a-z]:/i.test(path)
    && !path.split("/").some((segment) => segment === ".." || segment === "");
}

function parseSource(value: unknown): DrillImportSource {
  const source = optionalRecord(value);
  return source ? {
    title: text(source.title, 500) || undefined,
    publisher: text(source.publisher, 240) || undefined,
    page: text(source.page, 80) || undefined,
    reference: text(source.reference, 1000) || undefined
  } : {};
}

function hasSource(source: DrillImportSource) {
  return Boolean(source.title || source.publisher || source.page || source.reference);
}

function issue(field: string, code: string, severity: "error" | "warning"): DrillImportValidationIssue {
  return { field, code, severity };
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function record(value: unknown, message: string) {
  const result = optionalRecord(value);
  if (!result) throw new Error(message);
  return result;
}

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, maxLength);
}

function orderedText(value: unknown, maxLength: number) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).join("\n").slice(0, maxLength);
  return text(value, maxLength);
}

function stringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))).slice(0, maxItems);
}

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function level(value: unknown): 1 | 2 | 3 | 4 | 5 {
  return integer(value, 1, 5) as 1 | 2 | 3 | 4 | 5 | undefined ?? 3;
}

function normalizeIdentity(value?: string) {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

function normalizeTitle(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function titleSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? intersection / union : 0;
}
