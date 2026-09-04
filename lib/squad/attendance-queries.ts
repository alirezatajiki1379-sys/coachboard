import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import {
  mapAttendanceRow,
  mapTrainingEventRow,
  type SquadAttendanceRow,
  type SquadTrainingEventRow
} from "@/lib/squad/attendance-mappers";
import type { SquadPlayerRow } from "@/lib/squad/mappers";
import type { SquadTrainingEvent, SquadTrainingEventDetail } from "@/types/domain";
import type { PlayerMedicalPeriod } from "@/types/domain";
import { isMedicalPeriodActiveOnDate, latestApplicableMedicalPeriod, medicalLabel, medicalNeedsReview, medicalReasonForType } from "@/lib/squad/player-hub";
import { mapPlayerMedicalPeriodRow, mapSquadPlayerRow, type PlayerMedicalPeriodRow } from "@/lib/squad/mappers";
import { ensureActiveSquad } from "@/lib/squad/squads";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type LinkedSessionRow = {
  id: string;
  title: string;
  duration_target_minutes?: number | null;
};

type SquadNameRow = {
  name?: string | null;
};

type CompactAttendanceRow = SquadAttendanceRow & {
  squad_players?: Partial<SquadPlayerRow> | Partial<SquadPlayerRow>[] | null;
};

type TrainingEventListOptions = {
  squadId?: string;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
};

export async function listTrainingEvents(supabase: SupabaseServerClient, userId: string, options: TrainingEventListOptions = {}): Promise<SquadTrainingEvent[]> {
  const activeSquad = options.squadId ? undefined : await ensureActiveSquad(supabase, userId);
  const squadId = options.squadId ?? activeSquad?.id;
  const db = supabase as unknown as SupabaseClient;
  let query = db
    .from("squad_training_events")
    .select("*, training_sessions(id, title, duration_target_minutes), squads(name)")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });
  if (squadId) query = query.eq("squad_id", squadId);
  if (options.onlyDeleted) query = query.not("deleted_at", "is", null);
  else if (!options.includeDeleted) query = query.is("deleted_at", null);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null; squads?: SquadNameRow | null }>).map((row) =>
    {
      const mapped = mapTrainingEventRow(row, row.training_sessions?.title, row.squads?.name ?? undefined);
      return { ...mapped, linkedTrainingSessionDuration: row.training_sessions?.duration_target_minutes ?? undefined };
    }
  );
}

export async function listTrainingEventDetails(supabase: SupabaseServerClient, userId: string, options: TrainingEventListOptions = {}): Promise<SquadTrainingEventDetail[]> {
  const events = await listTrainingEvents(supabase, userId, options);
  if (!events.length) return [];
  const db = supabase as unknown as SupabaseClient;
  await syncEligibleFutureEventsWithCurrentSquad(db, userId, events);
  const { data, error } = await db
    .from("squad_attendance_records")
    .select("id,user_id,event_id,player_id,planned_status,planned_reason,planned_reason_note,planned_status_source,final_status,late_minutes,late_penalty_applied,overall_rating,rating_technique,rating_game_understanding,rating_intensity,rating_behavior,rating_auto_suggestion,coach_note,sensitive_note,created_at,updated_at,squad_players(id,user_id,first_name,last_name,position,secondary_positions,player_type,archived_at,deleted_at,created_at,updated_at)")
    .eq("user_id", userId)
    .in("event_id", events.map((event) => event.id))
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const attendanceRows = (data ?? []) as unknown as CompactAttendanceRow[];
  const playersById = await loadAttendancePlayersById(
    db,
    userId,
    attendanceRows.map((row) => row.player_id)
  );
  const attendanceByEvent = new Map<string, ReturnType<typeof mapAttendanceRow>[]>();
  for (const row of attendanceRows) {
    const mapped = mapAttendanceRow(row, playersById.get(row.player_id) ?? compactPlayerToRow(row.squad_players ?? undefined));
    attendanceByEvent.set(row.event_id, [...(attendanceByEvent.get(row.event_id) ?? []), mapped]);
  }
  return events.map((event) => ({ ...event, attendance: attendanceByEvent.get(event.id) ?? [] }));
}

async function loadAttendancePlayersById(db: SupabaseClient, userId: string, playerIds: string[]) {
  const uniquePlayerIds = Array.from(new Set(playerIds.filter(Boolean)));
  const playersById = new Map<string, SquadPlayerRow>();
  if (!uniquePlayerIds.length) return playersById;

  const { data, error } = await db.from("squad_players").select("*").eq("user_id", userId).in("id", uniquePlayerIds);
  if (error) throw new Error(error.message);

  for (const player of (data ?? []) as SquadPlayerRow[]) {
    playersById.set(player.id, player);
  }
  return playersById;
}

function compactPlayerToRow(playerInput?: Partial<SquadPlayerRow> | Partial<SquadPlayerRow>[] | null): SquadPlayerRow | undefined {
  const player = Array.isArray(playerInput) ? playerInput[0] : playerInput;
  if (!player?.id || !player.user_id || !player.first_name) return undefined;
  return {
    id: player.id,
    user_id: player.user_id,
    squad_id: player.squad_id ?? null,
    player_type: player.player_type ?? "roster",
    first_name: player.first_name,
    last_name: player.last_name ?? null,
    date_of_birth: null,
    address_street: null,
    address_postal_code: null,
    address_city: null,
    position: player.position ?? null,
    position_families: [],
    secondary_positions: Array.isArray(player.secondary_positions) ? player.secondary_positions : [],
    strong_foot: null,
    club: null,
    original_club: null,
    club_training_schedule: null,
    external_player_id: null,
    trial_start_date: null,
    trial_duration_mode: null,
    trial_training_limit: null,
    trial_end_date: null,
    player_email: null,
    secondary_email: null,
    parent_guardian_name: null,
    parent_phone: null,
    player_phone: null,
    parent_email: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relationship: null,
    top_size: null,
    jacket_size: null,
    trouser_size: null,
    shoe_size: null,
    preferred_positions: [],
    original_preferred_positions: null,
    original_strong_foot: null,
    height_cm: null,
    weight_kg: null,
    distance_km: null,
    jersey_number: null,
    captain_status: null,
    joined_date: null,
    exit_date: null,
    exit_reason: null,
    scouting_source: null,
    development_centre: null,
    last_performance_review_date: null,
    allergies: null,
    medication: null,
    medical_notes: null,
    hobbies: null,
    development_goal: null,
    work_on: null,
    coach_expectations: null,
    onboarding_comments: null,
    recommended_players_raw: null,
    recommended_player_name: null,
    recommended_player_birth_year: null,
    recommended_player_position: null,
    recommended_player_club: null,
    onboarding_source: null,
    onboarding_submitted_at: null,
    onboarding_import_batch: null,
    import_batch_id: null,
    onboarding_original_answers: null,
    onboarding_normalized_values: null,
    onboarding_warnings: [],
    notes: null,
    converted_at: null,
    archived_at: null,
    deleted_at: player.deleted_at ?? null,
    created_at: player.created_at ?? "",
    updated_at: player.updated_at ?? ""
  };
}

export async function getTrainingEventDetail(
  supabase: SupabaseServerClient,
  userId: string,
  eventId: string
): Promise<SquadTrainingEventDetail | null> {
  const db = supabase as unknown as SupabaseClient;
  const { data: eventData, error } = await db
    .from("squad_training_events")
    .select("*, training_sessions(id, title, duration_target_minutes), squads(name)")
    .eq("user_id", userId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!eventData) return null;
  await syncEligibleFutureEventsWithCurrentSquad(db, userId, [mapTrainingEventRow(eventData as SquadTrainingEventRow)]);

  const { data: attendanceData, error: attendanceError } = await db
    .from("squad_attendance_records")
    .select("*, squad_players(*)")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (attendanceError) throw new Error(attendanceError.message);

  const attendanceRows = (attendanceData ?? []) as Array<
    SquadAttendanceRow & {
      squad_players?: SquadPlayerRow | null;
    }
  >;

  const playersById = await loadAttendancePlayersById(
    db,
    userId,
    attendanceRows.map((row) => row.player_id)
  );
  const medicalByPlayer = await getMedicalByPlayer(db, userId, eventData.date, attendanceRows.map((row) => row.player_id));
  const attendance = attendanceRows.map((row) =>
    applyMedicalPrefill(mapAttendanceRow(row, playersById.get(row.player_id) ?? row.squad_players ?? undefined), medicalByPlayer.get(row.player_id))
  );

  const event = mapTrainingEventRow(
    eventData as SquadTrainingEventRow,
    (eventData as SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null }).training_sessions?.title,
    (eventData as SquadTrainingEventRow & { squads?: SquadNameRow | null }).squads?.name ?? undefined
  );

  const linked = (eventData as SquadTrainingEventRow & { training_sessions?: LinkedSessionRow | null }).training_sessions;
  return { ...event, linkedTrainingSessionDuration: linked?.duration_target_minutes ?? undefined, attendance };
}

async function syncEligibleFutureEventsWithCurrentSquad(db: SupabaseClient, userId: string, events: Array<Pick<SquadTrainingEventDetail, "id" | "date" | "status" | "squadId" | "participantSourceMode" | "participantsLockedAt" | "deletedAt">>) {
  const eligibleEvents = events.filter((event) => isEligibleForCurrentSquadSync(event));
  if (!eligibleEvents.length) return;
  for (const event of eligibleEvents) {
    await syncEventWithCurrentSquad(db, userId, event);
  }
}

function isEligibleForCurrentSquadSync(event: Pick<SquadTrainingEventDetail, "date" | "status" | "participantSourceMode" | "participantsLockedAt" | "deletedAt">) {
  return (
    event.participantSourceMode === "current_squad_sync" &&
    !event.participantsLockedAt &&
    !event.deletedAt &&
    event.date >= todayDateString() &&
    (event.status === "draft" || event.status === "prepared")
  );
}

async function syncEventWithCurrentSquad(
  db: SupabaseClient,
  userId: string,
  event: Pick<SquadTrainingEventDetail, "id" | "date" | "squadId">
) {
  let playerQuery = db
    .from("squad_players")
    .select("id")
    .eq("user_id", userId)
    .eq("player_type", "roster")
    .is("archived_at", null)
    .is("deleted_at", null);
  if (event.squadId) playerQuery = playerQuery.eq("squad_id", event.squadId);
  const { data: players, error: playersError } = await playerQuery;
  if (playersError) throw new Error(playersError.message);

  const currentPlayerIds = Array.from(new Set(((players ?? []) as Array<{ id: string }>).map((player) => player.id)));
  const currentPlayerIdSet = new Set(currentPlayerIds);

  const { data: existing, error: existingError } = await db
    .from("squad_attendance_records")
    .select("id,player_id,planned_status,planned_reason,planned_reason_note,planned_status_source,final_status,overall_rating,rating_technique,rating_game_understanding,rating_intensity,rating_behavior,coach_note")
    .eq("user_id", userId)
    .eq("event_id", event.id);
  if (existingError) throw new Error(existingError.message);

  const existingRows = (existing ?? []) as Array<{
    id: string;
    player_id: string;
    planned_status: string | null;
    planned_reason: string | null;
    planned_reason_note: string | null;
    planned_status_source: string | null;
    final_status: string | null;
    overall_rating: number | null;
    rating_technique: number | null;
    rating_game_understanding: number | null;
    rating_intensity: number | null;
    rating_behavior: number | null;
    coach_note: string | null;
  }>;
  const existingPlayerIds = new Set(existingRows.map((row) => row.player_id));
  const missingPlayerIds = currentPlayerIds.filter((playerId) => !existingPlayerIds.has(playerId));
  if (missingPlayerIds.length) {
    const medicalByPlayer = await getMedicalByPlayer(db, userId, event.date, missingPlayerIds);
    const rows = missingPlayerIds.map((playerId) => {
      const medical = medicalByPlayer.get(playerId);
      return {
        user_id: userId,
        event_id: event.id,
        player_id: playerId,
        planned_status: medical ? "unavailable" : "expected",
        planned_reason: medical ? medicalReasonForType(medical.type) : null,
        planned_reason_note: medical?.description ?? null,
        planned_status_source: medical ? "medical" : "default"
      };
    });
    const { error } = await db.from("squad_attendance_records").upsert(rows, { onConflict: "event_id,player_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const protectedPlayerIds = await loadProtectedGroupPlayerIds(db, userId, event.id);
  const removableIds = existingRows
    .filter((row) => !currentPlayerIdSet.has(row.player_id) && !hasMeaningfulParticipantData(row, protectedPlayerIds.has(row.player_id)))
    .map((row) => row.id);
  if (removableIds.length) {
    const { error } = await db.from("squad_attendance_records").delete().eq("user_id", userId).in("id", removableIds);
    if (error) throw new Error(error.message);
  }
}

async function loadProtectedGroupPlayerIds(db: SupabaseClient, userId: string, eventId: string) {
  const result = new Set<string>();
  const { data: groups, error: groupError } = await db.from("training_event_groups").select("id").eq("user_id", userId).eq("event_id", eventId);
  if (groupError) throw new Error(groupError.message);
  const groupIds = ((groups ?? []) as Array<{ id: string }>).map((group) => group.id);
  if (!groupIds.length) return result;
  const { data: members, error: memberError } = await db.from("training_event_group_members").select("player_id").eq("user_id", userId).in("group_id", groupIds);
  if (memberError) throw new Error(memberError.message);
  for (const member of (members ?? []) as Array<{ player_id: string | null }>) {
    if (member.player_id) result.add(member.player_id);
  }
  return result;
}

function hasMeaningfulParticipantData(
  row: {
    planned_status: string | null;
    planned_reason: string | null;
    planned_reason_note: string | null;
    planned_status_source: string | null;
    final_status: string | null;
    overall_rating: number | null;
    rating_technique: number | null;
    rating_game_understanding: number | null;
    rating_intensity: number | null;
    rating_behavior: number | null;
    coach_note: string | null;
  },
  hasGroupAssignment: boolean
) {
  return Boolean(
    hasGroupAssignment ||
      row.final_status ||
      row.overall_rating ||
      row.rating_technique ||
      row.rating_game_understanding ||
      row.rating_intensity ||
      row.rating_behavior ||
      row.coach_note ||
      row.planned_status_source === "manual" ||
      row.planned_reason ||
      row.planned_reason_note ||
      row.planned_status === "unavailable" ||
      row.planned_status === "unclear"
  );
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getMedicalByPlayer(db: SupabaseClient, userId: string, eventDate: string, playerIds: string[]) {
  const result = new Map<string, PlayerMedicalPeriod>();
  if (!playerIds.length) return result;
  const { data, error } = await db
    .from("player_medical_periods")
    .select("*")
    .eq("user_id", userId)
    .in("player_id", Array.from(new Set(playerIds)))
    .eq("status", "active")
    .lte("start_date", eventDate)
    .or(`end_date.is.null,end_date.gte.${eventDate}`);
  if (error) return result;
  const byPlayer = new Map<string, PlayerMedicalPeriod[]>();
  for (const row of (data ?? []) as PlayerMedicalPeriodRow[]) {
    const period = mapPlayerMedicalPeriodRow(row);
    if (!isMedicalPeriodActiveOnDate(period, eventDate)) continue;
    byPlayer.set(period.playerId, [...(byPlayer.get(period.playerId) ?? []), period]);
  }
  for (const [playerId, periods] of byPlayer) {
    const latest = latestApplicableMedicalPeriod(periods, eventDate);
    if (latest) result.set(playerId, latest);
  }
  return result;
}

function applyMedicalPrefill<T extends ReturnType<typeof mapAttendanceRow>>(entry: T, medical: PlayerMedicalPeriod | undefined): T {
  if (!medical) {
    if (entry.plannedStatusSource === "medical" && !entry.finalStatus) {
      return { ...entry, plannedStatus: "expected", plannedReason: undefined, plannedReasonNote: undefined, plannedStatusSource: "default" };
    }
    return entry;
  }
  const availability = {
    periodId: medical.id,
    type: medical.type,
    label: medicalLabel(medical),
    until: medical.actualReturnDate ?? medical.expectedReturnDate ?? medical.endDate,
    description: medical.description,
    needsReview: medicalNeedsReview(medical)
  };
  if (entry.finalStatus || entry.plannedStatusSource === "manual") return { ...entry, medicalAvailability: availability };
  return {
    ...entry,
    plannedStatus: "unavailable",
    plannedReason: medicalReasonForType(medical.type),
    plannedReasonNote: medical.description,
    plannedStatusSource: "medical",
    medicalAvailability: availability
  };
}

export async function getLinkableTrainingSessions(supabase: SupabaseServerClient, userId: string): Promise<LinkedSessionRow[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("training_sessions")
    .select("id, title")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LinkedSessionRow[];
}

export async function listTrainingParticipantOptions(supabase: SupabaseServerClient, userId: string, squadId?: string) {
  const db = supabase as unknown as SupabaseClient;
  const activeSquad = squadId ? undefined : await ensureActiveSquad(supabase, userId);
  const { data, error } = await db
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("player_type", { ascending: true })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (error) throw new Error(error.message);
  const targetSquadId = squadId ?? activeSquad?.id;
  return uniquePlayerRows((data ?? []) as SquadPlayerRow[])
    .filter((player) => !targetSquadId || player.squad_id === targetSquadId)
    .filter((player) => player.player_type === "roster" || (player.player_type === "trial" && !player.converted_at))
    .map(mapSquadPlayerRow);
}

function uniquePlayerRows(players: SquadPlayerRow[]) {
  const seen = new Set<string>();
  return players.filter((player) => {
    if (seen.has(player.id)) return false;
    seen.add(player.id);
    return true;
  });
}

export async function listAvailableTrialPlayers(
  supabase: SupabaseServerClient,
  userId: string,
  eventId: string
): Promise<SquadPlayerRow[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data: existing, error: existingError } = await db
    .from("squad_attendance_records")
    .select("player_id")
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (existingError) throw new Error(existingError.message);
  const existingIds = new Set((existing ?? []).map((row: { player_id: string }) => row.player_id));
  const { data: event, error: eventError } = await db
    .from("squad_training_events")
    .select("squad_id")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);

  let query = db
    .from("squad_players")
    .select("*")
    .eq("user_id", userId)
    .eq("player_type", "trial")
    .is("converted_at", null)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (event?.squad_id) query = query.eq("squad_id", event.squad_id);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as SquadPlayerRow[]).filter((player) => !existingIds.has(player.id));
}
