import type { SquadTrainingEventDetail } from "@/types/domain";
import { getFinalAttendanceSummary, getPlannedAttendanceSummary } from "@/lib/squad/attendance-utils";

export type TrainingFilter = "all" | "upcoming" | "past" | "rating_open" | "completed" | "draft";

export type RecurringTrainingInput = {
  startDate: string;
  endDate: string;
  intervalWeeks: 1 | 2;
};

export function seasonLabelForDate(date: string, startMonth = 7, startDay = 1) {
  const parsed = parseDateOnly(date);
  if (!parsed) return "";
  const seasonStartYear =
    parsed.month > startMonth || (parsed.month === startMonth && parsed.day >= startDay)
      ? parsed.year
      : parsed.year - 1;
  return `${seasonStartYear}/${String(seasonStartYear + 1).slice(-2)}`;
}

export function trainingDisplayTitle(event: Pick<SquadTrainingEventDetail, "label" | "date">) {
  return event.label || `Training on ${formatDateLabel(event.date)}`;
}

export function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}

export function weekdayLabel(date: string) {
  const parsed = parseDateOnly(date);
  if (!parsed) return "";
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).toLocaleDateString("en-GB", { weekday: "long" });
  return value;
}

export function trainingTimeRange(event: Pick<SquadTrainingEventDetail, "startTime" | "endTime">) {
  return event.endTime ? `${event.startTime}-${event.endTime}` : event.startTime;
}

export function trainingPlanStatus(event: Pick<SquadTrainingEventDetail, "linkedTrainingSessionId">) {
  return event.linkedTrainingSessionId ? "Plan available" : "No plan";
}

export function trainingRatingStats(event: SquadTrainingEventDetail) {
  const rateable = event.attendance.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z");
  return {
    rated: rateable.filter((entry) => entry.overallRating).length,
    rateable: rateable.length
  };
}

export function sortTrainings(events: SquadTrainingEventDetail[], today = todayDateString()) {
  const upcoming = events
    .filter((event) => event.date >= today)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  const past = events
    .filter((event) => event.date < today)
    .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  return [...upcoming, ...past];
}

export function filterTrainings(events: SquadTrainingEventDetail[], filter: TrainingFilter, today = todayDateString()) {
  if (filter === "upcoming") return events.filter((event) => event.date >= today);
  if (filter === "past") return events.filter((event) => event.date < today);
  if (filter === "rating_open") {
    return events.filter((event) => {
      const ratings = trainingRatingStats(event);
      return event.status === "rating_open" || (event.date < today && ratings.rateable > ratings.rated);
    });
  }
  if (filter === "completed") return events.filter((event) => event.status === "completed");
  if (filter === "draft") return events.filter((event) => event.status === "draft");
  return events;
}

export function parseTrainingFilter(value?: string | string[]): TrainingFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "upcoming" || raw === "past" || raw === "rating_open" || raw === "completed" || raw === "draft" ? raw : "all";
}

export function generateRecurringTrainingDates(input: RecurringTrainingInput) {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (!start || !end) return [];
  const startDate = Date.UTC(start.year, start.month - 1, start.day);
  const endDate = Date.UTC(end.year, end.month - 1, end.day);
  if (endDate < startDate) return [];
  const dates: string[] = [];
  const stepDays = input.intervalWeeks * 7;
  for (let time = startDate; time <= endDate; time += stepDays * 24 * 60 * 60 * 1000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

export function trainingSummaryCounts(event: SquadTrainingEventDetail) {
  const plannedAttendance = getPlannedAttendanceSummary(event.attendance);
  const finalAttendance = getFinalAttendanceSummary(event.attendance);
  const ratings = trainingRatingStats(event);
  return { attendance: { ...plannedAttendance, ...finalAttendance, confirmedTotal: plannedAttendance.expected }, plannedAttendance, finalAttendance, ratings };
}

function parseDateOnly(date: string) {
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
