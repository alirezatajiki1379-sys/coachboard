import type { SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";

export function formatEventDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

export function eventTitle(event: SquadTrainingEvent) {
  return event.label || event.linkedTrainingSessionTitle || "Training";
}

export function eventTimeRange(event: SquadTrainingEvent) {
  return event.endTime ? `${event.startTime}-${event.endTime}` : event.startTime;
}

export function attendanceDisplayName(entry: SquadAttendanceEntry) {
  if (entry.player) return [entry.player.firstName, entry.player.lastName].filter(Boolean).join(" ");
  return "Unknown player";
}

export function attendanceCounts(entries: SquadAttendanceEntry[]) {
  const isAttending = (entry: SquadAttendanceEntry) => entry.finalStatus === "present" || entry.finalStatus === "Z" || (!entry.finalStatus && entry.plannedStatus === "expected");
  return {
    expected: entries.filter((entry) => entry.plannedStatus === "expected").length,
    present: entries.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z").length,
    absent: entries.filter((entry) => entry.finalStatus && !["present", "Z"].includes(entry.finalStatus)).length,
    unavailable: entries.filter((entry) => entry.plannedStatus === "unavailable").length,
    unclear: entries.filter((entry) => entry.plannedStatus === "unclear").length,
    confirmedTotal: entries.filter(isAttending).length,
    fieldPlayers: entries.filter((entry) => isAttending(entry) && entry.player?.position?.toLowerCase() !== "goalkeeper").length,
    goalkeepers: entries.filter((entry) => isAttending(entry) && entry.player?.position?.toLowerCase() === "goalkeeper").length,
    trialPlayers: entries.filter((entry) => isAttending(entry) && entry.player?.playerType === "trial").length,
    late: entries.filter((entry) => entry.finalStatus === "Z").length
  };
}

export function plannedStatusLabel(status?: SquadAttendanceEntry["plannedStatus"]) {
  if (status === "expected") return "Expected";
  if (status === "unavailable") return "Unavailable";
  if (status === "unclear") return "Unclear";
  return "Not planned";
}

export function finalStatusLabel(status?: SquadAttendanceEntry["finalStatus"]) {
  const labels: Record<NonNullable<SquadAttendanceEntry["finalStatus"]>, string> = {
    present: "Present",
    Z: "Late",
    V: "Excused",
    K: "Ill",
    E: "Parents excused",
    P: "Private",
    S: "School",
    U: "Unexcused"
  };
  return status ? labels[status] : "Open";
}

export function reliabilityMalus(entry: SquadAttendanceEntry) {
  if (!entry.finalStatus || entry.finalStatus === "present" || ["V", "K", "E"].includes(entry.finalStatus)) return 0;
  if (entry.finalStatus === "Z") return entry.latePenaltyApplied ? -0.5 : 0;
  if (entry.finalStatus === "P") return -0.5;
  if (entry.finalStatus === "S") return -1;
  if (entry.finalStatus === "U") return -2;
  return 0;
}
