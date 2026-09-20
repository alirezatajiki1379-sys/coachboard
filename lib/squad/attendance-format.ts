import type { SquadAttendanceEntry, SquadTrainingEvent } from "@/types/domain";
import { formatDate, type Locale } from "@/lib/i18n";
import { systemText } from "@/lib/i18n/system-text";
import { attendanceReasonLabels, calculateAttendanceForecast, calculateReliabilityPenalty } from "@/lib/squad/attendance-utils";

export function formatEventDate(value: string, locale?: Locale) {
  if (locale) return formatDate(value, locale, { day: "2-digit", month: "2-digit", year: "numeric" });
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

export function plannedStatusLabel(status?: SquadAttendanceEntry["plannedStatus"], locale: Locale = "en") {
  return systemText(locale, status === "unavailable" || status === "unclear" ? "Not expected" : "Expected");
}

export function plannedReasonLabel(reason?: SquadAttendanceEntry["plannedReason"], locale: Locale = "en") {
  return reason ? systemText(locale, attendanceReasonLabels[reason]) : "";
}

export function finalStatusLabel(status?: SquadAttendanceEntry["finalStatus"], locale: Locale = "en") {
  const labels: Record<NonNullable<SquadAttendanceEntry["finalStatus"]>, string> = {
    present: "Present",
    absent: "Absent",
    Z: "Late",
    V: "Injured",
    K: "Sick",
    E: "Excused",
    P: "Private reason",
    S: "Late cancellation",
    U: "Unexcused"
  };
  return systemText(locale, status ? labels[status] : "Not recorded");
}

export function actualAbsenceReasonLabel(reason?: SquadAttendanceEntry["actualAbsenceReason"], locale: Locale = "en") {
  const labels: Record<NonNullable<SquadAttendanceEntry["actualAbsenceReason"]>, string> = {
    unexcused: "Unexcused",
    excused: "Excused",
    sick: "Sick",
    injured: "Injured",
    school: "School",
    work: "Work",
    holiday: "Holiday",
    private: "Private",
    other: "Other"
  };
  return reason ? systemText(locale, labels[reason]) : "";
}

export function effectiveActualAbsenceReason(entry: SquadAttendanceEntry): SquadAttendanceEntry["actualAbsenceReason"] {
  if (entry.actualAbsenceReason) return entry.actualAbsenceReason;
  if (entry.finalStatus === "V") return "injured";
  if (entry.finalStatus === "K") return "sick";
  if (entry.finalStatus === "E") return "excused";
  if (entry.finalStatus === "P") return "private";
  if (entry.finalStatus === "U") return "unexcused";
  return undefined;
}

export function reliabilityMalus(entry: SquadAttendanceEntry) {
  return calculateReliabilityPenalty(entry);
}
