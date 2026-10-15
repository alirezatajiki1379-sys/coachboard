import type { TrainingWorkflowState } from "@/lib/trainings/workflow";
import { isTrainingPast, isTrainingUpcoming, trainingDateTimeKey } from "@/lib/trainings/utils";
import { parseDateOnly } from "@/lib/trainings/recurrence";
import type { SquadTrainingEventDetail } from "@/types/domain";

export type TrainingCalendarView = "current" | "upcoming" | "past" | "trash" | "follow_up" | "completed" | "draft" | "all";

export type TrainingCalendarGroups = {
  today: SquadTrainingEventDetail[];
  nextSevenDays: SquadTrainingEventDetail[];
  later: SquadTrainingEventDetail[];
};

export function parseTrainingCalendarView(value?: string | string[]): TrainingCalendarView {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "rating_open") return "follow_up";
  if (raw === "upcoming" || raw === "past" || raw === "trash" || raw === "follow_up" || raw === "completed" || raw === "draft" || raw === "all") {
    return raw;
  }
  return "current";
}

export function calendarFollowUpTrainings(
  events: SquadTrainingEventDetail[],
  workflowByEventId: Record<string, TrainingWorkflowState>,
  now: { date: string; time: string }
) {
  return events
    .filter((event) => !event.deletedAt && isTrainingPast(event, now) && workflowByEventId[event.id]?.phase === "follow_up" && workflowByEventId[event.id]?.primaryAction)
    .sort((a, b) => trainingDateTimeKey(b).localeCompare(trainingDateTimeKey(a)));
}

export function calendarOperationalTrainings(
  events: SquadTrainingEventDetail[],
  workflowByEventId: Record<string, TrainingWorkflowState>
) {
  return events
    .filter((event) => {
      const phase = workflowByEventId[event.id]?.phase;
      return !event.deletedAt && (phase === "preparation" || phase === "live");
    })
    .sort((a, b) => trainingDateTimeKey(a).localeCompare(trainingDateTimeKey(b)));
}

export function groupCalendarUpcoming(
  events: SquadTrainingEventDetail[],
  now: { date: string; time: string }
): TrainingCalendarGroups {
  const today = parseDateOnly(now.date);
  const seventhDay = today
    ? new Date(Date.UTC(today.year, today.month - 1, today.day + 7)).toISOString().slice(0, 10)
    : now.date;
  const sorted = [...events].sort((a, b) => trainingDateTimeKey(a).localeCompare(trainingDateTimeKey(b)));
  return {
    today: sorted.filter((event) => event.date === now.date),
    nextSevenDays: sorted.filter((event) => event.date > now.date && event.date <= seventhDay),
    later: sorted.filter((event) => event.date > seventhDay)
  };
}

export function calendarEventsForLegacyView(
  events: SquadTrainingEventDetail[],
  view: Exclude<TrainingCalendarView, "current" | "follow_up" | "trash">,
  now: { date: string; time: string }
) {
  if (view === "upcoming") {
    return events.filter((event) => !event.deletedAt && isTrainingUpcoming(event, now)).sort((a, b) => trainingDateTimeKey(a).localeCompare(trainingDateTimeKey(b)));
  }
  if (view === "past") {
    return events.filter((event) => !event.deletedAt && isTrainingPast(event, now)).sort((a, b) => trainingDateTimeKey(b).localeCompare(trainingDateTimeKey(a)));
  }
  if (view === "completed") return events.filter((event) => !event.deletedAt && event.status === "completed").sort((a, b) => trainingDateTimeKey(b).localeCompare(trainingDateTimeKey(a)));
  if (view === "draft") return events.filter((event) => !event.deletedAt && event.status === "draft").sort((a, b) => trainingDateTimeKey(a).localeCompare(trainingDateTimeKey(b)));
  return [...events].filter((event) => !event.deletedAt).sort((a, b) => trainingDateTimeKey(b).localeCompare(trainingDateTimeKey(a)));
}
