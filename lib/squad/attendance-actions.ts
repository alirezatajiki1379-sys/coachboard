"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { calculateSuggestedOverallRating } from "@/lib/squad/attendance-utils";
import { isMedicalPeriodActiveOnDate, medicalReasonForType } from "@/lib/squad/player-hub";
import { mapPlayerMedicalPeriodRow, type PlayerMedicalPeriodRow } from "@/lib/squad/mappers";
import { generateRecurringTrainingDates, generateTrainingRecurrenceDates, seasonLabelForDate, weekdayForDate } from "@/lib/trainings/utils";
import { ensureActiveSquad } from "@/lib/squad/squads";

type DatabaseClient = Awaited<ReturnType<typeof createClient>>;

export type TrainingEventActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"date" | "startTime" | "endDate" | "label" | "repeatWeekdays" | "repeatEndDate" | "repeatOccurrenceCount" | "repeatIntervalWeeks", string>>;
  values?: {
    date: string;
    startTime: string;
    endTime: string;
    label: string;
    location: string;
    focus: string;
    linkedTrainingSessionId: string;
    squadId: string;
    generalNotes: string;
    repeatMode?: string;
    repeatIntervalWeeks?: string;
    repeatWeekdays?: string[];
    repeatEndMode?: string;
    repeatEndDate?: string;
    repeatOccurrenceCount?: string;
    planApplyMode?: string;
    editScope?: string;
  };
  submissionId?: number;
};

const plannedStatuses = ["expected", "unavailable", "unclear"] as const;
const plannedReasons = ["V", "K", "E", "P", "S", "Z", "U"] as const;
const finalStatuses = ["present", "absent", "Z", "V", "K", "E", "P", "S", "U"] as const;

export type AttendanceMutationResult =
  | {
      ok: true;
      attendanceId: string;
      playerId: string;
      status: (typeof finalStatuses)[number];
      lateMinutes: number | null;
      latePenaltyApplied: boolean;
      updatedAt: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: string) {
  return value ? value : null;
}

function numberOrNull(value: string) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function selectedParticipantIds(formData: FormData) {
  return Array.from(new Set(formData.getAll("participantIds").filter((value): value is string => typeof value === "string" && Boolean(value))));
}

function selectedValues(formData: FormData, key: string) {
  return Array.from(new Set(formData.getAll(key).filter((value): value is string => typeof value === "string" && Boolean(value))));
}

function parseRecurrence(values: NonNullable<TrainingEventActionState["values"]>) {
  const repeatMode = values.repeatMode === "weekly" || values.repeatMode === "two_weeks" || values.repeatMode === "custom" ? values.repeatMode : "none";
  const intervalWeeks =
    repeatMode === "two_weeks"
      ? 2
      : Math.max(1, Number.parseInt(values.repeatIntervalWeeks ?? "1", 10) || 1);
  const weekdayFallback = values.date ? [weekdayForDate(values.date)] : [];
  const weekdays = repeatMode === "none"
    ? []
    : (values.repeatWeekdays?.length ? values.repeatWeekdays : weekdayFallback.map(String))
      .map((day) => Number.parseInt(day, 10))
      .filter((day) => Number.isFinite(day) && day >= 1 && day <= 7);
  const endMode = values.repeatEndMode === "occurrence_count" ? "occurrence_count" as const : "date" as const;
  return {
    enabled: repeatMode !== "none",
    intervalWeeks,
    weekdays: Array.from(new Set(weekdays)),
    endMode,
    occurrenceCount: Number.parseInt(values.repeatOccurrenceCount ?? "", 10) || 0
  };
}

function boundedRating(value: string) {
  const parsed = numberOrNull(value);
  return parsed && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function eventPath(eventId: string, suffix = "") {
  return `/squad/attendance/${eventId}${suffix}`;
}

function revalidateEvent(eventId: string) {
  revalidatePath("/squad");
  revalidatePath("/squad/attendance");
  revalidatePath("/squad/ratings");
  revalidatePath(eventPath(eventId));
  revalidatePath(eventPath(eventId, "/check-in"));
  revalidatePath(eventPath(eventId, "/ratings"));
}

export async function createTrainingEvent(_: TrainingEventActionState, formData: FormData): Promise<TrainingEventActionState> {
  const values = {
    date: formString(formData, "date"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    label: formString(formData, "label"),
    location: formString(formData, "location"),
    focus: formString(formData, "focus"),
    linkedTrainingSessionId: formString(formData, "linkedTrainingSessionId"),
    squadId: formString(formData, "squadId"),
    generalNotes: formString(formData, "generalNotes"),
    repeatMode: formString(formData, "repeatMode") || "none",
    repeatIntervalWeeks: formString(formData, "repeatIntervalWeeks") || "1",
    repeatWeekdays: selectedValues(formData, "repeatWeekdays"),
    repeatEndMode: formString(formData, "repeatEndMode") || "date",
    repeatEndDate: formString(formData, "repeatEndDate"),
    repeatOccurrenceCount: formString(formData, "repeatOccurrenceCount") || "10",
    planApplyMode: formString(formData, "planApplyMode") || "none"
  };
  const fieldErrors: TrainingEventActionState["fieldErrors"] = {};
  if (!values.date) fieldErrors.date = "Choose the training date.";
  if (!values.startTime) fieldErrors.startTime = "Add the start time.";
  if (values.endTime && values.startTime && values.endTime < values.startTime) fieldErrors.startTime = "End time cannot be before the start time.";
  const recurrence = parseRecurrence(values);
  if (recurrence.enabled) {
    if (!recurrence.weekdays.length) fieldErrors.repeatWeekdays = "Choose at least one weekday.";
    if (recurrence.intervalWeeks < 1) fieldErrors.repeatIntervalWeeks = "Repeat interval must be greater than zero.";
    if (recurrence.endMode === "date" && !values.repeatEndDate) fieldErrors.repeatEndDate = "Choose an end date.";
    if (recurrence.endMode === "date" && values.repeatEndDate && values.repeatEndDate < values.date) fieldErrors.repeatEndDate = "End date cannot be before the first training.";
    if (recurrence.endMode === "occurrence_count" && (!recurrence.occurrenceCount || recurrence.occurrenceCount < 1)) fieldErrors.repeatOccurrenceCount = "Add a number greater than zero.";
  }

  if (Object.keys(fieldErrors).length) {
    return { error: "Please fix the highlighted event details.", fieldErrors, values, submissionId: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const squadId = await resolveOwnedSquadId(supabase, user.id, values.squadId);
  if (recurrence.enabled) {
    const dates = generateTrainingRecurrenceDates({
      startDate: values.date,
      intervalWeeks: recurrence.intervalWeeks,
      weekdays: recurrence.weekdays,
      endMode: recurrence.endMode,
      endDate: values.repeatEndDate,
      occurrenceCount: recurrence.occurrenceCount
    });
    if (!dates.length) return { error: "The recurrence does not create any Training Sessions.", fieldErrors: { repeatEndDate: "Check the recurrence end condition." }, values, submissionId: Date.now() };

    const { data: series, error: seriesError } = await db
      .from("training_recurrence_series")
      .insert({
        user_id: user.id,
        squad_id: squadId,
        title: optional(values.label),
        default_start_time: values.startTime,
        default_end_time: optional(values.endTime),
        default_location: optional(values.location),
        default_focus: optional(values.focus),
        frequency: "weekly",
        interval_weeks: recurrence.intervalWeeks,
        weekdays: recurrence.weekdays,
        starts_on: values.date,
        ends_on: recurrence.endMode === "date" ? optional(values.repeatEndDate) : null,
        occurrence_limit: recurrence.endMode === "occurrence_count" ? recurrence.occurrenceCount : null,
        end_mode: recurrence.endMode,
        status: "active"
      })
      .select("id")
      .single();
    if (seriesError) return { error: seriesError.message, values, submissionId: Date.now() };

    const rows = dates.map((date, index) => ({
      user_id: user.id,
      squad_id: squadId,
      recurrence_series_id: series.id,
      recurrence_sequence: index + 1,
      is_series_exception: false,
      date,
      start_time: values.startTime,
      end_time: optional(values.endTime),
      label: optional(values.label),
      location: optional(values.location),
      focus: optional(values.focus),
      season_label: seasonLabelForDate(date),
      linked_training_session_id: values.planApplyMode === "all" || (values.planApplyMode === "first" && index === 0) ? optional(values.linkedTrainingSessionId) : null,
      general_notes: optional(values.generalNotes),
      status: "draft"
    }));
    const { data: createdEvents, error: createError } = await db.from("squad_training_events").insert(rows).select("id,date");
    if (createError) return { error: createError.message, values, submissionId: Date.now() };
    const selectedIds = selectedParticipantIds(formData);
    for (const event of (createdEvents ?? []) as Array<{ id: string; date: string }>) {
      await syncTrainingParticipants(db, user.id, event.id, event.date, selectedIds, { removeUnselected: false, squadId });
      if (values.linkedTrainingSessionId && (values.planApplyMode === "all" || (values.planApplyMode === "first" && event.id === createdEvents?.[0]?.id))) {
        await createSessionPlanSnapshot(db, user.id, event.id, values.linkedTrainingSessionId);
      }
    }
    revalidatePath("/trainings");
    revalidatePath("/squad/attendance");
    redirect("/trainings");
  }
  const { data, error } = await db
    .from("squad_training_events")
    .insert({
      user_id: user.id,
      squad_id: squadId,
      date: values.date,
      start_time: values.startTime,
      end_time: optional(values.endTime),
      label: optional(values.label),
      location: optional(values.location),
      focus: optional(values.focus),
      season_label: seasonLabelForDate(values.date),
      linked_training_session_id: optional(values.linkedTrainingSessionId),
      general_notes: optional(values.generalNotes),
      status: "draft"
    })
    .select("id")
    .single();

  if (error) return { error: error.message, values, submissionId: Date.now() };

  if (data?.id) await syncTrainingParticipants(db, user.id, data.id, values.date, selectedParticipantIds(formData), { squadId });
  if (data?.id && values.linkedTrainingSessionId) await createSessionPlanSnapshot(db, user.id, data.id, values.linkedTrainingSessionId);

  revalidatePath("/trainings");
  revalidatePath("/squad/attendance");
  redirect(data?.id ? `/trainings/${data.id}` : "/trainings");
}

export async function updateTrainingEvent(_: TrainingEventActionState, formData: FormData): Promise<TrainingEventActionState> {
  const eventId = formString(formData, "eventId");
  const values = {
    date: formString(formData, "date"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    label: formString(formData, "label"),
    location: formString(formData, "location"),
    focus: formString(formData, "focus"),
    linkedTrainingSessionId: formString(formData, "linkedTrainingSessionId"),
    squadId: formString(formData, "squadId"),
    generalNotes: formString(formData, "generalNotes"),
    editScope: formString(formData, "editScope") || "single"
  };
  const fieldErrors: TrainingEventActionState["fieldErrors"] = {};
  if (!eventId) return { error: "Missing training event.", values, submissionId: Date.now() };
  if (!values.date) fieldErrors.date = "Choose the training date.";
  if (!values.startTime) fieldErrors.startTime = "Add the start time.";
  if (values.endTime && values.startTime && values.endTime < values.startTime) fieldErrors.startTime = "End time cannot be before the start time.";
  if (Object.keys(fieldErrors).length) {
    return { error: "Please fix the highlighted event details.", fieldErrors, values, submissionId: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: originalEvent, error: originalError } = await db
    .from("squad_training_events")
    .select("id,date,recurrence_series_id")
    .eq("id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (originalError) return { error: originalError.message, values, submissionId: Date.now() };
  if (!originalEvent) return { error: "Training event not found.", values, submissionId: Date.now() };
  const squadId = await resolveOwnedSquadId(supabase, user.id, values.squadId);
  const { error } = await db
    .from("squad_training_events")
    .update({
      squad_id: squadId,
      squad_assignment_needs_review: false,
      date: values.date,
      start_time: values.startTime,
      end_time: optional(values.endTime),
      label: optional(values.label),
      location: optional(values.location),
      focus: optional(values.focus),
      season_label: seasonLabelForDate(values.date),
      linked_training_session_id: optional(values.linkedTrainingSessionId),
      general_notes: optional(values.generalNotes),
      is_series_exception: originalEvent.recurrence_series_id ? values.editScope !== "future" : false,
      exception_type: originalEvent.recurrence_series_id && values.editScope !== "future" ? "edited" : null,
      recurrence_original_date: originalEvent.recurrence_series_id && values.editScope !== "future" && values.date !== originalEvent.date ? originalEvent.date : null
    })
    .eq("id", eventId)
    .eq("user_id", user.id);
  if (error) return { error: error.message, values, submissionId: Date.now() };

  await syncTrainingParticipants(db, user.id, eventId, values.date, selectedParticipantIds(formData), { squadId });
  if (originalEvent.recurrence_series_id && values.editScope === "future") {
    const { data: futureEvents, error: futureError } = await db
      .from("squad_training_events")
      .select("id,date")
      .eq("user_id", user.id)
      .eq("recurrence_series_id", originalEvent.recurrence_series_id)
      .gte("date", originalEvent.date)
      .is("deleted_at", null)
      .neq("status", "completed");
    if (futureError) return { error: futureError.message, values, submissionId: Date.now() };
    const futureIds = ((futureEvents ?? []) as Array<{ id: string; date: string }>).map((event) => event.id).filter((id) => id !== eventId);
    if (futureIds.length) {
      const { error: futureUpdateError } = await db
        .from("squad_training_events")
        .update({
          start_time: values.startTime,
          end_time: optional(values.endTime),
          label: optional(values.label),
          location: optional(values.location),
          focus: optional(values.focus),
          linked_training_session_id: optional(values.linkedTrainingSessionId),
          general_notes: optional(values.generalNotes)
        })
        .eq("user_id", user.id)
        .in("id", futureIds);
      if (futureUpdateError) return { error: futureUpdateError.message, values, submissionId: Date.now() };
      for (const futureEvent of (futureEvents ?? []) as Array<{ id: string; date: string }>) {
        if (futureEvent.id === eventId) continue;
        await syncTrainingParticipants(db, user.id, futureEvent.id, futureEvent.date, selectedParticipantIds(formData), { squadId });
      }
    }
    await db
      .from("training_recurrence_series")
      .update({
        title: optional(values.label),
        default_start_time: values.startTime,
        default_end_time: optional(values.endTime),
        default_location: optional(values.location),
        default_focus: optional(values.focus)
      })
      .eq("id", originalEvent.recurrence_series_id)
      .eq("user_id", user.id);
  }
  if (values.linkedTrainingSessionId) await createSessionPlanSnapshot(db, user.id, eventId, values.linkedTrainingSessionId);
  revalidateEvent(eventId);
  revalidatePath("/trainings");
  redirect(`/trainings/${eventId}`);
}

export async function createRecurringTrainingEvents(_: TrainingEventActionState, formData: FormData): Promise<TrainingEventActionState> {
  const values = {
    date: formString(formData, "date"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    label: formString(formData, "label"),
    location: formString(formData, "location"),
    focus: formString(formData, "focus"),
    linkedTrainingSessionId: "",
    squadId: formString(formData, "squadId"),
    generalNotes: formString(formData, "generalNotes")
  };
  const endDate = formString(formData, "endDate");
  const intervalWeeks = formString(formData, "intervalWeeks") === "2" ? 2 : 1;
  const fieldErrors: TrainingEventActionState["fieldErrors"] = {};
  if (!values.date) fieldErrors.date = "Choose the first training date.";
  if (!endDate) fieldErrors.endDate = "Choose the end date.";
  if (!values.startTime) fieldErrors.startTime = "Add the start time.";
  if (values.endTime && values.startTime && values.endTime < values.startTime) fieldErrors.startTime = "End time cannot be before the start time.";

  const dates = generateRecurringTrainingDates({ startDate: values.date, endDate, intervalWeeks });
  if (!dates.length && !Object.keys(fieldErrors).length) fieldErrors.endDate = "The series does not contain any training dates.";

  if (Object.keys(fieldErrors).length) {
    return { error: "Please fix the highlighted series details.", fieldErrors, values, submissionId: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const squadId = await resolveOwnedSquadId(supabase, user.id, values.squadId);
  const rows = dates.map((date) => ({
    user_id: user.id,
    squad_id: squadId,
    date,
    start_time: values.startTime,
    end_time: optional(values.endTime),
    label: optional(values.label),
    location: optional(values.location),
    focus: optional(values.focus),
    season_label: seasonLabelForDate(date),
    general_notes: optional(values.generalNotes),
    status: "draft"
  }));

  const { data: createdEvents, error } = await db.from("squad_training_events").insert(rows).select("id,date");
  if (error) return { error: error.message, values, submissionId: Date.now() };

  const selectedIds = selectedParticipantIds(formData);
  for (const event of (createdEvents ?? []) as Array<{ id: string; date: string }>) {
    await syncTrainingParticipants(db, user.id, event.id, event.date, selectedIds, { removeUnselected: false, squadId });
  }

  revalidatePath("/trainings");
  revalidatePath("/squad/attendance");
  redirect("/trainings");
}

export async function deleteTrainingEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const deleteScope = formString(formData, "deleteScope");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: event, error: eventError } = await db
    .from("squad_training_events")
    .select("date,recurrence_series_id")
    .eq("id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  const deletedAt = new Date().toISOString();
  let query = db.from("squad_training_events").update({ deleted_at: deletedAt }).eq("user_id", user.id);
  if (deleteScope === "future" && event?.recurrence_series_id) {
    query = query.eq("recurrence_series_id", event.recurrence_series_id).gte("date", event.date);
  } else {
    query = query.eq("id", eventId);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidatePath("/trainings");
  revalidatePath("/squad/attendance");
  revalidatePath("/squad/ratings");
  redirect("/trainings");
}

export async function restoreTrainingEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("squad_training_events").update({ deleted_at: null }).eq("id", eventId).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/trainings");
  redirect("/trainings?view=trash");
}

export async function permanentlyDeleteTrainingEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const confirmation = formString(formData, "confirmPermanent");
  if (confirmation !== "DELETE") redirect("/trainings?view=trash");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("squad_training_events").delete().eq("id", eventId).eq("user_id", user.id).not("deleted_at", "is", null);
  if (error) throw new Error(error.message);
  revalidatePath("/trainings");
  redirect("/trainings?view=trash");
}

export async function addSquadPlayersToEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: event, error: eventError } = await db.from("squad_training_events").select("date,squad_id").eq("id", eventId).eq("user_id", user.id).maybeSingle();
  if (eventError) throw new Error(eventError.message);
  let playersQuery = db
    .from("squad_players")
    .select("id")
    .eq("user_id", user.id)
    .eq("player_type", "roster")
    .is("archived_at", null);
  if (event?.squad_id) playersQuery = playersQuery.eq("squad_id", event.squad_id);
  const { data: players, error: playersError } = await playersQuery;
  if (playersError) throw new Error(playersError.message);

  const playerIds = ((players ?? []) as { id: string }[]).map((player) => player.id);
  const medicalByPlayer = await getMedicalByPlayer(db, user.id, event?.date ?? "", playerIds);

  const rows = playerIds.map((playerId) => {
    const medical = medicalByPlayer.get(playerId);
    return {
      user_id: user.id,
      event_id: eventId,
      player_id: playerId,
      planned_status: medical ? "unavailable" : "expected",
      planned_reason: medical ? medicalReasonForType(medical.type) : null,
      planned_reason_note: medical?.description ?? null,
      planned_status_source: medical ? "medical" : "default"
    };
  });

  if (rows.length) {
    const { error } = await db.from("squad_attendance_records").upsert(rows, { onConflict: "event_id,player_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function addTrialPlayerToEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const displayName = formString(formData, "displayName");
  if (!displayName) redirect(eventPath(eventId));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: event, error: eventError } = await db
    .from("squad_training_events")
    .select("squad_id")
    .eq("id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  const { data: player, error: playerError } = await db
    .from("squad_players")
    .insert({
      user_id: user.id,
      squad_id: event?.squad_id ?? null,
      player_type: "trial",
      first_name: displayName,
      player_phone: optional(formString(formData, "contact")),
      notes: optional(formString(formData, "notes"))
    })
    .select("id")
    .single();
  if (playerError) throw new Error(playerError.message);

  await upsertAttendanceRecord(db, user.id, eventId, player.id);
  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function addExistingTrialPlayerToEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const playerId = formString(formData, "playerId");
  if (!playerId) redirect(eventPath(eventId));
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: event, error: eventError } = await db
    .from("squad_training_events")
    .select("squad_id")
    .eq("id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  const { data: player, error: playerError } = await db
    .from("squad_players")
    .select("id")
    .eq("id", playerId)
    .eq("user_id", user.id)
    .eq("player_type", "trial")
    .is("converted_at", null)
    .maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (player && event?.squad_id) {
    const { data: sameTeamPlayer, error: sameTeamError } = await db
      .from("squad_players")
      .select("id")
      .eq("id", player.id)
      .eq("user_id", user.id)
      .eq("squad_id", event.squad_id)
      .maybeSingle();
    if (sameTeamError) throw new Error(sameTeamError.message);
    if (sameTeamPlayer) await upsertAttendanceRecord(db, user.id, eventId, sameTeamPlayer.id);
  }

  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function removePlayerFromEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .delete()
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function updatePlannedAttendance(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const plannedStatus = formString(formData, "plannedStatus");
  if (!plannedStatuses.includes(plannedStatus as (typeof plannedStatuses)[number])) redirect(eventPath(eventId));
  const plannedReason = formString(formData, "plannedReason");
  const safeReason =
    plannedStatus === "unavailable" && plannedReasons.includes(plannedReason as (typeof plannedReasons)[number])
      ? plannedReason
      : null;

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({
      planned_status: plannedStatus,
      planned_reason: safeReason,
      planned_reason_note: plannedStatus === "unavailable" ? optional(formString(formData, "plannedReasonNote")) : null,
      planned_status_source: "manual"
    })
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(formString(formData, "returnTo") || eventPath(eventId));
}

export async function markAllExpected(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({ planned_status: "expected", planned_reason: null, planned_reason_note: null, planned_status_source: "manual" })
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventPrepared(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function updateFinalAttendance(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const finalStatus = formString(formData, "finalStatus");
  if (!finalStatuses.includes(finalStatus as (typeof finalStatuses)[number])) redirect(eventPath(eventId));

  const lateMinutes = finalStatus === "Z" ? numberOrNull(formString(formData, "lateMinutes")) : null;
  const latePenaltyApplied = finalStatus === "Z" ? formData.get("latePenaltyApplied") === "on" : true;
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({
      final_status: finalStatus,
      late_minutes: lateMinutes,
      late_penalty_applied: latePenaltyApplied
    })
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventInProgress(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(formString(formData, "returnTo") || eventPath(eventId));
}

export async function updateFinalAttendanceInline(formData: FormData): Promise<AttendanceMutationResult> {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const finalStatus = formString(formData, "finalStatus");
  if (!finalStatuses.includes(finalStatus as (typeof finalStatuses)[number])) {
    return attendanceMutationError("invalid_status", "Attendance could not be updated.");
  }

  const lateMinutes = finalStatus === "Z" ? numberOrNull(formString(formData, "lateMinutes")) : null;
  const latePenaltyApplied = finalStatus === "Z" ? formData.get("latePenaltyApplied") === "on" : true;
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const validation = await validateAttendanceMutation(db, user.id, eventId, attendanceId);
  if (!validation.ok) return validation;

  const { data, error } = await db
    .from("squad_attendance_records")
    .update({
      final_status: finalStatus,
      late_minutes: lateMinutes,
      late_penalty_applied: latePenaltyApplied
    })
    .select("id, player_id, updated_at")
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return attendanceMutationError("database_error", "Attendance could not be updated.");
  if (!data) return attendanceMutationError("not_found", "Attendance record not found.");

  await markEventInProgress(db, user.id, eventId);
  return {
    ok: true,
    attendanceId: data.id,
    playerId: data.player_id,
    status: finalStatus as (typeof finalStatuses)[number],
    lateMinutes,
    latePenaltyApplied,
    updatedAt: data.updated_at
  };
}

export async function markAllExpectedPresent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({ final_status: "present", late_minutes: null, late_penalty_applied: true })
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .is("final_status", null)
    .or("planned_status.is.null,planned_status.eq.expected");
  if (error) throw new Error(error.message);

  await markEventInProgress(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId, "/check-in"));
}

export async function markAllPresent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({ final_status: "present", late_minutes: null, late_penalty_applied: true })
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventInProgress(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId, "/check-in"));
}

export async function updateAttendanceRating(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const attendanceId = formString(formData, "attendanceId");
  const ratingTechnique = boundedRating(formString(formData, "ratingTechnique"));
  const ratingGameUnderstanding = boundedRating(formString(formData, "ratingGameUnderstanding"));
  const ratingIntensity = boundedRating(formString(formData, "ratingIntensity"));
  const ratingBehavior = boundedRating(formString(formData, "ratingBehavior"));
  const suggestion = calculateSuggestedOverallRating([ratingTechnique, ratingGameUnderstanding, ratingIntensity, ratingBehavior]);
  const overallRating = boundedRating(formString(formData, "overallRating"));

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_attendance_records")
    .update({
      overall_rating: overallRating,
      rating_technique: ratingTechnique,
      rating_game_understanding: ratingGameUnderstanding,
      rating_intensity: ratingIntensity,
      rating_behavior: ratingBehavior,
      rating_auto_suggestion: suggestion,
      coach_note: optional(formString(formData, "coachNote")),
      sensitive_note: formData.get("sensitiveNote") === "on"
    })
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await markEventRatingOpen(db, user.id, eventId);
  revalidateEvent(eventId);
  redirect(eventPath(eventId, "/ratings"));
}

export async function completeTrainingEvent(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data: existing, error: existingError } = await db
    .from("squad_training_events")
    .select("completed_at")
    .eq("id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const { error } = await db
    .from("squad_training_events")
    .update({ status: "completed", completed_at: existing?.completed_at ?? new Date().toISOString() })
    .eq("id", eventId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidateEvent(eventId);
  redirect(eventPath(eventId));
}

export async function convertTrialPlayerToSquadPlayer(formData: FormData) {
  const eventId = formString(formData, "eventId");
  const playerId = formString(formData, "playerId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("squad_players")
    .update({ player_type: "roster", converted_at: new Date().toISOString() })
    .eq("id", playerId)
    .eq("user_id", user.id)
    .eq("player_type", "trial");
  if (error) throw new Error(error.message);

  revalidateEvent(eventId);
  revalidatePath("/squad");
  redirect(eventPath(eventId));
}

async function upsertAttendanceRecord(db: SupabaseClient, userId: string, eventId: string, playerId: string) {
  const { error } = await db
    .from("squad_attendance_records")
    .upsert(
      {
        user_id: userId,
        event_id: eventId,
        player_id: playerId,
        planned_status: "expected",
        planned_status_source: "default"
      },
      { onConflict: "event_id,player_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

async function syncTrainingParticipants(
  db: SupabaseClient,
  userId: string,
  eventId: string,
  eventDate: string,
  playerIds: string[],
  options: { removeUnselected?: boolean; squadId?: string } = {}
) {
  const removeUnselected = options.removeUnselected ?? true;
  const safePlayerIds = Array.from(new Set(playerIds));
  if (safePlayerIds.length) {
    let playerQuery = db
      .from("squad_players")
      .select("id")
      .eq("user_id", userId)
      .is("archived_at", null)
      .in("id", safePlayerIds);
    if (options.squadId) playerQuery = playerQuery.eq("squad_id", options.squadId);
    const { data: players, error: playerError } = await playerQuery;
    if (playerError) throw new Error(playerError.message);

    const validPlayerIds = ((players ?? []) as Array<{ id: string }>).map((player) => player.id);
    const medicalByPlayer = await getMedicalByPlayer(db, userId, eventDate, validPlayerIds);
    const rows = validPlayerIds.map((playerId) => {
      const medical = medicalByPlayer.get(playerId);
      return {
        user_id: userId,
        event_id: eventId,
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

  if (!removeUnselected) return;
  const { data: existing, error: existingError } = await db
    .from("squad_attendance_records")
    .select("id, player_id, final_status, overall_rating, rating_technique, rating_game_understanding, rating_intensity, rating_behavior, coach_note")
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (existingError) throw new Error(existingError.message);
  const selected = new Set(safePlayerIds);
  const removableIds = ((existing ?? []) as Array<{
    id: string;
    player_id: string;
    final_status: string | null;
    overall_rating: number | null;
    rating_technique: number | null;
    rating_game_understanding: number | null;
    rating_intensity: number | null;
    rating_behavior: number | null;
    coach_note: string | null;
  }>)
    .filter((record) => {
      if (selected.has(record.player_id)) return false;
      return !record.final_status && !record.overall_rating && !record.rating_technique && !record.rating_game_understanding && !record.rating_intensity && !record.rating_behavior && !record.coach_note;
    })
    .map((record) => record.id);
  if (removableIds.length) {
    const { error } = await db.from("squad_attendance_records").delete().eq("user_id", userId).in("id", removableIds);
    if (error) throw new Error(error.message);
  }
}

async function resolveOwnedSquadId(db: DatabaseClient, userId: string, submittedSquadId: string) {
  if (submittedSquadId) {
    const { data, error } = await db.from("squads").select("id").eq("id", submittedSquadId).eq("user_id", userId).is("archived_at", null).maybeSingle();
    if (error) throw new Error(error.message);
    const squad = data as { id?: string } | null;
    if (squad?.id) return squad.id;
  }
  const activeSquad = await ensureActiveSquad(db, userId);
  return activeSquad.id;
}

async function createSessionPlanSnapshot(db: SupabaseClient, userId: string, eventId: string, sourceTrainingSessionId: string) {
  const { data: sourcePlan, error: sourcePlanError } = await db
    .from("training_sessions")
    .select("*")
    .eq("id", sourceTrainingSessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sourcePlanError) throw new Error(sourcePlanError.message);
  if (!sourcePlan) return;

  const { data: existingPlan } = await db
    .from("training_session_plan_instances")
    .select("id, source_training_session_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingPlan?.source_training_session_id === sourceTrainingSessionId) return;

  await db.from("training_session_drill_instances").delete().eq("event_id", eventId).eq("user_id", userId);
  await db.from("training_session_plan_instances").delete().eq("event_id", eventId).eq("user_id", userId);

  const { data: planInstance, error: planInstanceError } = await db
    .from("training_session_plan_instances")
    .insert({
      user_id: userId,
      event_id: eventId,
      source_training_session_id: sourceTrainingSessionId,
      source_updated_at: sourcePlan.updated_at,
      title: sourcePlan.title,
      snapshot_json: {
        title: sourcePlan.title,
        date: sourcePlan.session_date,
        startTime: sourcePlan.start_time,
        teamAgeGroup: sourcePlan.team_age_group,
        mainFocus: sourcePlan.main_focus,
        secondaryFocus: sourcePlan.secondary_focus,
        targetDurationMinutes: sourcePlan.duration_target_minutes,
        location: sourcePlan.location,
        notes: sourcePlan.notes,
        playerGroups: sourcePlan.player_groups
      }
    })
    .select("id")
    .single();
  if (planInstanceError) throw new Error(planInstanceError.message);

  const { data: sourceDrills, error: sourceDrillsError } = await db
    .from("training_session_drills")
    .select("*, drills(*, drill_graphics(canvas_json))")
    .eq("session_id", sourceTrainingSessionId)
    .eq("user_id", userId)
    .order("order_index", { ascending: true });
  if (sourceDrillsError) throw new Error(sourceDrillsError.message);

  const rows = ((sourceDrills ?? []) as Array<{
    id: string;
    drill_id: string;
    block: string;
    order_index: number;
    planned_duration_minutes: number;
    coach_notes: string | null;
    timing_mode: string;
    simultaneous_group: string | null;
    participating_groups: string[] | null;
    starting_group: string | null;
    drills?: {
      id: string;
      title: string;
      short_description: string | null;
      organization: string | null;
      coaching_points: string | null;
      variations: string | null;
      easier_version: string | null;
      harder_version: string | null;
      duration_minutes: number;
      min_players: number;
      max_players: number;
      materials: unknown;
      updated_at: string;
      drill_graphics?: Array<{ canvas_json: unknown }> | { canvas_json: unknown } | null;
    } | null;
  }>).map((row) => {
    const drill = row.drills;
    const graphics = Array.isArray(drill?.drill_graphics) ? drill?.drill_graphics[0]?.canvas_json : drill?.drill_graphics?.canvas_json;
    return {
      user_id: userId,
      event_id: eventId,
      plan_instance_id: planInstance.id,
      source_training_session_drill_id: row.id,
      source_drill_id: row.drill_id,
      source_drill_updated_at: drill?.updated_at ?? null,
      title: drill?.title ?? "Session drill",
      block: row.block,
      order_index: row.order_index,
      planned_duration_minutes: row.planned_duration_minutes,
      snapshot_json: {
        sessionDrill: {
          block: row.block,
          orderIndex: row.order_index,
          plannedDurationMinutes: row.planned_duration_minutes,
          coachNotes: row.coach_notes,
          timingMode: row.timing_mode,
          stationSet: row.simultaneous_group,
          participatingGroups: row.participating_groups,
          startingGroup: row.starting_group
        },
        sourceDrill: drill
          ? {
              title: drill.title,
              shortDescription: drill.short_description,
              organization: drill.organization,
              coachingPoints: drill.coaching_points,
              variations: drill.variations,
              easierVersion: drill.easier_version,
              harderVersion: drill.harder_version,
              durationMinutes: drill.duration_minutes,
              minPlayers: drill.min_players,
              maxPlayers: drill.max_players,
              materials: drill.materials,
              graphic: graphics
            }
          : null
      }
    };
  });

  if (rows.length) {
    const { error } = await db.from("training_session_drill_instances").insert(rows);
    if (error) throw new Error(error.message);
  }
}

async function getMedicalByPlayer(db: SupabaseClient, userId: string, eventDate: string, playerIds: string[]) {
  const result = new Map<string, ReturnType<typeof mapPlayerMedicalPeriodRow>>();
  if (!eventDate || !playerIds.length) return result;
  const { data, error } = await db
    .from("player_medical_periods")
    .select("*")
    .eq("user_id", userId)
    .in("player_id", Array.from(new Set(playerIds)))
    .eq("status", "active")
    .lte("start_date", eventDate)
    .or(`end_date.is.null,end_date.gte.${eventDate}`);
  if (error) return result;
  for (const row of (data ?? []) as PlayerMedicalPeriodRow[]) {
    const medical = mapPlayerMedicalPeriodRow(row);
    if (isMedicalPeriodActiveOnDate(medical, eventDate) && !result.has(medical.playerId)) result.set(medical.playerId, medical);
  }
  return result;
}

async function markEventPrepared(db: SupabaseClient, userId: string, eventId: string) {
  await db.from("squad_training_events").update({ status: "prepared" }).eq("id", eventId).eq("user_id", userId).neq("status", "completed");
}

async function markEventInProgress(db: SupabaseClient, userId: string, eventId: string) {
  await db.from("squad_training_events").update({ status: "in_progress" }).eq("id", eventId).eq("user_id", userId).neq("status", "completed");
}

function attendanceMutationError(code: string, message: string): AttendanceMutationResult {
  return { ok: false, code, message };
}

async function validateAttendanceMutation(db: SupabaseClient, userId: string, eventId: string, attendanceId: string): Promise<{ ok: true } | AttendanceMutationResult> {
  if (!eventId || !attendanceId) return attendanceMutationError("missing_input", "Attendance could not be updated.");
  const { data: event, error: eventError } = await db
    .from("squad_training_events")
    .select("id, squad_id, deleted_at")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (eventError) return attendanceMutationError("event_error", "Training could not be checked.");
  if (!event || event.deleted_at) return attendanceMutationError("event_not_found", "Training is no longer available.");

  const { data: record, error: recordError } = await db
    .from("squad_attendance_records")
    .select("id, player_id")
    .eq("id", attendanceId)
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (recordError) return attendanceMutationError("record_error", "Attendance record could not be checked.");
  if (!record) return attendanceMutationError("record_not_found", "Attendance record not found.");

  const { data: player, error: playerError } = await db
    .from("squad_players")
    .select("id, squad_id")
    .eq("id", record.player_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (playerError) return attendanceMutationError("player_error", "Player could not be checked.");
  if (!player) return attendanceMutationError("player_not_found", "Player not found.");
  if (event.squad_id && player.squad_id !== event.squad_id) {
    return attendanceMutationError("wrong_team", "Player does not belong to this Team.");
  }
  return { ok: true };
}

async function markEventRatingOpen(db: SupabaseClient, userId: string, eventId: string) {
  await db.from("squad_training_events").update({ status: "rating_open" }).eq("id", eventId).eq("user_id", userId).neq("status", "completed");
}
