import { trainingBlocks, mainFocuses } from "@/config/options";
import { systemText } from "@/lib/i18n/system-text";
import type { Locale } from "@/lib/i18n";

// Legacy stored labels remain valid. New presentation IDs do not rewrite saved plans.
export const trainingSectionLabels = {
  activation: "Activation",
  arrival: "Arrival / Activation",
  warm_up: "Warm-up",
  technical: "Technical part",
  main_part: "Main Part",
  main_part_1: "Main part 1",
  main_part_2: "Main part 2",
  final_part: "Final Part",
  game_form: "Game Form",
  cool_down: "Cool-down"
} as const;

const builtInSections = new Set<string>([...trainingBlocks, ...Object.values(trainingSectionLabels), "Main Part 1", "Main Part 2"]);

export function trainingSectionLabel(value: string, locale: Locale, custom = false) {
  if (custom) return value;
  const canonical = Object.prototype.hasOwnProperty.call(trainingSectionLabels, value)
    ? trainingSectionLabels[value as keyof typeof trainingSectionLabels] : value;
  return builtInSections.has(canonical) ? systemText(locale, canonical) : value;
}

export function trainingFocusLabel(value: string, locale: Locale) {
  return (mainFocuses as string[]).includes(value) ? systemText(locale, value) : value;
}
