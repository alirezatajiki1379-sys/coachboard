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
  if (entry.trialPlayer) return `${entry.trialPlayer.displayName} (trial)`;
  return "Unknown player";
}

export function attendanceCounts(entries: SquadAttendanceEntry[]) {
  return {
    expected: entries.filter((entry) => entry.status === "expected").length,
    present: entries.filter((entry) => entry.status === "present").length,
    absent: entries.filter((entry) => entry.status === "absent").length,
    unavailable: entries.filter((entry) => entry.status === "unavailable").length,
    unclear: entries.filter((entry) => entry.status === "unclear").length
  };
}
