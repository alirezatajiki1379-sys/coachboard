import type { Json } from "@/types/database";
import { normalizePositions } from "@/lib/squad/intake";
import type { SquadPlayerRow } from "@/lib/squad/mappers";
import { normalizeCanonicalPosition } from "@/lib/squad/positions";

export type PositionRepairCandidate = {
  playerId: string;
  sourceField: string;
  rawValue: string;
  targetPosition: string;
  targetSecondaryPositions: string[];
  currentPosition?: string | null;
  currentSecondaryPositions: string[];
};

export type PositionRepairIssue = {
  playerId: string;
  reason: string;
  sourceValues: Array<{ field: string; value: string }>;
};

export type PositionConsistencyReport = {
  totalPlayers: number;
  canonicalPrimaryPositions: number;
  secondaryPositions: number;
  squadDisplayedPositions: number;
  profileMissingPositions: number;
  sessionPlanningUnassignedRisk: number;
  deterministicRepairs: PositionRepairCandidate[];
  manualReview: PositionRepairIssue[];
};

type SourceValue = {
  field: string;
  value: string;
};

export function buildPositionConsistencyReport(players: SquadPlayerRow[]): PositionConsistencyReport {
  const activePlayers = players.filter((player) => !player.deleted_at);
  const deterministicRepairs: PositionRepairCandidate[] = [];
  const manualReview: PositionRepairIssue[] = [];

  for (const player of activePlayers) {
    const repair = buildPositionRepairCandidate(player);
    if (repair) deterministicRepairs.push(repair);
    else if (!normalizeCanonicalPosition(player.position ?? undefined) && sourceValues(player).length) {
      manualReview.push({
        playerId: player.id,
        reason: "Stored position source could not be mapped deterministically.",
        sourceValues: sourceValues(player)
      });
    }
  }

  return {
    totalPlayers: activePlayers.length,
    canonicalPrimaryPositions: activePlayers.filter((player) => normalizeCanonicalPosition(player.position ?? undefined)).length,
    secondaryPositions: activePlayers.filter((player) => normalizeCanonicalPositionList(player.secondary_positions ?? []).length).length,
    squadDisplayedPositions: activePlayers.filter((player) => Boolean(player.position || normalizeCanonicalPositionList(player.preferred_positions ?? []).length || normalizedValues(player).length)).length,
    profileMissingPositions: activePlayers.filter((player) => !normalizeCanonicalPosition(player.position ?? undefined)).length,
    sessionPlanningUnassignedRisk: activePlayers.filter((player) => !effectiveCanonicalPosition(player)).length,
    deterministicRepairs,
    manualReview
  };
}

export function buildPositionRepairCandidate(player: SquadPlayerRow): PositionRepairCandidate | null {
  const currentPrimary = normalizeCanonicalPosition(player.position ?? undefined);
  const currentSecondary = normalizeCanonicalPositionList(player.secondary_positions ?? []);
  const sources = sourceValues(player);
  const sourcePositions = sources.flatMap((source) => positionsFromSource(source));
  const allPositions = uniquePositions([currentPrimary, ...currentSecondary, ...sourcePositions.map((item) => item.position)]);
  const targetPrimary = currentPrimary ?? allPositions[0];
  if (!targetPrimary) return null;
  const targetSecondary = uniquePositions([...currentSecondary, ...allPositions.filter((position) => position !== targetPrimary)]);
  const needsPrimaryRepair = player.position !== targetPrimary;
  const needsSecondaryRepair = JSON.stringify(currentSecondary) !== JSON.stringify(targetSecondary);
  if (!needsPrimaryRepair && !needsSecondaryRepair) return null;
  const source = sourcePositions.find((item) => item.position === targetPrimary) ?? { field: player.position ? "position" : "derived", rawValue: player.position ?? targetPrimary };
  return {
    playerId: player.id,
    sourceField: source.field,
    rawValue: source.rawValue,
    targetPosition: targetPrimary,
    targetSecondaryPositions: targetSecondary,
    currentPosition: player.position,
    currentSecondaryPositions: currentSecondary
  };
}

export function positionRepairUpdate(player: SquadPlayerRow, candidate: PositionRepairCandidate) {
  const existingNormalized = isRecord(player.onboarding_normalized_values) ? player.onboarding_normalized_values : {};
  return {
    position: candidate.targetPosition,
    secondary_positions: candidate.targetSecondaryPositions,
    onboarding_normalized_values: {
      ...existingNormalized,
      positionRepair: {
        repairedAt: new Date().toISOString(),
        sourceField: candidate.sourceField,
        sourceRawValue: candidate.rawValue,
        previousPosition: candidate.currentPosition ?? null,
        previousSecondaryPositions: candidate.currentSecondaryPositions,
        targetPosition: candidate.targetPosition,
        targetSecondaryPositions: candidate.targetSecondaryPositions
      }
    } satisfies Json
  };
}

function effectiveCanonicalPosition(player: SquadPlayerRow) {
  return normalizeCanonicalPosition(player.position ?? undefined) ?? normalizeCanonicalPositionList(player.secondary_positions ?? [])[0];
}

function normalizeCanonicalPositionList(values: string[] | null) {
  return uniquePositions((values ?? []).map((value) => normalizeCanonicalPosition(value)).filter((value): value is string => Boolean(value)));
}

function sourceValues(player: SquadPlayerRow): SourceValue[] {
  const normalized = normalizedValues(player);
  return [
    source("position", player.position),
    source("secondary_positions", (player.secondary_positions ?? []).join(", ")),
    source("preferred_positions", (player.preferred_positions ?? []).join(", ")),
    source("original_preferred_positions", player.original_preferred_positions),
    ...normalized
  ].filter((item): item is SourceValue => Boolean(item?.value));
}

function normalizedValues(player: SquadPlayerRow): SourceValue[] {
  const values = isRecord(player.onboarding_normalized_values) ? player.onboarding_normalized_values : {};
  return ["position", "secondaryPositions", "preferredPositions"].map((field) => source(`onboarding_normalized_values.${field}`, values[field])).filter((item): item is SourceValue => Boolean(item?.value));
}

function source(field: string, value: unknown): SourceValue | null {
  if (Array.isArray(value)) return source(field, value.join(", "));
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? { field, value: trimmed } : null;
}

function positionsFromSource(sourceValue: SourceValue) {
  const normalized = normalizePositions(sourceValue.value);
  if (normalized.warnings.length) return [];
  return normalized.values
    .map((value) => normalizeCanonicalPosition(value))
    .filter((position): position is string => Boolean(position))
    .map((position) => ({ position, field: sourceValue.field, rawValue: sourceValue.value }));
}

function uniquePositions(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
