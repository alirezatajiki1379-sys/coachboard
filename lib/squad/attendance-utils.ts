import type { SquadAttendanceEntry, SquadAttendanceReason, SquadFinalAttendanceStatus } from "@/types/domain";
import { formatPositionLabel, getPositionFamily, normalizeCanonicalPosition, type PositionFamily } from "@/lib/squad/positions";

export const attendanceReasonLabels: Record<SquadAttendanceReason, string> = {
  V: "Injured",
  K: "Sick",
  E: "Excused",
  P: "Private reason",
  S: "Late cancellation",
  Z: "Late",
  U: "Unexcused"
};

export function isExpectedFromPlannedStatus(entry: Pick<SquadAttendanceEntry, "plannedStatus">) {
  return !entry.plannedStatus || entry.plannedStatus === "expected";
}

export function isConfirmedAttending(entry: SquadAttendanceEntry) {
  if (entry.finalStatus === "present" || entry.finalStatus === "Z") return true;
  if (entry.finalStatus) return false;
  return isExpectedFromPlannedStatus(entry);
}

export function getPlannedAttendanceSummary(entries: SquadAttendanceEntry[]) {
  const confirmedEntries = entries.filter(isExpectedFromPlannedStatus);
  const composition = participantComposition(confirmedEntries);
  return {
    expected: entries.length,
    confirmed: confirmedEntries.length,
    unavailable: entries.filter((entry) => entry.plannedStatus === "unavailable").length,
    unclear: entries.filter((entry) => entry.plannedStatus === "unclear").length,
    fieldPlayers: composition.fieldPlayers,
    goalkeepers: composition.goalkeepers,
    defensive: composition.defensive,
    midfield: composition.midfield,
    attacking: composition.attacking,
    unassigned: composition.unassigned,
    trialPlayers: confirmedEntries.filter((entry) => entry.player?.playerType === "trial").length,
    total: entries.length
  };
}

export function getFinalAttendanceSummary(entries: SquadAttendanceEntry[]) {
  const presentEntries = entries.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z");
  const composition = participantComposition(presentEntries);
  return {
    present: presentEntries.length,
    late: entries.filter((entry) => entry.finalStatus === "Z").length,
    absent: entries.filter((entry) => entry.finalStatus && !["present", "Z"].includes(entry.finalStatus)).length,
    unresolved: entries.filter((entry) => !entry.finalStatus).length,
    fieldPlayersPresent: composition.fieldPlayers,
    goalkeepersPresent: composition.goalkeepers,
    unassignedPresent: composition.unassigned,
    trialPlayersPresent: presentEntries.filter((entry) => entry.player?.playerType === "trial").length,
    totalParticipants: entries.length
  };
}

export function calculateAttendanceForecast(entries: SquadAttendanceEntry[]) {
  const planned = getPlannedAttendanceSummary(entries);
  const final = getFinalAttendanceSummary(entries);
  return {
    ...planned,
    ...final,
    confirmedTotal: planned.confirmed
  };
}

export function calculateReliabilityPenalty(entry: Pick<SquadAttendanceEntry, "finalStatus" | "latePenaltyApplied">) {
  return calculateReliabilityPenaltyFromStatus(entry.finalStatus, entry.latePenaltyApplied);
}

export function effectiveParticipantPosition(entry: SquadAttendanceEntry) {
  return normalizeCanonicalPosition(entry.player?.position) ?? firstValidSecondaryPosition(entry);
}

export function effectiveParticipantPositionFamily(entry: SquadAttendanceEntry): PositionFamily {
  return getPositionFamily(effectiveParticipantPosition(entry));
}

export function effectiveParticipantPositionLabel(entry: SquadAttendanceEntry) {
  const position = effectiveParticipantPosition(entry);
  return formatPositionLabel(position) ?? "Position not assigned";
}

export function participantComposition(entries: SquadAttendanceEntry[]) {
  const counts = {
    goalkeepers: 0,
    fieldPlayers: 0,
    defensive: 0,
    midfield: 0,
    attacking: 0,
    unassigned: 0
  };
  for (const entry of entries) {
    const family = effectiveParticipantPositionFamily(entry);
    if (family === "goalkeeper") counts.goalkeepers += 1;
    else if (family === "defensive") {
      counts.fieldPlayers += 1;
      counts.defensive += 1;
    } else if (family === "midfield") {
      counts.fieldPlayers += 1;
      counts.midfield += 1;
    } else if (family === "attacking") {
      counts.fieldPlayers += 1;
      counts.attacking += 1;
    } else {
      counts.unassigned += 1;
    }
  }
  return counts;
}

export function calculateReliabilityPenaltyFromStatus(status?: SquadFinalAttendanceStatus | null, latePenaltyApplied = true) {
  if (!status || status === "present" || status === "absent" || status === "V" || status === "K" || status === "E") return 0;
  if (status === "Z") return latePenaltyApplied ? -0.5 : 0;
  if (status === "P") return -0.5;
  if (status === "S") return -1;
  if (status === "U") return -2;
  return 0;
}

export function calculateSuggestedOverallRating(values: Array<number | null | undefined>) {
  const ratings = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5);
  if (!ratings.length) return null;
  const rounded = Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length);
  return Math.min(5, Math.max(1, rounded));
}

function firstValidSecondaryPosition(entry: SquadAttendanceEntry) {
  return entry.player?.secondaryPositions.map((position) => normalizeCanonicalPosition(position)).find(Boolean);
}
