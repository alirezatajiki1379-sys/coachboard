"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileText, Pin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createPlayerNote,
  deletePlayerNote,
  updatePlayerNote,
  type PlayerNoteActionState
} from "@/lib/squad/player-note-actions";
import { formatDate, type Locale } from "@/lib/i18n";
import type { PlayerNote } from "@/types/domain";

const initialPlayerNoteActionState: PlayerNoteActionState = { ok: true, message: "" };

const copy = {
  en: {
    quickTitle: "Quick note",
    quickHelp: "Capture a useful player note without leaving the Overview.",
    placeholder: "Add a short observation or conversation note...",
    eligible: "Can be used in Player Conversation",
    pinned: "Pin note",
    add: "Add note",
    latest: "Recent notes",
    all: "View all notes",
    emptyRecent: "No general player notes yet.",
    sectionTitle: "General player notes",
    sectionHelp: "Separate from Training notes, development observations and medical notes.",
    date: "Date",
    save: "Save changes",
    edit: "Edit",
    cancel: "Cancel",
    remove: "Delete",
    deleteConfirm: "Delete this general player note?",
    internal: "Internal",
    conversation: "Conversation eligible",
    noNotes: "No general player notes yet. Add the first note above."
  },
  de: {
    quickTitle: "Schnelle Notiz",
    quickHelp: "Halte eine hilfreiche Spielernotiz direkt in der Übersicht fest.",
    placeholder: "Kurze Beobachtung oder Gesprächsnotiz hinzufügen...",
    eligible: "Für Spielergespräch geeignet",
    pinned: "Notiz anheften",
    add: "Notiz hinzufügen",
    latest: "Letzte Notizen",
    all: "Alle Notizen ansehen",
    emptyRecent: "Noch keine allgemeinen Spielernotizen.",
    sectionTitle: "Allgemeine Spielernotizen",
    sectionHelp: "Getrennt von Trainingsnotizen, Entwicklungsbeobachtungen und medizinischen Notizen.",
    date: "Datum",
    save: "Änderungen speichern",
    edit: "Bearbeiten",
    cancel: "Abbrechen",
    remove: "Löschen",
    deleteConfirm: "Diese allgemeine Spielernotiz löschen?",
    internal: "Intern",
    conversation: "Für Gespräch geeignet",
    noNotes: "Noch keine allgemeinen Spielernotizen. Füge oben die erste Notiz hinzu."
  }
} as const;

export function QuickPlayerNoteCard({ playerId, notes, locale }: { playerId: string; notes: PlayerNote[]; locale: Locale }) {
  const text = copy[locale];
  const recentNotes = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(createPlayerNote, initialPlayerNoteActionState);
  useEffect(() => {
    if (state.ok && state.completedAt) formRef.current?.reset();
  }, [state.completedAt, state.ok]);

  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-green-50 p-2 text-board-green"><FileText className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-bold text-board-navy">{text.quickTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{text.quickHelp}</p>
        </div>
      </div>
      <form ref={formRef} action={action} className="mt-4 space-y-3">
        <input type="hidden" name="playerId" value={playerId} />
        <input type="hidden" name="locale" value={locale} />
        <textarea name="note" required maxLength={2000} rows={3} placeholder={text.placeholder} className="w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
        <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" name="conversationEligible" className="h-4 w-4 accent-board-green" />
          {text.eligible}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={text.add} icon={<Plus className="h-4 w-4" />} />
          <ActionMessage state={state} />
        </div>
      </form>
      <div className="mt-5 border-t border-board-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{text.latest}</h3>
          <Link href={`/squad/players/${playerId}?tab=notes`} className="text-sm font-bold text-board-green underline-offset-4 hover:underline">{text.all}</Link>
        </div>
        <div className="mt-3 space-y-2">
          {recentNotes.length ? recentNotes.map((note) => <PlayerNoteSummary key={note.id} note={note} locale={locale} />) : <p className="text-sm text-slate-500">{text.emptyRecent}</p>}
        </div>
      </div>
    </section>
  );
}

export function GeneralPlayerNotes({ playerId, notes, locale }: { playerId: string; notes: PlayerNote[]; locale: Locale }) {
  const text = copy[locale];
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft lg:col-span-2">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-green-50 p-2 text-board-green"><FileText className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-bold text-board-navy">{text.sectionTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{text.sectionHelp}</p>
        </div>
      </div>
      <GeneralNoteCreateForm playerId={playerId} locale={locale} />
      <div className="mt-5 space-y-3 border-t border-board-line pt-5">
        {notes.length ? notes.map((note) => <EditablePlayerNote key={note.id} note={note} locale={locale} />) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-500">{text.noNotes}</p>}
      </div>
    </section>
  );
}

function GeneralNoteCreateForm({ playerId, locale }: { playerId: string; locale: Locale }) {
  const text = copy[locale];
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(createPlayerNote, initialPlayerNoteActionState);
  useEffect(() => {
    if (state.ok && state.completedAt) formRef.current?.reset();
  }, [state.completedAt, state.ok]);
  return (
    <form ref={formRef} action={action} className="mt-5 grid gap-3 md:grid-cols-[10rem_1fr]">
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="locale" value={locale} />
      <label className="text-xs font-bold text-slate-600">{text.date}<input type="date" name="noteDate" className="mt-1 h-10 w-full rounded-md border border-board-line px-3 text-sm" /></label>
      <label className="text-xs font-bold text-slate-600 md:row-span-2">{text.quickTitle}<textarea name="note" required maxLength={2000} rows={4} placeholder={text.placeholder} className="mt-1 w-full rounded-md border border-board-line px-3 py-2 text-sm" /></label>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="conversationEligible" className="h-4 w-4 accent-board-green" />{text.eligible}</label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="pinned" className="h-4 w-4 accent-board-green" />{text.pinned}</label>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2"><SubmitButton label={text.add} icon={<Plus className="h-4 w-4" />} /><ActionMessage state={state} /></div>
    </form>
  );
}

function EditablePlayerNote({ note, locale }: { note: PlayerNote; locale: Locale }) {
  const text = copy[locale];
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updatePlayerNote, initialPlayerNoteActionState);
  const [deleteState, deleteAction] = useActionState(deletePlayerNote, initialPlayerNoteActionState);
  useEffect(() => {
    if (updateState.ok && updateState.completedAt) setEditing(false);
  }, [updateState.completedAt, updateState.ok]);
  return (
    <article className="rounded-md border border-board-line bg-slate-50 p-4">
      {editing ? (
        <form action={updateAction} className="grid gap-3 md:grid-cols-[10rem_1fr]">
          <input type="hidden" name="playerId" value={note.playerId} /><input type="hidden" name="noteId" value={note.id} /><input type="hidden" name="locale" value={locale} />
          <label className="text-xs font-bold text-slate-600">{text.date}<input type="date" name="noteDate" required defaultValue={note.noteDate} className="mt-1 h-10 w-full rounded-md border border-board-line px-3 text-sm" /></label>
          <textarea name="note" required maxLength={2000} rows={3} defaultValue={note.note} className="w-full rounded-md border border-board-line px-3 py-2 text-sm" />
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="conversationEligible" defaultChecked={note.visibility === "conversation_eligible"} className="h-4 w-4 accent-board-green" />{text.eligible}</label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="pinned" defaultChecked={note.pinned} className="h-4 w-4 accent-board-green" />{text.pinned}</label>
          </div>
          <div className="flex flex-wrap items-center gap-2"><SubmitButton label={text.save} /><Button type="button" variant="ghost" onClick={() => setEditing(false)}>{text.cancel}</Button><ActionMessage state={updateState} /></div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                {note.pinned ? <Pin className="h-3.5 w-3.5 text-board-green" aria-label={text.pinned} /> : null}
                <span>{formatDate(note.noteDate, locale)}</span>
                <span className={note.visibility === "conversation_eligible" ? "text-green-700" : "text-slate-500"}>{note.visibility === "conversation_eligible" ? text.conversation : text.internal}</span>
              </div>
              <p translate="no" className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{note.note}</p>
            </div>
            <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => setEditing(true)}>{text.edit}</Button>
          </div>
          <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(text.deleteConfirm)) event.preventDefault(); }} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="playerId" value={note.playerId} /><input type="hidden" name="noteId" value={note.id} /><input type="hidden" name="locale" value={locale} />
            <SubmitButton label={text.remove} variant="danger" icon={<Trash2 className="h-4 w-4" />} />
            <ActionMessage state={deleteState} />
          </form>
        </>
      )}
    </article>
  );
}

function PlayerNoteSummary({ note, locale }: { note: PlayerNote; locale: Locale }) {
  const text = copy[locale];
  return (
    <article className="rounded-md bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
        {note.pinned ? <Pin className="h-3.5 w-3.5 text-board-green" aria-label={text.pinned} /> : null}
        <span>{noteTimestamp(note, locale)}</span>
        <span>{note.visibility === "conversation_eligible" ? text.conversation : text.internal}</span>
      </div>
      <p translate="no" className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-slate-700">{note.note}</p>
    </article>
  );
}

function ActionMessage({ state }: { state: { ok: boolean; message: string } }) {
  return state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm font-semibold ${state.ok ? "text-green-700" : "text-red-700"}`}>{state.message}</p> : null;
}

function SubmitButton({ label, icon, variant = "primary" }: { label: string; icon?: React.ReactNode; variant?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} disabled={pending}>{icon}{pending ? "..." : label}</Button>;
}

function noteTimestamp(note: PlayerNote, locale: Locale) {
  const time = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(note.createdAt));
  return `${formatDate(note.noteDate, locale)} · ${time}`;
}
