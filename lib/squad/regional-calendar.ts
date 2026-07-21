export const germanFederalStates = [
  { code: "DE-BW", name: "Baden-Wurttemberg" },
  { code: "DE-BY", name: "Bayern" },
  { code: "DE-BE", name: "Berlin" },
  { code: "DE-BB", name: "Brandenburg" },
  { code: "DE-HB", name: "Bremen" },
  { code: "DE-HH", name: "Hamburg" },
  { code: "DE-HE", name: "Hessen" },
  { code: "DE-MV", name: "Mecklenburg-Vorpommern" },
  { code: "DE-NI", name: "Niedersachsen" },
  { code: "DE-NW", name: "Nordrhein-Westfalen" },
  { code: "DE-RP", name: "Rheinland-Pfalz" },
  { code: "DE-SL", name: "Saarland" },
  { code: "DE-SN", name: "Sachsen" },
  { code: "DE-ST", name: "Sachsen-Anhalt" },
  { code: "DE-SH", name: "Schleswig-Holstein" },
  { code: "DE-TH", name: "Thuringen" }
] as const;

export type GermanFederalStateCode = (typeof germanFederalStates)[number]["code"];

export type CalendarConflictCategory =
  | "public_holiday"
  | "school_holiday"
  | "movable_holiday"
  | "local_customary_day"
  | "team_custom_exclusion";

export type CalendarConflictEvent = {
  id: string;
  name: string;
  category: CalendarConflictCategory;
  startsOn: string;
  endsOn: string;
  source: string;
  confidence: "official" | "team_confirmed" | "coach_created" | "suggested";
  excludeByDefault: boolean;
};

export type CalendarConflictContext = {
  teamId?: string;
  countryCode?: string;
  federalStateCode?: string;
  city?: string;
  preferences: {
    publicHolidays: "ask" | "exclude" | "keep";
    schoolHolidays: "ask" | "exclude" | "keep";
    localMovableHolidays: "confirmed_only" | "ask" | "exclude" | "keep";
    customExclusions: "exclude" | "ask" | "keep";
  };
  events: CalendarConflictEvent[];
  sourceLabel: string;
};

export type CalendarConflict = {
  date: string;
  event: CalendarConflictEvent;
};

export function federalStateName(code?: string) {
  return germanFederalStates.find((state) => state.code === code)?.name ?? code ?? "";
}

export function isGermanFederalState(value: string): value is GermanFederalStateCode {
  return germanFederalStates.some((state) => state.code === value);
}

export function findCalendarConflicts(date: string, context?: CalendarConflictContext): CalendarConflict[] {
  if (!date || !context) return [];
  return context.events.filter((event) => date >= event.startsOn && date <= event.endsOn).map((event) => ({ date, event }));
}

export function summarizeCalendarConflicts(dates: string[], context?: CalendarConflictContext) {
  const byDate = new Map<string, CalendarConflict[]>();
  for (const date of dates) {
    const conflicts = findCalendarConflicts(date, context);
    if (conflicts.length) byDate.set(date, conflicts);
  }
  return byDate;
}

export function shouldExcludeByDefault(conflict: CalendarConflict, context: CalendarConflictContext) {
  const category = conflict.event.category;
  if (category === "public_holiday") return context.preferences.publicHolidays === "exclude";
  if (category === "school_holiday") return context.preferences.schoolHolidays === "exclude";
  if (category === "team_custom_exclusion") return context.preferences.customExclusions === "exclude" || conflict.event.excludeByDefault;
  if (category === "movable_holiday" || category === "local_customary_day") return context.preferences.localMovableHolidays === "exclude" && conflict.event.confidence !== "suggested";
  return false;
}

export function publicHolidaysForGermanState(stateCode: string | undefined, startDate: string, endDate: string): CalendarConflictEvent[] {
  if (!stateCode) return [];
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return [];
  const result: CalendarConflictEvent[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (const item of holidaysForYear(year, stateCode)) {
      if (item.date >= startDate && item.date <= endDate) {
        result.push({
          id: `public-${stateCode}-${item.date}-${slug(item.name)}`,
          name: item.name,
          category: "public_holiday",
          startsOn: item.date,
          endsOn: item.date,
          source: "Calculated German public holiday rules",
          confidence: "official",
          excludeByDefault: false
        });
      }
    }
  }
  return result;
}

export function suggestedLocalDaysForGermanState(stateCode: string | undefined, startDate: string, endDate: string): CalendarConflictEvent[] {
  if (stateCode !== "DE-NW" && stateCode !== "DE-RP") return [];
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const result: CalendarConflictEvent[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const easter = easterDate(year);
    const date = addDays(easter, -48);
    if (date >= startDate && date <= endDate) {
      result.push({
        id: `suggested-rosenmontag-${stateCode}-${date}`,
        name: "Rosenmontag",
        category: "local_customary_day",
        startsOn: date,
        endsOn: date,
        source: "CoachBoard suggestion; confirm locally",
        confidence: "suggested",
        excludeByDefault: false
      });
    }
  }
  return result;
}

function holidaysForYear(year: number, stateCode: string) {
  const easter = easterDate(year);
  const items = [
    fixed(year, 1, 1, "Neujahr"),
    add(easter, -2, "Karfreitag"),
    add(easter, 1, "Ostermontag"),
    fixed(year, 5, 1, "Tag der Arbeit"),
    add(easter, 39, "Christi Himmelfahrt"),
    add(easter, 50, "Pfingstmontag"),
    fixed(year, 10, 3, "Tag der Deutschen Einheit"),
    fixed(year, 12, 25, "1. Weihnachtstag"),
    fixed(year, 12, 26, "2. Weihnachtstag")
  ];
  if (["DE-BW", "DE-BY", "DE-ST"].includes(stateCode)) items.push(fixed(year, 1, 6, "Heilige Drei Konige"));
  if (["DE-BW", "DE-BY", "DE-HE", "DE-NW", "DE-RP", "DE-SL"].includes(stateCode)) items.push(add(easter, 60, "Fronleichnam"));
  if (["DE-SL", "DE-BY"].includes(stateCode)) items.push(fixed(year, 8, 15, "Maria Himmelfahrt"));
  if (["DE-BW", "DE-BY", "DE-NW", "DE-RP", "DE-SL"].includes(stateCode)) items.push(fixed(year, 11, 1, "Allerheiligen"));
  if (["DE-BB", "DE-MV", "DE-SN", "DE-ST", "DE-TH"].includes(stateCode)) items.push(fixed(year, 10, 31, "Reformationstag"));
  if (stateCode === "DE-BE") items.push(fixed(year, 3, 8, "Internationaler Frauentag"));
  if (stateCode === "DE-TH") items.push(fixed(year, 9, 20, "Weltkindertag"));
  if (stateCode === "DE-SN") items.push(add(easter, 60 + daysUntilWeekday(addDays(easter, 60), 3), "Buss- und Bettag"));
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function fixed(year: number, month: number, day: number, name: string) {
  return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, name };
}

function add(date: string, days: number, name: string) {
  return { date: addDays(date, days), name };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysUntilWeekday(date: string, weekday: number) {
  const current = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (weekday - current + 7) % 7;
}

function easterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return fixed(year, month, day, "Ostern").date;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
