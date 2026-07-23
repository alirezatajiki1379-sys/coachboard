"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { SquadPlayer } from "@/types/domain";
import { refreshReviewedRowDuplicates, valueOf, type DuplicatePlayerContext, type ImportOperation, type PlayerImportPayload, type ReviewedImportRow } from "@/lib/squad/importer";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import { ensureActiveSquad } from "@/lib/squad/squads";

export type PlayerImportActionState = {
  ok?: boolean;
  error?: string;
  batchId?: string;
  summary?: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    warnings: number;
  };
};

export type PlayerImportDuplicateRefreshState = {
  ok: boolean;
  rows?: ReviewedImportRow[];
  error?: string;
  diagnostics?: {
    activeTeamPlayers: number;
    archivedTeamPlayers: number;
    trashedTeamPlayers: number;
    legacyPlayers: number;
    otherTeamPlayers: number;
    importRows: number;
    activeMatches: number;
    archivedMatches: number;
    trashMatches: number;
    legacyMatches: number;
    otherTeamMatches: number;
    fileDuplicates: number;
  };
};

export type PlayerImportBatchSummary = {
  id: string;
  sourceType: string;
  sourceName?: string;
  sourceSheet?: string;
  importMode: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  warningCount: number;
  status: string;
  createdAt: string;
  completedAt?: string;
  rolledBackAt?: string;
};

export type PlayerImportRowSummary = {
  id: string;
  rowNumber: number;
  resultStatus: string;
  playerId?: string;
  matchedPlayerId?: string;
  operation: string;
  errorCode?: string;
  warnings: string[];
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function confirmPlayerImport(payload: PlayerImportPayload): Promise<PlayerImportActionState> {
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const rows = payload.rows.filter((row) => !row.excluded);
  if (!rows.length) return { error: "No rows are selected for import." };
  if (rows.length > 2000) return { error: "Import is limited to 2,000 rows." };

  const activeSquad = await ensureActiveSquad(supabase, user.id);
  const existingPlayers = await listExistingPlayers(db, user.id, activeSquad.id);
  const { data: batch, error: batchError } = await db
    .from("player_import_batches")
    .insert({
      user_id: user.id,
      source_type: payload.sourceType,
      source_name: payload.sourceName ?? null,
      source_sheet: payload.sourceSheet ?? null,
      import_mode: payload.importMode,
      total_rows: payload.rows.length,
      status: "processing"
    })
    .select("id")
    .single();

  if (batchError || !batch?.id) return { error: "Could not start the import batch." };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let warnings = 0;

  for (const row of rows) {
    const result = await processImportRow(db, user.id, activeSquad.id, String(batch.id), row, payload.importMode, existingPlayers);
    if (result.status === "created") {
      created += 1;
      if (result.player) existingPlayers.push(result.player);
    } else if (result.status === "updated") {
      updated += 1;
    } else if (result.status === "failed") {
      failed += 1;
    } else {
      skipped += 1;
    }
    warnings += row.warnings.length;
  }

  const status = failed ? "completed_with_errors" : "completed";
  await db
    .from("player_import_batches")
    .update({
      created_count: created,
      updated_count: updated,
      skipped_count: skipped + payload.rows.filter((row) => row.excluded).length,
      failed_count: failed,
      warning_count: warnings,
      status,
      completed_at: new Date().toISOString()
    })
    .eq("id", batch.id)
    .eq("user_id", user.id);

  revalidatePath("/squad");
  revalidatePath("/squad/import");
  return {
    ok: true,
    batchId: String(batch.id),
    summary: { created, updated, skipped, failed, warnings }
  };
}

export async function refreshPlayerImportDuplicateCheck(rows: ReviewedImportRow[]): Promise<PlayerImportDuplicateRefreshState> {
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const activeSquad = await ensureActiveSquad(supabase, user.id);
  const context = await listDuplicateContext(db, user.id, activeSquad.id);
  const nextRows = refreshReviewedRowDuplicates(rows, context);
  const diagnostics = duplicateRefreshDiagnostics(nextRows, context);
  return { ok: true, rows: nextRows, diagnostics };
}

async function processImportRow(
  db: SupabaseClient,
  userId: string,
  squadId: string,
  batchId: string,
  row: ReviewedImportRow,
  importMode: string,
  existingPlayers: SquadPlayer[]
): Promise<{ status: "created" | "updated" | "skipped" | "failed"; player?: SquadPlayer }> {
  if (row.errors.length) {
    await insertAuditRow(db, userId, batchId, row, "failed", "skip", undefined, undefined, "row_has_errors");
    return { status: "failed" };
  }

  const matched = resolveMatchedPlayer(row, existingPlayers);
  const operation = effectiveOperation(row.operation, importMode, matched, row);
  if (operation === "skip") {
    await insertAuditRow(db, userId, batchId, row, "skipped", "skip", undefined, matched?.id);
    return { status: "skipped" };
  }
  if ((operation === "update" || operation === "fill_missing") && !matched) {
    await insertAuditRow(db, userId, batchId, row, "skipped", "skip", undefined, undefined, "no_owned_match_for_update");
    return { status: "skipped" };
  }
  if (operation === "create") {
    if (importMode === "update_only") {
      await insertAuditRow(db, userId, batchId, row, "skipped", "skip", undefined, undefined, "update_only_mode");
      return { status: "skipped" };
    }
    const insert = buildPlayerInsert(userId, squadId, batchId, row);
    const { data, error } = await db.from("squad_players").insert(insert).select("*").single();
    if (error || !data) {
      await insertAuditRow(db, userId, batchId, row, "failed", "create", undefined, undefined, "create_failed");
      return { status: "failed" };
    }
    const player = mapSquadPlayerRow(data as SquadPlayerRow);
    await insertAuditRow(db, userId, batchId, row, "created", "create", player.id, undefined, undefined, rowToJson(row), insert as Record<string, unknown>);
    return { status: "created", player };
  }

  const update = buildPlayerUpdate(batchId, row, matched!, operation);
  if (!Object.keys(update.next).length) {
    await insertAuditRow(db, userId, batchId, row, "skipped", "skip", undefined, matched!.id, "nothing_to_update");
    return { status: "skipped" };
  }
  const { error } = await db.from("squad_players").update(update.next).eq("id", matched!.id).eq("user_id", userId);
  if (error) {
    await insertAuditRow(db, userId, batchId, row, "failed", operation, undefined, matched!.id, "update_failed");
    return { status: "failed" };
  }
  await insertAuditRow(db, userId, batchId, row, "updated", operation, matched!.id, matched!.id, undefined, rowToJson(row), update.next, update.previous);
  return { status: "updated" };
}

function effectiveOperation(operation: ImportOperation, importMode: string, matched?: SquadPlayer, row?: ReviewedImportRow): ImportOperation {
  if (operation === "skip") return "skip";
  if (matched && importMode === "add_new" && operation === "create" && row?.duplicateMatches?.some((match) => match.source === "active_team_player")) return "skip";
  if (matched && operation === "create" && row?.duplicateMatches?.some((match) => match.source === "active_team_player")) return "skip";
  if (!matched && (operation === "update" || operation === "fill_missing")) return "skip";
  return operation;
}

function resolveMatchedPlayer(row: ReviewedImportRow, players: SquadPlayer[]) {
  if (row.duplicatePlayerId) return players.find((player) => player.id === row.duplicatePlayerId);
  const externalId = valueOf(row.values.externalPlayerId);
  const email = valueOf(row.values.playerEmail).toLowerCase();
  const firstName = valueOf(row.values.firstName).toLowerCase();
  const lastName = valueOf(row.values.lastName).toLowerCase();
  const dob = valueOf(row.values.dateOfBirth);
  return players.find((player) => {
    if (externalId && player.externalPlayerId === externalId) return true;
    if (email && player.playerEmail?.toLowerCase() === email) return true;
    return Boolean(firstName && lastName && dob && player.firstName.toLowerCase() === firstName && (player.lastName ?? "").toLowerCase() === lastName && player.dateOfBirth === dob);
  });
}

function buildPlayerInsert(userId: string, squadId: string | undefined, batchId: string, row: ReviewedImportRow): Record<string, unknown> {
  return {
    user_id: userId,
    squad_id: squadId ?? null,
    first_name: valueOf(row.values.firstName),
    last_name: nullable(valueOf(row.values.lastName)),
    date_of_birth: nullable(valueOf(row.values.dateOfBirth)),
    player_type: valueOf(row.values.playerType) === "trial" ? "trial" : "roster",
    trial_start_date: nullable(valueOf(row.values.trialStartDate)),
    joined_date: nullable(valueOf(row.values.joinedDate)),
    captain_status: captain(valueOf(row.values.captainStatus)),
    jersey_number: nullable(valueOf(row.values.jerseyNumber)),
    external_player_id: nullable(valueOf(row.values.externalPlayerId) || valueOf(row.values.externalResponseId)),
    position: nullable(valueOf(row.values.position)),
    secondary_positions: list(valueOf(row.values.secondaryPositions)),
    preferred_positions: list(valueOf(row.values.preferredPositions)),
    original_preferred_positions: nullable(row.values.preferredPositions?.original ?? ""),
    strong_foot: nullable(valueOf(row.values.strongFoot)),
    original_strong_foot: nullable(row.values.strongFoot?.original ?? ""),
    club: nullable(valueOf(row.values.club)),
    original_club: nullable(row.values.club?.original ?? ""),
    club_training_schedule: nullable(valueOf(row.values.clubTrainingSchedule)),
    player_phone: nullable(valueOf(row.values.playerPhone)),
    player_email: nullable(valueOf(row.values.playerEmail)),
    parent_guardian_name: nullable(valueOf(row.values.parentGuardianName)),
    parent_phone: nullable(valueOf(row.values.parentPhone)),
    parent_email: nullable(valueOf(row.values.parentEmail)),
    emergency_contact_name: nullable(valueOf(row.values.emergencyContactName)),
    emergency_contact_phone: nullable(valueOf(row.values.emergencyContactPhone)),
    emergency_contact_relationship: nullable(valueOf(row.values.emergencyContactRelationship)),
    top_size: nullable(valueOf(row.values.topSize)),
    jacket_size: nullable(valueOf(row.values.jacketSize)),
    trouser_size: nullable(valueOf(row.values.trouserSize)),
    shoe_size: nullable(valueOf(row.values.shoeSize)),
    hobbies: nullable(valueOf(row.values.hobbies)),
    development_goal: nullable(valueOf(row.values.developmentGoal)),
    work_on: nullable(valueOf(row.values.workOn)),
    coach_expectations: nullable(valueOf(row.values.coachExpectations)),
    onboarding_comments: nullable(valueOf(row.values.onboardingComments)),
    recommended_players_raw: nullable(valueOf(row.values.recommendedPlayersRaw)),
    onboarding_source: nullable(valueOf(row.values.sourceName)) ?? "Squad import",
    onboarding_submitted_at: nullable(valueOf(row.values.formSubmissionDate) || valueOf(row.values.formStartDate)),
    onboarding_import_batch: batchId,
    import_batch_id: batchId,
    onboarding_original_answers: row.originalRow as Json,
    onboarding_normalized_values: normalizedRecord(row) as Json,
    onboarding_warnings: row.warnings
  };
}

function buildPlayerUpdate(batchId: string, row: ReviewedImportRow, player: SquadPlayer, operation: "update" | "fill_missing") {
  const insert = buildPlayerInsert(player.userId, player.squadId, batchId, row);
  const mapping: Array<[string, keyof SquadPlayer]> = [
    ["last_name", "lastName"],
    ["date_of_birth", "dateOfBirth"],
    ["trial_start_date", "trialStartDate"],
    ["joined_date", "joinedDate"],
    ["captain_status", "captainStatus"],
    ["jersey_number", "jerseyNumber"],
    ["external_player_id", "externalPlayerId"],
    ["position", "position"],
    ["strong_foot", "strongFoot"],
    ["original_strong_foot", "originalStrongFoot"],
    ["club", "club"],
    ["original_club", "originalClub"],
    ["club_training_schedule", "clubTrainingSchedule"],
    ["player_phone", "playerPhone"],
    ["player_email", "playerEmail"],
    ["parent_guardian_name", "parentGuardianName"],
    ["parent_phone", "parentPhone"],
    ["parent_email", "parentEmail"],
    ["emergency_contact_name", "emergencyContactName"],
    ["emergency_contact_phone", "emergencyContactPhone"],
    ["emergency_contact_relationship", "emergencyContactRelationship"],
    ["top_size", "topSize"],
    ["jacket_size", "jacketSize"],
    ["trouser_size", "trouserSize"],
    ["shoe_size", "shoeSize"],
    ["hobbies", "hobbies"],
    ["development_goal", "developmentGoal"],
    ["work_on", "workOn"],
    ["coach_expectations", "coachExpectations"],
    ["onboarding_comments", "onboardingComments"],
    ["recommended_players_raw", "recommendedPlayersRaw"]
  ];
  const next: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  for (const [column, property] of mapping) {
    const imported = insert[column];
    if (imported === null || imported === undefined || imported === "") continue;
    const current = player[property];
    if (operation === "fill_missing" && current) continue;
    next[column] = imported;
    previous[column] = current ?? null;
  }
  if (Array.isArray(insert.secondary_positions) && insert.secondary_positions.length && (operation === "update" || !player.secondaryPositions.length)) {
    next.secondary_positions = insert.secondary_positions;
    previous.secondary_positions = player.secondaryPositions;
  }
  if (Array.isArray(insert.preferred_positions) && insert.preferred_positions.length && (operation === "update" || !player.preferredPositions.length)) {
    next.preferred_positions = insert.preferred_positions;
    previous.preferred_positions = player.preferredPositions;
  }
  next.onboarding_original_answers = row.originalRow as Json;
  next.onboarding_normalized_values = normalizedRecord(row) as Json;
  next.onboarding_warnings = row.warnings;
  next.import_batch_id = insert.import_batch_id;
  next.onboarding_import_batch = insert.onboarding_import_batch;
  if (row.duplicateMatches?.some((match) => match.playerId === player.id && (match.source === "trashed_team_player" || match.source === "archived_team_player"))) {
    next.deleted_at = null;
    next.archived_at = null;
  }
  return { next, previous };
}

async function insertAuditRow(
  db: SupabaseClient,
  userId: string,
  batchId: string,
  row: ReviewedImportRow,
  status: "created" | "updated" | "skipped" | "failed",
  operation: ImportOperation,
  playerId?: string,
  matchedPlayerId?: string,
  errorCode?: string,
  originalRow?: Record<string, unknown>,
  appliedChanges?: Record<string, unknown>,
  previousValues?: Record<string, unknown>
) {
  await db.from("player_import_rows").insert({
    user_id: userId,
    import_batch_id: batchId,
    row_number: row.rowNumber,
    result_status: status,
    player_id: playerId ?? null,
    matched_player_id: matchedPlayerId ?? null,
    operation,
    error_code: errorCode ?? null,
    warning_codes: row.warnings,
    original_row: (originalRow ?? row.originalRow) as Json,
    applied_changes: (appliedChanges ?? null) as Json | null,
    previous_values: (previousValues ?? null) as Json | null
  });
}

export async function listPlayerImportBatches(): Promise<PlayerImportBatchSummary[]> {
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("player_import_batches")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: String(row.id),
    sourceType: String(row.source_type),
    sourceName: row.source_name ?? undefined,
    sourceSheet: row.source_sheet ?? undefined,
    importMode: String(row.import_mode),
    totalRows: Number(row.total_rows ?? 0),
    createdCount: Number(row.created_count ?? 0),
    updatedCount: Number(row.updated_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    warningCount: Number(row.warning_count ?? 0),
    status: String(row.status),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ?? undefined,
    rolledBackAt: row.rolled_back_at ?? undefined
  }));
}

export async function undoPlayerImport(batchId: string): Promise<PlayerImportActionState> {
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: batch } = await db.from("player_import_batches").select("*").eq("id", batchId).eq("user_id", user.id).maybeSingle();
  if (!batch) return { error: "Import batch not found." };
  const { data: rows, error } = await db.from("player_import_rows").select("*").eq("import_batch_id", batchId).eq("user_id", user.id);
  if (error) return { error: "Could not load import rows for undo." };

  let rolledBack = 0;
  let blocked = 0;
  for (const row of rows ?? []) {
    if (row.result_status === "created" && row.player_id) {
      const canDelete = await canDeleteImportedPlayer(db, user.id, row.player_id);
      if (!canDelete) {
        blocked += 1;
        await db.from("player_import_rows").update({ result_status: "rollback_blocked" }).eq("id", row.id).eq("user_id", user.id);
        continue;
      }
      await db.from("squad_players").delete().eq("id", row.player_id).eq("user_id", user.id);
      await db.from("player_import_rows").update({ result_status: "rolled_back" }).eq("id", row.id).eq("user_id", user.id);
      rolledBack += 1;
    }
  }
  await db
    .from("player_import_batches")
    .update({ status: blocked ? "partially_rolled_back" : "rolled_back", rolled_back_at: new Date().toISOString() })
    .eq("id", batchId)
    .eq("user_id", user.id);
  revalidatePath("/squad");
  revalidatePath("/squad/import");
  return { ok: true, summary: { created: 0, updated: 0, skipped: blocked, failed: 0, warnings: rolledBack } };
}

async function listExistingPlayers(db: SupabaseClient, userId: string, squadId: string) {
  const { data, error } = await db.from("squad_players").select("*").eq("user_id", userId).eq("squad_id", squadId);
  if (error) return [];
  return ((data ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);
}

async function listDuplicateContext(db: SupabaseClient, userId: string, activeSquadId: string): Promise<DuplicatePlayerContext> {
  const { data, error } = await db.from("squad_players").select("*").eq("user_id", userId);
  if (error) {
    return { activeTeamPlayers: [], archivedTeamPlayers: [], trashedTeamPlayers: [], legacyPlayers: [], otherTeamPlayers: [] };
  }
  const players = ((data ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);
  return {
    activeTeamPlayers: players.filter((player) => player.squadId === activeSquadId && !player.archivedAt && !player.deletedAt),
    archivedTeamPlayers: players.filter((player) => player.squadId === activeSquadId && Boolean(player.archivedAt) && !player.deletedAt),
    trashedTeamPlayers: players.filter((player) => player.squadId === activeSquadId && Boolean(player.deletedAt)),
    legacyPlayers: players.filter((player) => !player.squadId),
    otherTeamPlayers: players.filter((player) => player.squadId && player.squadId !== activeSquadId)
  };
}

function duplicateRefreshDiagnostics(rows: ReviewedImportRow[], context: DuplicatePlayerContext): PlayerImportDuplicateRefreshState["diagnostics"] {
  return {
    activeTeamPlayers: context.activeTeamPlayers.length,
    archivedTeamPlayers: context.archivedTeamPlayers.length,
    trashedTeamPlayers: context.trashedTeamPlayers.length,
    legacyPlayers: context.legacyPlayers.length,
    otherTeamPlayers: context.otherTeamPlayers.length,
    importRows: rows.filter((row) => !row.excluded).length,
    activeMatches: countRowsWithMatch(rows, "active_team_player"),
    archivedMatches: countRowsWithMatch(rows, "archived_team_player"),
    trashMatches: countRowsWithMatch(rows, "trashed_team_player"),
    legacyMatches: countRowsWithMatch(rows, "legacy_player"),
    otherTeamMatches: countRowsWithMatch(rows, "other_team_player"),
    fileDuplicates: countRowsWithMatch(rows, "duplicate_import_row")
  };
}

function countRowsWithMatch(rows: ReviewedImportRow[], source: NonNullable<ReviewedImportRow["duplicateMatches"]>[number]["source"]) {
  return rows.filter((row) => !row.excluded && row.duplicateMatches?.some((match) => match.source === source)).length;
}

async function canDeleteImportedPlayer(db: SupabaseClient, userId: string, playerId: string) {
  const tables = [
    "squad_attendance_records",
    "player_contacts",
    "player_medical_periods",
    "player_coach_assessments",
    "player_development_goals",
    "player_observations"
  ];
  for (const table of tables) {
    const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).eq("player_id", playerId);
    if ((count ?? 0) > 0) return false;
  }
  return true;
}

function rowToJson(row: ReviewedImportRow) {
  return row.originalRow;
}

function normalizedRecord(row: ReviewedImportRow) {
  return Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, value?.normalized ?? ""]));
}

function nullable(value: string) {
  return value.trim() ? value.trim() : null;
}

function list(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function captain(value: string) {
  return value === "captain" || value === "vice_captain" ? value : "none";
}
