import { ageGroups } from "@/config/options";
import type { Drill } from "@/types/domain";

export type DrillAgeMode = "all_ages" | "preset" | "custom_range";

export type AgeRange = {
  min: number | null;
  max: number | null;
};

const presetRanges: Record<string, AgeRange> = {
  "Bambini / U6": { min: 3, max: 6 },
  U7: { min: 7, max: 7 },
  U8: { min: 8, max: 8 },
  U9: { min: 9, max: 9 },
  U10: { min: 10, max: 10 },
  U11: { min: 11, max: 11 },
  U12: { min: 12, max: 12 },
  U13: { min: 13, max: 13 },
  U14: { min: 14, max: 14 },
  U15: { min: 15, max: 15 },
  U16: { min: 16, max: 16 },
  U17: { min: 17, max: 17 },
  U19: { min: 18, max: 19 },
  Adults: { min: 18, max: null }
};

export function formatCustomAgeRange(minimumAge?: number | null, maximumAge?: number | null) {
  if (minimumAge && maximumAge) return `Ages ${minimumAge}-${maximumAge}`;
  if (minimumAge) return `Age ${minimumAge}+`;
  if (maximumAge) return `Up to age ${maximumAge}`;
  return "Custom range";
}

export function formatDrillAgeSuitability(drill: Pick<Drill, "ageMode" | "ageGroups" | "minimumAge" | "maximumAge">) {
  if (drill.ageMode === "custom_range") return formatCustomAgeRange(drill.minimumAge, drill.maximumAge);
  if (drill.ageMode === "all_ages" || drill.ageGroups.includes("all_ages")) return "All ages";
  const presetGroups = drill.ageGroups.filter((group) => group !== "all_ages");
  if (!presetGroups.length) return "All ages";
  return presetGroups.join(", ");
}

export function ageFilterOptions() {
  return [
    ...ageGroups.map((group) => ({ value: group, label: group })),
    ...Array.from({ length: 18 }, (_, index) => {
      const age = index + 3;
      return { value: `age:${age}`, label: `Age ${age}` };
    })
  ];
}

export function drillMatchesAgeFilter(drill: Pick<Drill, "ageMode" | "ageGroups" | "minimumAge" | "maximumAge">, filter?: string) {
  if (!filter) return true;
  if (drill.ageMode === "all_ages" || drill.ageGroups.includes("all_ages")) return true;
  if (filter.startsWith("age:")) {
    const age = Number.parseInt(filter.replace("age:", ""), 10);
    if (!Number.isFinite(age)) return true;
    return drillMatchesExactAge(drill, age);
  }
  if (drill.ageMode === "custom_range") {
    const filterRange = presetRanges[filter];
    if (!filterRange) return false;
    return rangesOverlap({ min: drill.minimumAge ?? null, max: drill.maximumAge ?? null }, filterRange);
  }
  return drill.ageGroups.some((group) => group === filter);
}

function drillMatchesExactAge(drill: Pick<Drill, "ageMode" | "ageGroups" | "minimumAge" | "maximumAge">, age: number) {
  if (drill.ageMode === "custom_range") {
    return (drill.minimumAge == null || age >= drill.minimumAge) && (drill.maximumAge == null || age <= drill.maximumAge);
  }
  return drill.ageGroups.some((group) => {
    const range = presetRanges[group];
    return range ? rangesOverlap({ min: age, max: age }, range) : false;
  });
}

function rangesOverlap(a: AgeRange, b: AgeRange) {
  const aMin = a.min ?? Number.NEGATIVE_INFINITY;
  const aMax = a.max ?? Number.POSITIVE_INFINITY;
  const bMin = b.min ?? Number.NEGATIVE_INFINITY;
  const bMax = b.max ?? Number.POSITIVE_INFINITY;
  return aMin <= bMax && bMin <= aMax;
}
