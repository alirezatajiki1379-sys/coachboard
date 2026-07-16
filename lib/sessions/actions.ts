"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getUserSession } from "@/lib/sessions/queries";
import { normalizeGroupRef, normalizeGroupRefs, normalizePlayerGroups, normalizeSimultaneousGroup, type SessionFormValues } from "@/lib/sessions/utils";

export type SessionActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"title", string>>;
  values?: SessionFormValues;
  submissionId?: number;
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
  return typeof value === "string" ? value : "";
}

function safeReturnTo(formData: FormData) {
  const returnTo = formString(formData, "returnTo");
  return returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "";
}

function numberOrNull(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePayload(formData: FormData): { ok: true; values: SessionFormValues } | { ok: false; state: SessionActionState } {
  try {
    const values = normalizeSessionValues(JSON.parse(formString(formData, "sessionPayload")) as SessionFormValues);
    if (!values.title?.trim()) {
      return {
        ok: false,
        state: {
          error: "Please give this session a title. Your session plan is still here.",
          fieldErrors: { title: "Add a clear session title." },
          values,
          submissionId: Date.now()
        }
      };
    }
    return { ok: true, values };
  } catch {
    return { ok: false, state: { error: "Could not read the session form. Please try again.", submissionId: Date.now() } };
  }
}

function normalizeSessionValues(values: SessionFormValues): SessionFormValues {
  const playerGroups = normalizePlayerGroups(values.playerGroups);
  return {
    ...values,
    playerGroups,
    drills: (values.drills ?? []).map((item, index) => {
      const participatingGroups = normalizeGroupRefs(item.participatingGroups, playerGroups);
      const startingGroup = normalizeGroupRef(item.startingGroup, playerGroups);
      return {
        ...item,
        orderIndex: index,
        timingMode: item.timingMode === "simultaneous" ? "simultaneous" : "sequential",
        simultaneousGroup: normalizeSimultaneousGroup(item.simultaneousGroup),
        participatingGroups,
        startingGroup: participatingGroups.includes(startingGroup) ? startingGroup : participatingGroups[0] ?? "",
        plannedDurationMinutes: Math.max(1, item.plannedDurationMinutes || 1),
        coachNotes: item.coachNotes ?? ""
      };
    })
  };
}

export async function createSession(_: SessionActionState, formData: FormData): Promise<SessionActionState> {
  const returnTo = safeReturnTo(formData);
  const parsed = parsePayload(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("training_sessions")
    .insert(sessionInsert(parsed.values, user.id))
    .select("id")
    .single();

  if (error) return { error: error.message, values: parsed.values, submissionId: Date.now() };

  await replaceSessionDrills(db, user.id, data.id, parsed.values);
  revalidatePath("/sessions");
  redirect(returnTo || `/sessions/${data.id}`);
}

export async function updateSession(_: SessionActionState, formData: FormData): Promise<SessionActionState> {
  const returnTo = safeReturnTo(formData);
  const sessionId = formString(formData, "sessionId");
  const parsed = parsePayload(formData);
  if (!parsed.ok) return parsed.state;
  if (!sessionId) return { error: "Missing session id.", values: parsed.values, submissionId: Date.now() };

  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db
    .from("training_sessions")
    .update(sessionInsert(parsed.values, user.id))
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (error) return { error: error.message, values: parsed.values, submissionId: Date.now() };

  await db.from("training_session_drills").delete().eq("session_id", sessionId).eq("user_id", user.id);
  await replaceSessionDrills(db, user.id, sessionId, parsed.values);
  revalidatePath("/sessions");
  revalidatePath(`/sessions/${sessionId}`);
  redirect(returnTo || `/sessions/${sessionId}`);
}

export async function deleteSession(formData: FormData) {
  const sessionId = formString(formData, "sessionId");
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as SupabaseClient;
  await db.from("training_sessions").delete().eq("id", sessionId).eq("user_id", user.id);
  revalidatePath("/sessions");
  redirect("/sessions");
}

export async function duplicateSession(formData: FormData) {
  const sessionId = formString(formData, "sessionId");
  const { supabase, user } = await requireUser();
  const session = await getUserSession(supabase, user.id, sessionId);
  if (!session) redirect("/sessions");

  const db = supabase as unknown as SupabaseClient;
  const values: SessionFormValues = {
    title: `${session.title} copy`,
    sessionDate: session.date ?? "",
    startTime: session.startTime ?? "",
    teamAgeGroup: session.teamAgeGroup ?? "",
    mainFocus: session.mainFocus ?? "",
    secondaryFocus: session.secondaryFocus ?? "",
    expectedPlayers: String(session.expectedPlayers ?? ""),
    durationTargetMinutes: String(session.durationTargetMinutes ?? ""),
    location: session.location ?? "",
    notes: session.notes ?? "",
    playerGroups: session.playerGroups,
    drills: session.drills.map((item, index) => ({
      id: crypto.randomUUID(),
      drillId: item.drillId,
      block: item.block,
      plannedDurationMinutes: item.plannedDurationMinutes,
      coachNotes: item.coachNotes ?? "",
      orderIndex: index,
      timingMode: item.timingMode,
      simultaneousGroup: normalizeSimultaneousGroup(item.simultaneousGroup),
      participatingGroups: item.participatingGroups ?? [],
      startingGroup: item.startingGroup ?? ""
    }))
  };

  const { data } = await db.from("training_sessions").insert(sessionInsert(values, user.id)).select("id").single();
  if (data?.id) await replaceSessionDrills(db, user.id, data.id, values);
  revalidatePath("/sessions");
  redirect(data?.id ? `/sessions/${data.id}/edit` : "/sessions");
}

function sessionInsert(values: SessionFormValues, userId: string) {
  return {
    user_id: userId,
    title: values.title.trim(),
    session_date: values.sessionDate || null,
    start_time: values.startTime || null,
    team_age_group: values.teamAgeGroup || null,
    main_focus: values.mainFocus || null,
    secondary_focus: values.secondaryFocus.trim() || null,
    expected_players: numberOrNull(values.expectedPlayers),
    duration_target_minutes: numberOrNull(values.durationTargetMinutes),
    location: values.location.trim() || null,
    notes: values.notes.trim() || null,
    player_groups: values.playerGroups
  };
}

async function replaceSessionDrills(db: SupabaseClient, userId: string, sessionId: string, values: SessionFormValues) {
  const rows = values.drills.map((item, index) => ({
    user_id: userId,
    session_id: sessionId,
    drill_id: item.drillId,
    block: item.block || "Main part 1",
    order_index: index,
    planned_duration_minutes: Math.max(1, item.plannedDurationMinutes || 1),
    coach_notes: item.coachNotes.trim() || null,
    timing_mode: item.timingMode,
    simultaneous_group: item.timingMode === "simultaneous" ? normalizeSimultaneousGroup(item.simultaneousGroup) : null,
    participating_groups: item.timingMode === "simultaneous" && item.participatingGroups.length ? item.participatingGroups : null,
    starting_group: item.timingMode === "simultaneous" ? item.startingGroup.trim() || null : null
  }));
  if (rows.length) await db.from("training_session_drills").insert(rows);
}
