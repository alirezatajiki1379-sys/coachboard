"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PlayerNoteVisibility } from "@/types/domain";

export type PlayerNoteActionState = {
  ok: boolean;
  message: string;
  completedAt?: number;
};

export async function createPlayerNote(_previous: PlayerNoteActionState, formData: FormData): Promise<PlayerNoteActionState> {
  const note = text(formData, "note");
  const playerId = text(formData, "playerId");
  if (!note) return failure(message(formData, "Write a note before saving.", "Schreibe vor dem Speichern eine Notiz."));
  if (note.length > 2000) return failure(message(formData, "Keep the note under 2,000 characters.", "Die Notiz darf höchstens 2.000 Zeichen enthalten."));

  const context = await ownedPlayer(playerId);
  if (!context.ok) return failure(message(formData, context.message, context.message === "The player could not be found." ? "Der Spieler wurde nicht gefunden." : context.message === "Assign the player to a Team before adding notes." ? "Ordne den Spieler vor dem Hinzufügen einer Notiz einer Mannschaft zu." : "Melde dich erneut an, um diese Notiz zu speichern."));
  const { error } = await context.db.from("player_notes").insert({
    user_id: context.userId,
    squad_id: context.squadId,
    player_id: playerId,
    note,
    note_date: validDate(text(formData, "noteDate")) ?? today(),
    visibility: visibility(formData),
    pinned: formData.get("pinned") === "on"
  });
  if (error) return failure(message(formData, "The note could not be saved.", "Die Notiz konnte nicht gespeichert werden."));
  revalidatePlayer(playerId);
  return success(message(formData, "Note added.", "Notiz hinzugefügt."));
}

export async function updatePlayerNote(_previous: PlayerNoteActionState, formData: FormData): Promise<PlayerNoteActionState> {
  const note = text(formData, "note");
  const noteId = text(formData, "noteId");
  const playerId = text(formData, "playerId");
  if (!note || !noteId) return failure(message(formData, "The note cannot be empty.", "Die Notiz darf nicht leer sein."));
  if (note.length > 2000) return failure(message(formData, "Keep the note under 2,000 characters.", "Die Notiz darf höchstens 2.000 Zeichen enthalten."));

  const context = await ownedPlayer(playerId);
  if (!context.ok) return failure(message(formData, context.message, context.message === "The player could not be found." ? "Der Spieler wurde nicht gefunden." : context.message === "Assign the player to a Team before adding notes." ? "Ordne den Spieler vor dem Hinzufügen einer Notiz einer Mannschaft zu." : "Melde dich erneut an, um diese Notiz zu speichern."));
  const { error } = await context.db
    .from("player_notes")
    .update({
      note,
      note_date: validDate(text(formData, "noteDate")) ?? today(),
      visibility: visibility(formData),
      pinned: formData.get("pinned") === "on"
    })
    .eq("id", noteId)
    .eq("player_id", playerId)
    .eq("user_id", context.userId);
  if (error) return failure(message(formData, "The note could not be updated.", "Die Notiz konnte nicht aktualisiert werden."));
  revalidatePlayer(playerId);
  return success(message(formData, "Note updated.", "Notiz aktualisiert."));
}

export async function deletePlayerNote(_previous: PlayerNoteActionState, formData: FormData): Promise<PlayerNoteActionState> {
  const noteId = text(formData, "noteId");
  const playerId = text(formData, "playerId");
  if (!noteId || !playerId) return failure(message(formData, "The note could not be found.", "Die Notiz wurde nicht gefunden."));

  const context = await ownedPlayer(playerId);
  if (!context.ok) return failure(message(formData, context.message, context.message === "The player could not be found." ? "Der Spieler wurde nicht gefunden." : context.message === "Assign the player to a Team before adding notes." ? "Ordne den Spieler vor dem Hinzufügen einer Notiz einer Mannschaft zu." : "Melde dich erneut an, um diese Notiz zu speichern."));
  const { error } = await context.db.from("player_notes").delete().eq("id", noteId).eq("player_id", playerId).eq("user_id", context.userId);
  if (error) return failure(message(formData, "The note could not be deleted.", "Die Notiz konnte nicht gelöscht werden."));
  revalidatePlayer(playerId);
  return success(message(formData, "Note deleted.", "Notiz gelöscht."));
}

async function ownedPlayer(playerId: string): Promise<
  | { ok: true; db: SupabaseClient; userId: string; squadId: string }
  | { ok: false; message: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in again to save this note." };
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db.from("squad_players").select("id,squad_id").eq("id", playerId).eq("user_id", user.id).maybeSingle();
  if (error || !data) return { ok: false, message: "The player could not be found." };
  if (!data.squad_id) return { ok: false, message: "Assign the player to a Team before adding notes." };
  return { ok: true, db, userId: user.id, squadId: data.squad_id as string };
}

function visibility(formData: FormData): PlayerNoteVisibility {
  return formData.get("conversationEligible") === "on" ? "conversation_eligible" : "internal";
}

function revalidatePlayer(playerId: string) {
  revalidatePath(`/squad/players/${playerId}`);
  revalidatePath(`/squad/players/${playerId}/report`);
}

function success(message: string): PlayerNoteActionState {
  return { ok: true, message, completedAt: Date.now() };
}

function failure(message: string): PlayerNoteActionState {
  return { ok: false, message };
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function today() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function message(formData: FormData, english: string, german: string) {
  return formData.get("locale") === "de" ? german : english;
}
