import type { SquadAttendanceEntry, SquadAttendanceReason, SquadFinalAttendanceStatus } from "@/types/domain";

export const attendanceReasonLabels: Record<SquadAttendanceReason, string> = {
  V: "Injured",
  K: "Sick",
  E: "Excused",
  P: "Private reason",
  S: "Late cancellation",
  Z: "Late",
  U: "Unexcused"
};

export function isGoalkeeperPosition(position?: string) {
  if (!position) return false;
  const normalized = position.trim().toLowerCase();
  return ["goalkeeper", "keeper", "gk", "torwart", "tw"].includes(normalized);
}

export function isExpectedFromPlannedStatus(entry: Pick<SquadAttendanceEntry, "plannedStatus">) {
  return !entry.plannedStatus || entry.plannedStatus === "expected";
}

export function isConfirmedAttending(entry: SquadAttendanceEntry) {
  if (entry.finalStatus === "present" || entry.finalStatus === "Z") return true;
  if (entry.finalStatus) return false;
  return isExpectedFromPlannedStatus(entry);
}

export function getPlannedAttendanceSummary(entries: SquadAttendanceEntry[]) {
  const expectedEntries = entries.filter(isExpectedFromPlannedStatus);
  return {
    expected: expectedEntries.length,
    unavailable: entries.filter((entry) => entry.plannedStatus === "unavailable").length,
    unclear: entries.filter((entry) => entry.plannedStatus === "unclear").length,
    fieldPlayers: expectedEntries.filter((entry) => !isGoalkeeperPosition(entry.player?.position)).length,
    goalkeepers: expectedEntries.filter((entry) => isGoalkeeperPosition(entry.player?.position)).length,
    trialPlayers: expectedEntries.filter((entry) => entry.player?.playerType === "trial").length,
    total: entries.length
  };
}

export function getFinalAttendanceSummary(entries: SquadAttendanceEntry[]) {
  const presentEntries = entries.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z");
  return {
    present: presentEntries.length,
    late: entries.filter((entry) => entry.finalStatus === "Z").length,
    absent: entries.filter((entry) => entry.finalStatus && !["present", "Z"].includes(entry.finalStatus)).length,
    unresolved: entries.filter((entry) => !entry.finalStatus).length,
    goalkeepersPresent: presentEntries.filter((entry) => isGoalkeeperPosition(entry.player?.position)).length,
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
    confirmedTotal: planned.expected
  };
}

export function calculateReliabilityPenalty(entry: Pick<SquadAttendanceEntry, "finalStatus" | "latePenaltyApplied">) {
  return calculateReliabilityPenaltyFromStatus(entry.finalStatus, entry.latePenaltyApplied);
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
