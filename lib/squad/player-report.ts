import { effectiveActualAbsenceReason } from "@/lib/squad/attendance-format";
import type { Locale } from "@/lib/i18n";
import type { PlayerAnalyticsRecord } from "@/lib/squad/analytics";
import type { PlayerAvailabilityPeriod, PlayerMedicalPeriod, PlayerNote } from "@/types/domain";

export type PlayerReportRange = { from?: string; to?: string };
export type ReportAbsenceReason = "injured" | "sick" | "school" | "work" | "holiday" | "private" | "other" | "excused" | "unexcused" | "late_cancellation" | "not_recorded";

export function reportRangeFromRecords(records: PlayerAnalyticsRecord[], customFrom?: string, customTo?: string): PlayerReportRange {
  if (customFrom || customTo) return { from: customFrom, to: customTo };
  const dates = records.map((record) => record.event?.date).filter((date): date is string => Boolean(date)).sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : {};
}

export function overlapsReportRange(start: string, end: string | undefined, range: PlayerReportRange) {
  const effectiveEnd = end ?? "9999-12-31";
  if (range.from && effectiveEnd < range.from) return false;
  if (range.to && start > range.to) return false;
  return true;
}

export function relevantMedicalPeriods(periods: PlayerMedicalPeriod[], range: PlayerReportRange) {
  return periods.filter((period) => period.status !== "cancelled" && overlapsReportRange(period.startDate, period.actualReturnDate ?? period.endDate, range));
}

export function relevantAvailabilityPeriods(periods: PlayerAvailabilityPeriod[], range: PlayerReportRange) {
  return periods.filter((period) => period.status !== "cancelled" && overlapsReportRange(period.startsOn, period.endsOn, range));
}

export function selectableConversationNotes(notes: PlayerNote[], range: PlayerReportRange) {
  return notes.filter((note) => note.visibility === "conversation_eligible" && dateInRange(note.noteDate, range));
}

export function playerNotesInRange(notes: PlayerNote[], range: PlayerReportRange) {
  return notes.filter((note) => dateInRange(note.noteDate, range));
}

export function selectedConversationNotes(notes: PlayerNote[], selectedIds: string[], range: PlayerReportRange) {
  const selected = new Set(selectedIds);
  return selectableConversationNotes(notes, range).filter((note) => selected.has(note.id));
}

export function isMissedTraining(record: PlayerAnalyticsRecord) {
  return record.finalStatus === "absent" || record.finalStatus === "V" || record.finalStatus === "K" || record.finalStatus === "E" || record.finalStatus === "P" || record.finalStatus === "S" || record.finalStatus === "U";
}

export function absenceReason(record: PlayerAnalyticsRecord): ReportAbsenceReason {
  const actual = effectiveActualAbsenceReason(record);
  if (actual) return actual;
  if (record.finalStatus === "V") return "injured";
  if (record.finalStatus === "K") return "sick";
  if (record.finalStatus === "E") return "excused";
  if (record.finalStatus === "P") return "private";
  if (record.finalStatus === "S") return "late_cancellation";
  if (record.finalStatus === "U") return "unexcused";
  return "not_recorded";
}

export function absenceReasonLabel(reason: ReportAbsenceReason, locale: Locale) {
  const labels: Record<Locale, Record<ReportAbsenceReason, string>> = {
    en: {
      injured: "Injured",
      sick: "Sick",
      school: "School",
      work: "Work",
      holiday: "Holiday",
      private: "Private",
      other: "Other",
      excused: "Excused",
      unexcused: "Unexcused",
      late_cancellation: "Late cancellation",
      not_recorded: "Reason not recorded"
    },
    de: {
      injured: "Verletzt",
      sick: "Krank",
      school: "Schule",
      work: "Arbeit",
      holiday: "Urlaub",
      private: "Privat",
      other: "Sonstiges",
      excused: "Entschuldigt",
      unexcused: "Unentschuldigt",
      late_cancellation: "Späte Absage",
      not_recorded: "Grund nicht erfasst"
    }
  };
  return labels[locale][reason];
}

export function absenceDistribution(records: PlayerAnalyticsRecord[]) {
  const result = new Map<ReportAbsenceReason, number>();
  for (const record of records.filter(isMissedTraining)) {
    const reason = absenceReason(record);
    result.set(reason, (result.get(reason) ?? 0) + 1);
  }
  return Array.from(result.entries()).map(([reason, count]) => ({ reason, count }));
}

function dateInRange(date: string, range: PlayerReportRange) {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}
