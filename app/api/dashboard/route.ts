import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isGoalkeeperPosition } from "@/lib/squad/positions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BERLIN_TIME_ZONE = "Europe/Berlin";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Cache-Control": "no-store"
};

type DashboardSession = {
  team: string;
  role: string;
  start: string;
  end: string;
  location: string;
  feldspieler: number;
  torwart: number;
  gastspieler: number;
  zugesagt: number;
  abgesagt: number;
  offen: number;
  trainingsplanVorhanden: boolean;
};

type DashboardNextTraining = {
  date: string;
  team: string;
  start: string;
};

type DashboardResponse = {
  generatedAt: string;
  today: {
    date: string;
    hasTraining: boolean;
    sessions: DashboardSession[];
  };
  next: DashboardNextTraining | null;
};

type ErrorResponse = {
  error: "unauthorized" | "server_misconfigured" | "internal_server_error";
};

type DebugResponse = {
  ok: false;
  error: string;
  env: {
    apiKey: boolean;
    ownerId: boolean;
    serviceRole: boolean;
    supabaseUrl: boolean;
    anonKey: boolean;
  };
};

type TrainingEventRow = Pick<
  Database["public"]["Tables"]["squad_training_events"]["Row"],
  "id" | "date" | "start_time" | "end_time" | "location" | "squad_id"
> & {
  squads?: { name: string | null } | { name: string | null }[] | null;
};

type AttendanceRow = Pick<
  Database["public"]["Tables"]["squad_attendance_records"]["Row"],
  "event_id" | "player_id" | "planned_status" | "planned_reason" | "final_status"
>;

type PlayerRow = Pick<
  Database["public"]["Tables"]["squad_players"]["Row"],
  "id" | "position" | "player_type" | "archived_at" | "deleted_at"
>;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function GET(request: NextRequest) {
  const debugMode = request.nextUrl.searchParams.get("debug") === "1";
  try {
    const expectedKey = process.env.COACHBOARD_API_KEY;
    if (!expectedKey) {
      console.error("Dashboard API is missing COACHBOARD_API_KEY.");
      if (debugMode) return debugJson(new Error("server_misconfigured: missing COACHBOARD_API_KEY"));
      return json({ error: "server_misconfigured" }, 500);
    }

    const providedKey = request.headers.get("x-api-key") ?? request.nextUrl.searchParams.get("key");
    if (!isValidApiKey(providedKey, expectedKey)) {
      return json({ error: "unauthorized" }, 401);
    }

    const ownerId = process.env.COACHBOARD_DASHBOARD_OWNER_ID;
    if (!ownerId) {
      console.error("Dashboard API is missing COACHBOARD_DASHBOARD_OWNER_ID.");
      if (debugMode) return debugJson(new Error("server_misconfigured: missing COACHBOARD_DASHBOARD_OWNER_ID"));
      return json({ error: "server_misconfigured" }, 500);
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Dashboard API is missing server Supabase configuration.");
      if (debugMode) return debugJson(new Error("server_misconfigured: missing server Supabase configuration"));
      return json({ error: "server_misconfigured" }, 500);
    }

    const supabase = createAdminClient();
    const now = new Date();
    const generatedAt = formatBerlinIso(now);
    const todayDate = formatBerlinDate(now);
    const nowTime = formatBerlinTime(now);

    const { data: todayRows, error: todayError } = await supabase
      .from("squad_training_events")
      .select("id,date,start_time,end_time,location,squad_id,squads(name)")
      .eq("user_id", ownerId)
      .eq("date", todayDate)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("start_time", { ascending: true });

    if (todayError) throw todayError;

    const { data: futureRows, error: futureError } = await supabase
      .from("squad_training_events")
      .select("id,date,start_time,end_time,location,squad_id,squads(name)")
      .eq("user_id", ownerId)
      .gte("date", todayDate)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(30);

    if (futureError) throw futureError;

    const todayEvents = ((todayRows ?? []) as TrainingEventRow[]).sort(compareEventStart);
    const nextEvent = ((futureRows ?? []) as TrainingEventRow[]).find((event) => {
      if (event.date > todayDate) return true;
      return event.date === todayDate && toTime(event.start_time) > nowTime;
    }) ?? null;

    const eventIds = Array.from(new Set([...todayEvents.map((event) => event.id), ...(nextEvent ? [nextEvent.id] : [])]));
    const [attendanceByEvent, planEventIds] = await Promise.all([
      loadAttendanceCounts(supabase, ownerId, eventIds),
      loadPlanEventIds(supabase, ownerId, eventIds)
    ]);

    const response: DashboardResponse = {
      generatedAt,
      today: {
        date: todayDate,
        hasTraining: todayEvents.length > 0,
        sessions: todayEvents.map((event) => ({
          team: teamName(event),
          role: "",
          start: toTime(event.start_time),
          end: event.end_time ? toTime(event.end_time) : "",
          location: event.location ?? "",
          ...(attendanceByEvent.get(event.id) ?? emptyCounts()),
          trainingsplanVorhanden: planEventIds.has(event.id)
        }))
      },
      next: nextEvent ? {
        date: nextEvent.date,
        team: teamName(nextEvent),
        start: toTime(nextEvent.start_time)
      } : null
    };

    return json(response, 200);
  } catch (error) {
    console.error("Dashboard API failed.", error instanceof Error ? error.message : "Unknown error");
    if (debugMode) return debugJson(error);
    return json({ error: "internal_server_error" }, 500);
  }
}

function json(body: DashboardResponse | ErrorResponse | DebugResponse, status: number) {
  return NextResponse.json(body, {
    status,
    headers: CORS_HEADERS
  });
}

function debugJson(error: unknown) {
  return json({
    ok: false,
    error: debugErrorMessage(error),
    env: {
      apiKey: Boolean(process.env.COACHBOARD_API_KEY),
      ownerId: Boolean(process.env.COACHBOARD_DASHBOARD_OWNER_ID),
      serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    }
  }, 200);
}

function debugErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const stackLines = error.stack?.split("\n").slice(0, 5).join("\n");
    return stackLines ? `${error.message}\n${stackLines}` : error.message;
  }
  return String(error);
}

function isValidApiKey(providedKey: string | null, expectedKey: string) {
  if (!providedKey) return false;
  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

async function loadAttendanceCounts(
  supabase: ReturnType<typeof createAdminClient>,
  ownerId: string,
  eventIds: string[]
) {
  const counts = new Map<string, ReturnType<typeof emptyCounts>>();
  eventIds.forEach((id) => counts.set(id, emptyCounts()));
  if (!eventIds.length) return counts;

  const { data: attendanceData, error: attendanceError } = await supabase
    .from("squad_attendance_records")
    .select("event_id,player_id,planned_status,planned_reason,final_status")
    .eq("user_id", ownerId)
    .in("event_id", eventIds);

  if (attendanceError) throw attendanceError;

  const attendanceRows = (attendanceData ?? []) as AttendanceRow[];
  const playerIds = Array.from(new Set(attendanceRows.map((row) => row.player_id)));
  const playersById = await loadPlayersById(supabase, ownerId, playerIds);

  for (const row of attendanceRows) {
    const player = playersById.get(row.player_id);
    if (!player || player.deleted_at || player.archived_at) continue;
    const eventCounts = counts.get(row.event_id) ?? emptyCounts();
    const availability = availabilityBucket(row);
    if (availability === "confirmed") {
      if (player.player_type === "trial") eventCounts.gastspieler += 1;
      else if (isGoalkeeperPosition(player.position ?? undefined)) eventCounts.torwart += 1;
      else eventCounts.feldspieler += 1;
    } else if (availability === "declined") {
      eventCounts.abgesagt += 1;
    } else {
      eventCounts.offen += 1;
    }
    eventCounts.zugesagt = eventCounts.feldspieler + eventCounts.torwart + eventCounts.gastspieler;
    counts.set(row.event_id, eventCounts);
  }

  return counts;
}

async function loadPlayersById(
  supabase: ReturnType<typeof createAdminClient>,
  ownerId: string,
  playerIds: string[]
) {
  const players = new Map<string, PlayerRow>();
  if (!playerIds.length) return players;

  const { data, error } = await supabase
    .from("squad_players")
    .select("id,position,player_type,archived_at,deleted_at")
    .eq("user_id", ownerId)
    .in("id", playerIds);

  if (error) throw error;
  for (const row of (data ?? []) as PlayerRow[]) {
    players.set(row.id, row);
  }
  return players;
}

async function loadPlanEventIds(
  supabase: ReturnType<typeof createAdminClient>,
  ownerId: string,
  eventIds: string[]
) {
  const ids = new Set<string>();
  if (!eventIds.length) return ids;

  const { data, error } = await supabase
    .from("training_session_plan_instances")
    .select("event_id")
    .eq("user_id", ownerId)
    .in("event_id", eventIds);

  if (error) throw error;
  for (const row of data ?? []) {
    ids.add(row.event_id);
  }
  return ids;
}

function availabilityBucket(row: AttendanceRow): "confirmed" | "declined" | "open" {
  if (row.final_status === "present" || row.final_status === "Z") return "confirmed";
  if (row.final_status) return "declined";
  if (row.planned_status === "expected") return "confirmed";
  if (row.planned_status === "unavailable") return "declined";
  return "open";
}

function emptyCounts() {
  return {
    feldspieler: 0,
    torwart: 0,
    gastspieler: 0,
    zugesagt: 0,
    abgesagt: 0,
    offen: 0
  };
}

function teamName(event: TrainingEventRow) {
  const squad = Array.isArray(event.squads) ? event.squads[0] : event.squads;
  return squad?.name ?? "";
}

function compareEventStart(a: TrainingEventRow, b: TrainingEventRow) {
  return toTime(a.start_time).localeCompare(toTime(b.start_time));
}

function toTime(value: string) {
  return value.slice(0, 5);
}

function formatBerlinDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatBerlinTime(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

function formatBerlinIso(date: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const offset = (parts.timeZoneName ?? "GMT+00:00").replace("GMT", "");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}
