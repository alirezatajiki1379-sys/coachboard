export type TrainingRecurrenceInput = {
  startDate: string;
  intervalWeeks: number;
  weekdays: number[];
  endMode: "date" | "occurrence_count";
  endDate?: string;
  occurrenceCount?: number;
};

export function weekdayForDate(date: string) {
  const parsed = parseDateOnly(date);
  if (!parsed) return 1;
  const day = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function generateTrainingRecurrenceDates(input: TrainingRecurrenceInput) {
  const start = parseDateOnly(input.startDate);
  if (!start) return [];
  const intervalWeeks = Number.isFinite(input.intervalWeeks) && input.intervalWeeks > 0 ? Math.floor(input.intervalWeeks) : 1;
  const weekdays = Array.from(new Set(input.weekdays.filter((day) => day >= 1 && day <= 7))).sort((a, b) => a - b);
  if (!weekdays.length) return [];
  const limit = input.endMode === "occurrence_count" ? Math.max(0, Math.floor(input.occurrenceCount ?? 0)) : 500;
  if (input.endMode === "occurrence_count" && !limit) return [];
  const end = input.endMode === "date" ? parseDateOnly(input.endDate ?? "") : null;
  if (input.endMode === "date" && !end) return [];
  const startDate = Date.UTC(start.year, start.month - 1, start.day);
  const endDate = end ? Date.UTC(end.year, end.month - 1, end.day) : Number.POSITIVE_INFINITY;
  if (endDate < startDate) return [];
  const anchorWeekStart = startDate - (weekdayForDate(input.startDate) - 1) * 24 * 60 * 60 * 1000;
  const dates = new Set<string>();
  const maxIterations = 800;
  for (let weekIndex = 0; weekIndex < maxIterations; weekIndex += intervalWeeks) {
    for (const weekday of weekdays) {
      const time = anchorWeekStart + (weekIndex * 7 + weekday - 1) * 24 * 60 * 60 * 1000;
      if (time < startDate) continue;
      if (time > endDate) return Array.from(dates).sort();
      dates.add(new Date(time).toISOString().slice(0, 10));
      if (input.endMode === "occurrence_count" && dates.size >= limit) return Array.from(dates).sort();
    }
  }
  return Array.from(dates).sort();
}

export function parseDateOnly(date: string) {
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  return { year, month, day };
}
