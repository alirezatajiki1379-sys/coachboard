import { formatDrillAgeSuitability } from "@/lib/drills/age-suitability";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import type { Locale } from "@/lib/i18n";
import type { Drill } from "@/types/domain";

export function drillAgeLabel(drill: Pick<Drill, "ageMode" | "ageGroups" | "minimumAge" | "maximumAge">, locale: Locale) {
  const ui = createSystemTranslator(locale);
  // The canonical formatter determines meaning; only its display labels change.
  return formatDrillAgeSuitability(drill).split(", ").map((value) => ui(value)).join(", ");
}

export function drillUsageDate(date: string, locale: Locale) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}
