import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import {
  normalizeCalendarCategory,
  municipalitySpecificPublicHolidayWarningsForGermanState,
  officialSchoolHolidaysForGermanState,
  publicHolidaysForGermanState,
  suggestedLocalDaysForGermanState,
  type CalendarConflictContext,
  type CalendarConflictEvent
} from "@/lib/squad/regional-calendar";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type TeamCalendarRow = {
  id: string;
  user_id: string;
  name: string;
  country_code: string | null;
  federal_state_code: string | null;
  city: string | null;
  calendar_preferences: Record<string, unknown> | null;
};

type RegionalCalendarEventRow = {
  id: string;
  name: string;
  category: CalendarConflictEvent["category"];
  starts_on: string;
  ends_on: string;
  source: string | null;
  source_version: string | null;
  verified_at: string | null;
};

type TeamCalendarExclusionRow = {
  id: string;
  name: string;
  category: CalendarConflictEvent["category"];
  starts_on: string;
  ends_on: string;
  reason: string | null;
  exclude_by_default: boolean | null;
};

const defaultPreferences: CalendarConflictContext["preferences"] = {
  publicHolidays: "ask",
  schoolHolidays: "ask",
  localMovableHolidays: "confirmed_only",
  customExclusions: "exclude"
};

export async function getTeamCalendarContext(
  supabase: SupabaseServerClient,
  userId: string,
  squadId: string | undefined,
  startDate: string,
  endDate: string
): Promise<CalendarConflictContext | undefined> {
  if (!squadId || !startDate || !endDate) return undefined;
  const db = supabase as unknown as SupabaseClient;
  const { data: team, error: teamError } = await db
    .from("squads")
    .select("id,user_id,name,country_code,federal_state_code,city,calendar_preferences")
    .eq("id", squadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (teamError || !team) return undefined;
  const row = team as TeamCalendarRow;
  const preferences = normalizePreferences(row.calendar_preferences);
  const events: CalendarConflictEvent[] = [];

  if (row.country_code === "DE" && row.federal_state_code) {
    events.push(...publicHolidaysForGermanState(row.federal_state_code, startDate, endDate));
    events.push(...municipalitySpecificPublicHolidayWarningsForGermanState(row.federal_state_code, row.city ?? undefined, startDate, endDate));
    const officialSchoolEvents = officialSchoolHolidaysForGermanState(row.federal_state_code, startDate, endDate);
    events.push(...officialSchoolEvents);
    events.push(...suggestedLocalDaysForGermanState(row.federal_state_code, startDate, endDate, officialSchoolEvents));
    const { data: regional } = await db
      .from("regional_calendar_events")
      .select("id,name,category,starts_on,ends_on,source,source_version,verified_at")
      .eq("country_code", "DE")
      .eq("federal_state_code", row.federal_state_code)
      .lte("starts_on", endDate)
      .gte("ends_on", startDate);
    for (const item of (regional ?? []) as RegionalCalendarEventRow[]) {
      const category = normalizeCalendarCategory(item.category);
      events.push({
        id: item.id,
        name: item.name,
        category,
        startsOn: item.starts_on,
        endsOn: item.ends_on,
        source: [item.source, item.source_version].filter(Boolean).join(" ") || "Stored regional calendar data",
        confidence: item.verified_at ? "official" : "suggested",
        excludeByDefault: false
      });
    }
  }

  const { data: exclusions } = await db
    .from("team_calendar_exclusions")
    .select("id,name,category,starts_on,ends_on,reason,exclude_by_default")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .lte("starts_on", endDate)
    .gte("ends_on", startDate);
  for (const item of (exclusions ?? []) as TeamCalendarExclusionRow[]) {
    const category = normalizeCalendarCategory(item.category);
    events.push({
      id: item.id,
      name: item.name,
      category,
      startsOn: item.starts_on,
      endsOn: item.ends_on,
      source: item.reason || "Team calendar",
      confidence: category === "team_custom_exclusion" ? "coach_created" : "team_confirmed",
      excludeByDefault: item.exclude_by_default ?? true
    });
  }

  return {
    teamId: row.id,
    countryCode: row.country_code ?? undefined,
    federalStateCode: row.federal_state_code ?? undefined,
    city: row.city ?? undefined,
    preferences,
    events: dedupeCalendarEvents(events),
    sourceLabel: row.federal_state_code
      ? row.city
        ? "German statutory public holidays and official school holidays are checked separately. Suggested local days need Team confirmation."
        : "German statutory public holidays and official school holidays are checked separately. A regional public holiday may apply; select the Team's municipality for an exact result."
      : "Select a federal state to enable regional calendar checks."
  };
}

function dedupeCalendarEvents(events: CalendarConflictEvent[]) {
  const seen = new Set<string>();
  const result: CalendarConflictEvent[] = [];
  for (const event of events) {
    const key = [
      event.category,
      event.startsOn,
      event.endsOn,
      event.name.toLocaleLowerCase("en-US")
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result.sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function normalizePreferences(value: unknown): CalendarConflictContext["preferences"] {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    publicHolidays: raw.publicHolidays === "exclude" || raw.publicHolidays === "keep" ? raw.publicHolidays : defaultPreferences.publicHolidays,
    schoolHolidays: raw.schoolHolidays === "exclude" || raw.schoolHolidays === "keep" ? raw.schoolHolidays : defaultPreferences.schoolHolidays,
    localMovableHolidays: raw.localMovableHolidays === "ask" || raw.localMovableHolidays === "exclude" || raw.localMovableHolidays === "keep" ? raw.localMovableHolidays : defaultPreferences.localMovableHolidays,
    customExclusions: raw.customExclusions === "ask" || raw.customExclusions === "keep" ? raw.customExclusions : defaultPreferences.customExclusions
  };
}
