import type { SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";
import { attendanceReasonLabels, calculateAttendanceForecast, calculateReliabilityPenalty } from "@/lib/squad/attendance-utils";

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
  return calculateAttendanceForecast(entries);
}

export function plannedStatusLabel(status?: SquadAttendanceEntry["plannedStatus"]) {
  if (status === "expected") return "Expected";
  if (status === "unavailable") return "Unavailable";
  if (status === "unclear") return "Unclear";
  return "Expected";
}

export function plannedReasonLabel(reason?: SquadAttendanceEntry["plannedReason"]) {
  return reason ? attendanceReasonLabels[reason] : "";
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
  return calculateReliabilityPenalty(entry);
}
