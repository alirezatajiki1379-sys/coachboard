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
  | "statutory_public_holiday"
  | "official_school_holiday"
  | "movable_school_holiday"
  | "local_school_free_day"
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

type SchoolHolidayPeriod = {
  stateCode: GermanFederalStateCode;
  name: string;
  startsOn: string;
  endsOn: string;
  sourceVersion: string;
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
  if (category === "statutory_public_holiday") return context.preferences.publicHolidays === "exclude";
  if (category === "official_school_holiday") return context.preferences.schoolHolidays === "exclude";
  if (category === "team_custom_exclusion") return context.preferences.customExclusions === "exclude" || conflict.event.excludeByDefault;
  if (category === "movable_school_holiday" || category === "local_school_free_day") return context.preferences.localMovableHolidays === "exclude" && conflict.event.confidence !== "suggested";
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
          category: "statutory_public_holiday",
          startsOn: item.date,
          endsOn: item.date,
          source: "Official federal-state public holiday",
          confidence: "official",
          excludeByDefault: false
        });
      }
    }
  }
  return result;
}

export function municipalitySpecificPublicHolidayWarningsForGermanState(stateCode: string | undefined, city: string | undefined, startDate: string, endDate: string): CalendarConflictEvent[] {
  if (!stateCode) return [];
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return [];
  const normalizedCity = normalizePlace(city);
  const result: CalendarConflictEvent[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const easter = easterDate(year);
    const regionalItems: Array<{ date: string; name: string; appliesOfficially: boolean }> = [];
    if (stateCode === "DE-BY") {
      regionalItems.push({
        date: `${year}-08-08`,
        name: "Augsburger Friedensfest",
        appliesOfficially: normalizedCity === "augsburg"
      });
      regionalItems.push({
        date: `${year}-08-15`,
        name: "Maria Himmelfahrt",
        appliesOfficially: false
      });
    }
    if (stateCode === "DE-SN" || stateCode === "DE-TH") {
      regionalItems.push({
        date: addDays(easter, 60),
        name: "Fronleichnam",
        appliesOfficially: false
      });
    }
    for (const item of regionalItems) {
      if (item.date < startDate || item.date > endDate) continue;
      result.push({
        id: `regional-public-${stateCode}-${item.date}-${slug(item.name)}-${item.appliesOfficially ? "official" : "warning"}`,
        name: item.appliesOfficially ? item.name : `${item.name} may apply regionally`,
        category: "statutory_public_holiday",
        startsOn: item.date,
        endsOn: item.date,
        source: item.appliesOfficially ? "Official municipality-specific holiday" : "Municipality-specific holiday warning",
        confidence: item.appliesOfficially ? "official" : "suggested",
        excludeByDefault: false
      });
    }
  }
  return result;
}

export function officialSchoolHolidaysForGermanState(stateCode: string | undefined, startDate: string, endDate: string): CalendarConflictEvent[] {
  if (!stateCode || !isGermanFederalState(stateCode)) return [];
  return schoolHolidayPeriods
    .filter((period) => period.stateCode === stateCode && period.startsOn <= endDate && period.endsOn >= startDate)
    .map((period) => ({
      id: `school-${period.stateCode}-${period.startsOn}-${period.endsOn}-${slug(period.name)}`,
      name: period.name,
      category: "official_school_holiday",
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      source: `Official KMK school-holiday data ${period.sourceVersion}`,
      confidence: "official",
      excludeByDefault: false
    }));
}

export function suggestedLocalDaysForGermanState(stateCode: string | undefined, startDate: string, endDate: string, officialEvents: CalendarConflictEvent[] = []): CalendarConflictEvent[] {
  if (stateCode !== "DE-NW" && stateCode !== "DE-RP" && stateCode !== "DE-HE" && stateCode !== "DE-BW") return [];
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const result: CalendarConflictEvent[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const easter = easterDate(year);
    const date = addDays(easter, -48);
    if (officialEvents.some((event) => event.startsOn <= date && event.endsOn >= date)) continue;
    if (date >= startDate && date <= endDate) {
      result.push({
        id: `suggested-rosenmontag-${stateCode}-${date}`,
        name: "Rosenmontag",
        category: "movable_school_holiday",
        startsOn: date,
        endsOn: date,
        source: "Suggested date requiring confirmation",
        confidence: "suggested",
        excludeByDefault: false
      });
    }
  }
  return result;
}

export function normalizeCalendarCategory(category: string): CalendarConflictCategory {
  if (category === "public_holiday") return "statutory_public_holiday";
  if (category === "school_holiday") return "official_school_holiday";
  if (category === "movable_holiday") return "movable_school_holiday";
  if (category === "local_customary_day") return "local_school_free_day";
  if (
    category === "statutory_public_holiday" ||
    category === "official_school_holiday" ||
    category === "movable_school_holiday" ||
    category === "local_school_free_day" ||
    category === "team_custom_exclusion"
  ) return category;
  return "team_custom_exclusion";
}

export function calendarCategoryLabel(category: string) {
  const normalized = normalizeCalendarCategory(category);
  if (normalized === "statutory_public_holiday") return "Statutory public holiday";
  if (normalized === "official_school_holiday") return "Official school holiday";
  if (normalized === "movable_school_holiday") return "Movable/local school-free day";
  if (normalized === "local_school_free_day") return "Local school-free day";
  return "Custom Team exclusion";
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
  if (stateCode === "DE-BB") items.push(add(easter, 0, "Ostersonntag"));
  if (stateCode === "DE-BB") items.push(add(easter, 49, "Pfingstsonntag"));
  if (["DE-BW", "DE-BY", "DE-HE", "DE-NW", "DE-RP", "DE-SL"].includes(stateCode)) items.push(add(easter, 60, "Fronleichnam"));
  if (stateCode === "DE-SL") items.push(fixed(year, 8, 15, "Maria Himmelfahrt"));
  if (["DE-BW", "DE-BY", "DE-NW", "DE-RP", "DE-SL"].includes(stateCode)) items.push(fixed(year, 11, 1, "Allerheiligen"));
  if (["DE-BB", "DE-HB", "DE-HH", "DE-MV", "DE-NI", "DE-SN", "DE-ST", "DE-SH", "DE-TH"].includes(stateCode)) items.push(fixed(year, 10, 31, "Reformationstag"));
  if (stateCode === "DE-BE") items.push(fixed(year, 3, 8, "Internationaler Frauentag"));
  if (stateCode === "DE-MV") items.push(fixed(year, 3, 8, "Internationaler Frauentag"));
  if (stateCode === "DE-TH") items.push(fixed(year, 9, 20, "Weltkindertag"));
  if (stateCode === "DE-SN") items.push(fixedDayOfPrayerAndRepentance(year));
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

const schoolHolidayPeriods: SchoolHolidayPeriod[] = [
  { stateCode: "DE-NW", name: "Autumn holidays", startsOn: "2026-10-17", endsOn: "2026-10-31", sourceVersion: "2026/27" },
  { stateCode: "DE-NW", name: "Christmas holidays", startsOn: "2026-12-23", endsOn: "2027-01-06", sourceVersion: "2026/27" },
  { stateCode: "DE-NW", name: "Easter holidays", startsOn: "2027-03-22", endsOn: "2027-04-03", sourceVersion: "2026/27" },
  { stateCode: "DE-NW", name: "Official additional school-free day", startsOn: "2027-05-18", endsOn: "2027-05-18", sourceVersion: "2026/27" },
  { stateCode: "DE-NW", name: "Summer holidays", startsOn: "2027-07-19", endsOn: "2027-08-31", sourceVersion: "2026/27" },
  { stateCode: "DE-BY", name: "Spring holidays", startsOn: "2027-02-08", endsOn: "2027-02-12", sourceVersion: "2026/27" },
  { stateCode: "DE-MV", name: "Winter holidays", startsOn: "2027-02-08", endsOn: "2027-02-19", sourceVersion: "2026/27" },
  { stateCode: "DE-SL", name: "Winter holidays", startsOn: "2027-02-08", endsOn: "2027-02-12", sourceVersion: "2026/27" },
  { stateCode: "DE-SN", name: "Winter holidays", startsOn: "2027-02-08", endsOn: "2027-02-19", sourceVersion: "2026/27" }
];

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

function fixedDayOfPrayerAndRepentance(year: number) {
  const nov23 = `${year}-11-23`;
  const value = new Date(`${nov23}T00:00:00Z`);
  while (value.getUTCDay() !== 3) value.setUTCDate(value.getUTCDate() - 1);
  return { date: value.toISOString().slice(0, 10), name: "Buss- und Bettag" };
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

function normalizePlace(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
