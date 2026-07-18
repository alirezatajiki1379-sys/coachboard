import type { PlayerDevelopmentGoalCategory, PlayerDevelopmentGoalPriority, PlayerDevelopmentGoalStatus, PlayerDevelopmentProgress } from "@/types/domain";

export const developmentGoalCategories: Array<{ value: PlayerDevelopmentGoalCategory; label: string }> = [
  { value: "technique", label: "Technique" },
  { value: "tactical_understanding", label: "Tactical understanding" },
  { value: "decision_making", label: "Decision making" },
  { value: "physical", label: "Physical" },
  { value: "mental", label: "Mental" },
  { value: "communication", label: "Communication" },
  { value: "leadership", label: "Leadership" },
  { value: "goalkeeping", label: "Goalkeeping" },
  { value: "behaviour", label: "Behaviour" },
  { value: "individual", label: "Individual" }
];

export const developmentGoalPriorities: Array<{ value: PlayerDevelopmentGoalPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

export const developmentGoalStatuses: Array<{ value: PlayerDevelopmentGoalStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" }
];

export const developmentProgressOptions: Array<{ value: PlayerDevelopmentProgress; label: string }> = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "almost_there", label: "Almost there" },
  { value: "completed", label: "Completed" }
];

export function developmentCategoryLabel(value?: string | null) {
  return developmentGoalCategories.find((item) => item.value === value)?.label ?? "Individual";
}

export function developmentPriorityLabel(value?: string | null) {
  return developmentGoalPriorities.find((item) => item.value === value)?.label ?? "Medium";
}

export function developmentStatusLabel(value?: string | null) {
  return developmentGoalStatuses.find((item) => item.value === value)?.label ?? "Active";
}

export function developmentProgressLabel(value?: string | null) {
  return developmentProgressOptions.find((item) => item.value === value)?.label ?? "In progress";
}
