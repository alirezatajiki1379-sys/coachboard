import type { PlayerDevelopmentGoalCategory, PlayerDevelopmentGoalPriority, PlayerDevelopmentGoalStatus, PlayerDevelopmentProgress } from "@/types/domain";

export const developmentGoalCategories: Array<{ value: PlayerDevelopmentGoalCategory; label: string }> = [
  { value: "technical", label: "Technical" },
  { value: "tactical", label: "Tactical" },
  { value: "physical", label: "Physical" },
  { value: "mental", label: "Mental" },
  { value: "other", label: "Other" }
];

export const developmentGoalPriorities: Array<{ value: PlayerDevelopmentGoalPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

export const developmentGoalStatuses: Array<{ value: PlayerDevelopmentGoalStatus; label: string }> = [
  { value: "identified", label: "Identified" },
  { value: "in_progress", label: "In progress" },
  { value: "achieved", label: "Achieved" },
  { value: "paused", label: "Paused" }
];

export const developmentProgressOptions: Array<{ value: PlayerDevelopmentProgress; label: string }> = [
  { value: "needs_attention", label: "Needs attention" },
  { value: "developing", label: "Developing" },
  { value: "consistent", label: "Consistent" },
  { value: "achieved", label: "Achieved" }
];

export function developmentCategoryLabel(value?: string | null) {
  return developmentGoalCategories.find((item) => item.value === value)?.label ?? "Other";
}

export function developmentPriorityLabel(value?: string | null) {
  return developmentGoalPriorities.find((item) => item.value === value)?.label ?? "Medium";
}

export function developmentStatusLabel(value?: string | null) {
  return developmentGoalStatuses.find((item) => item.value === value)?.label ?? "In progress";
}

export function developmentProgressLabel(value?: string | null) {
  return developmentProgressOptions.find((item) => item.value === value)?.label ?? "Developing";
}
