"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, CheckSquare, LoaderCircle, RotateCcw, Star, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogPortal } from "@/components/shared/dialog-portal";
import { useDialogFocus } from "@/components/shared/use-dialog-focus";
import { DrillCard } from "@/components/drills/drill-card";
import {
  bulkArchiveDrills,
  bulkMoveDrillsToTrash,
  bulkRestoreDrills,
  bulkSetDrillFavorite,
  bulkUpdateDrillTags,
  type DrillBulkAction,
  type DrillBulkActionResult
} from "@/lib/drills/actions";
import { normalizeBulkDrillTags } from "@/lib/drills/bulk";
import type { DrillWithLibraryData, DrillFilters } from "@/lib/drills/queries";
import type { Locale } from "@/lib/i18n";

type DrillLibraryBulkManagerProps = {
  drills: DrillWithLibraryData[];
  view: DrillFilters["view"];
  locale: Locale;
  libraryTags: string[];
  emptyState: ReactNode;
};

type SelectedDrill = {
  id: string;
  title: string;
  isFavorite: boolean;
  tags: string[];
  archivedAt?: string;
  deletedAt?: string;
};

type Feedback = { kind: "success" | "error"; message: string };

export function DrillLibraryBulkManager({ drills, view, locale, libraryTags, emptyState }: DrillLibraryBulkManagerProps) {
  const copy = bulkCopy[locale];
  const router = useRouter();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectedDrill>>(new Map());
  const [dialog, setDialog] = useState<"tags" | "delete" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();
  const masterRef = useRef<HTMLInputElement>(null);
  const visibleIds = useMemo(() => drills.map((drill) => drill.id), [drills]);
  const selectedDrills = useMemo(() => [...selected.values()], [selected]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));
  const hasArchivable = selectedDrills.some((drill) => !drill.deletedAt && !drill.archivedAt);
  const hasRestorable = selectedDrills.some((drill) => Boolean(drill.deletedAt || drill.archivedAt));
  const hasFavoriteCandidate = selectedDrills.some((drill) => !drill.deletedAt && !drill.archivedAt && !drill.isFavorite);
  const hasUnfavoriteCandidate = selectedDrills.some((drill) => !drill.deletedAt && !drill.archivedAt && drill.isFavorite);
  const hasEditableTags = selectedDrills.some((drill) => !drill.deletedAt && !drill.archivedAt);
  const hasTrashCandidate = selectedDrills.some((drill) => !drill.deletedAt);
  const availableTags = useMemo(
    () => normalizeBulkDrillTags([...libraryTags, ...drills.flatMap((drill) => drill.tags), ...selectedDrills.flatMap((drill) => drill.tags)]).sort((a, b) => a.localeCompare(b)),
    [drills, libraryTags, selectedDrills]
  );
  const selectedMetadataKey = useMemo(
    () => drills.map((drill) => `${drill.id}:${drill.isFavorite}:${drill.archivedAt ?? ""}:${drill.deletedAt ?? ""}:${drill.tags.join("\u0001")}`).join("\u0002"),
    [drills]
  );

  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    setSelected((current) => {
      if (!current.size) return current;
      const next = new Map(current);
      let changed = false;
      for (const drill of drills) {
        if (!next.has(drill.id)) continue;
        next.set(drill.id, selectedDrill(drill));
        changed = true;
      }
      return changed ? next : current;
    });
  }, [drills, selectedMetadataKey]);

  useEffect(() => {
    if (!selectionMode || dialog) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelected(new Map());
      setSelectionMode(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [dialog, selectionMode]);

  function toggleDrill(drill: DrillWithLibraryData) {
    setSelectionMode(true);
    setFeedback(undefined);
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(drill.id)) next.delete(drill.id);
      else next.set(drill.id, selectedDrill(drill));
      return next;
    });
  }

  function selectAllVisible() {
    setSelectionMode(true);
    setSelected((current) => {
      const next = new Map(current);
      drills.forEach((drill) => next.set(drill.id, selectedDrill(drill)));
      return next;
    });
  }

  function deselectVisible() {
    setSelected((current) => {
      const next = new Map(current);
      visibleIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  function clearSelection() {
    setDialog(null);
    setSelected(new Map());
    setSelectionMode(false);
  }

  function runBulkAction(action: DrillBulkAction, tags: string[] = []) {
    const drillIds = [...selected.keys()];
    if (!drillIds.length || isPending) return;
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const result = await executeBulkAction(action, drillIds, tags);
        handleResult(result, tags);
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : copy.genericError });
      }
    });
  }

  function handleResult(result: DrillBulkActionResult, tags: string[]) {
    const message = resultMessage(result, tags, locale);
    setFeedback({ kind: result.ok && !result.failedIds.length ? "success" : "error", message });
    setDialog(null);
    if (result.ok && !result.failedIds.length) {
      setSelected(new Map());
      setSelectionMode(false);
    } else if (result.affectedIds.length) {
      const failed = new Set(result.failedIds);
      setSelected((current) => new Map([...current].filter(([id]) => failed.has(id))));
    }
    if (result.affectedIds.length) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-board-line bg-white p-3 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-board-navy">{copy.manage}</p>
            <p className="text-xs font-semibold text-slate-500">{copy.visibleCount(drills.length)}</p>
          </div>
          {selectionMode ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="h-9 px-3" onClick={selectAllVisible} disabled={!drills.length || allVisibleSelected || isPending}>
                {copy.selectAllVisible}
              </Button>
              <Button type="button" variant="ghost" className="h-9 px-3" onClick={clearSelection} disabled={isPending}>
                {copy.clearSelection}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => setSelectionMode(true)} disabled={!drills.length}>
              <CheckSquare className="h-4 w-4" />
              {copy.select}
            </Button>
          )}
        </div>
        {selectionMode ? (
          <div className="mt-3 flex flex-col gap-2 rounded-md bg-board-paper p-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold text-board-navy">
              <input
                ref={masterRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => event.target.checked ? selectAllVisible() : deselectVisible()}
                disabled={!drills.length || isPending}
                aria-label={copy.selectAllVisible}
                className="h-5 w-5 rounded border-slate-300 text-board-green focus:ring-board-green"
              />
              {copy.selected(selected.size)}
            </label>
            <p className="text-xs font-semibold text-slate-500">{copy.selectionHelp(drills.length)}</p>
          </div>
        ) : null}
      </div>

      {feedback ? (
        <p className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.kind === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`} role="status">
          {feedback.message}
        </p>
      ) : null}

      {drills.length ? (
        <section className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5 ${selectionMode ? "pb-52 sm:pb-28" : ""}`}>
          {drills.map((drill) => (
            <DrillCard
              key={drill.id}
              drill={drill}
              view={view}
              selectionMode={selectionMode}
              selected={selected.has(drill.id)}
              onSelectionToggle={() => toggleDrill(drill)}
              selectionLabel={copy.selectDrill(drill.title)}
            />
          ))}
        </section>
      ) : emptyState}

      {selectionMode && selected.size ? (
        <div className="fixed inset-x-3 bottom-3 z-[70] lg:left-[calc(var(--app-sidebar-width)+0.75rem)]">
          <div className="mx-auto flex max-h-[45dvh] max-w-6xl flex-col gap-3 overflow-y-auto rounded-lg border border-board-line bg-white/95 p-3 shadow-[0_12px_40px_rgba(15,23,42,0.22)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="shrink-0 text-sm font-bold text-board-navy" aria-live="polite">{copy.selected(selected.size)}</p>
            <div className="flex flex-wrap items-center gap-2">
              {hasArchivable ? <BulkButton label={copy.archive} icon={<Archive className="h-4 w-4" />} disabled={isPending} onClick={() => runBulkAction("archive")} /> : null}
              {hasRestorable ? <BulkButton label={copy.restore} icon={<RotateCcw className="h-4 w-4" />} disabled={isPending} onClick={() => runBulkAction("restore")} /> : null}
              {hasFavoriteCandidate ? <BulkButton label={copy.addFavorites} icon={<Star className="h-4 w-4" />} disabled={isPending} onClick={() => runBulkAction("favorite")} /> : null}
              {hasUnfavoriteCandidate ? <BulkButton label={copy.removeFavorites} icon={<Star className="h-4 w-4 fill-board-green text-board-green" />} disabled={isPending} onClick={() => runBulkAction("unfavorite")} /> : null}
              {hasEditableTags ? <BulkButton label={copy.tags} icon={<Tags className="h-4 w-4" />} disabled={isPending} onClick={() => setDialog("tags")} /> : null}
              {hasTrashCandidate ? (
                <Button type="button" variant="danger" className="h-9 px-3" disabled={isPending} onClick={() => setDialog("delete")}>
                  <Trash2 className="h-4 w-4" />{copy.delete}
                </Button>
              ) : null}
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={clearSelection} disabled={isPending} aria-label={copy.clearSelection} title={copy.clearSelection}>
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog === "tags" ? (
        <BulkTagsDialog
          locale={locale}
          count={selected.size}
          availableTags={availableTags}
          selectedDrills={selectedDrills}
          isPending={isPending}
          onClose={() => setDialog(null)}
          onSubmit={(mode, tags) => runBulkAction(mode === "add" ? "add_tags" : "remove_tags", tags)}
        />
      ) : null}
      {dialog === "delete" ? (
        <BulkDeleteDialog locale={locale} count={selected.size} isPending={isPending} onClose={() => setDialog(null)} onConfirm={() => runBulkAction("trash")} />
      ) : null}
    </div>
  );
}

function BulkButton({ label, icon, disabled, onClick }: { label: string; icon: ReactNode; disabled: boolean; onClick: () => void }) {
  return <Button type="button" variant="secondary" className="h-9 px-3" disabled={disabled} onClick={onClick}>{icon}{label}</Button>;
}

function BulkTagsDialog({ locale, count, availableTags, selectedDrills, isPending, onClose, onSubmit }: {
  locale: Locale;
  count: number;
  availableTags: string[];
  selectedDrills: SelectedDrill[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (mode: "add" | "remove", tags: string[]) => void;
}) {
  const copy = bulkCopy[locale];
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [customTags, setCustomTags] = useState("");
  const dialogRef = useDialogFocus(true, () => { if (!isPending) onClose(); });
  const removableTags = useMemo(
    () => normalizeBulkDrillTags(selectedDrills.flatMap((drill) => drill.tags)).sort((a, b) => a.localeCompare(b)),
    [selectedDrills]
  );
  const options = mode === "add" ? availableTags : removableTags;
  const submittedTags = normalizeBulkDrillTags([...chosen, ...(mode === "add" ? customTags.split(",") : [])]);

  function choose(nextMode: "add" | "remove") {
    setMode(nextMode);
    setChosen(new Set());
    setCustomTags("");
  }

  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[var(--app-modal-z)] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bulk-drill-tags-title" onMouseDown={(event) => { if (event.currentTarget === event.target && !isPending) onClose(); }}>
        <div ref={dialogRef} tabIndex={-1} className="app-dialog-panel max-h-[min(90dvh,42rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="bulk-drill-tags-title" className="text-xl font-bold text-board-navy">{copy.manageTags}</h2>
              <p className="mt-1 text-sm text-slate-600">{copy.tagDialogHelp(count)}</p>
            </div>
            <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose} disabled={isPending} aria-label={copy.close}><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-md bg-slate-100 p-1" role="group" aria-label={copy.tagAction}>
            <button type="button" aria-pressed={mode === "add"} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${mode === "add" ? "bg-white text-board-navy shadow-sm" : "text-slate-600"}`} onClick={() => choose("add")}>{copy.addTags}</button>
            <button type="button" aria-pressed={mode === "remove"} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${mode === "remove" ? "bg-white text-board-navy shadow-sm" : "text-slate-600"}`} onClick={() => choose("remove")}>{copy.removeTags}</button>
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-bold text-board-navy">{mode === "add" ? copy.chooseTags : copy.chooseTagsToRemove}</legend>
            {options.length ? (
              <div className="mt-2 flex max-h-52 flex-wrap gap-2 overflow-y-auto rounded-md border border-board-line p-3">
                {options.map((tag) => (
                  <label key={tag} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-board-line bg-white px-3 py-2 text-sm font-semibold text-board-navy has-[:checked]:border-board-green has-[:checked]:bg-green-50">
                    <input type="checkbox" checked={chosen.has(tag)} onChange={() => setChosen((current) => { const next = new Set(current); if (next.has(tag)) next.delete(tag); else next.add(tag); return next; })} className="h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" />
                    {tag}
                  </label>
                ))}
              </div>
            ) : <p className="mt-2 rounded-md border border-dashed border-board-line p-3 text-sm text-slate-500">{copy.noTags}</p>}
          </fieldset>
          {mode === "add" ? (
            <label className="mt-4 block">
              <span className="text-sm font-bold text-board-navy">{copy.newTags}</span>
              <input value={customTags} onChange={(event) => setCustomTags(event.target.value)} placeholder={copy.newTagsPlaceholder} className="mt-1 h-11 w-full rounded-md border border-board-line px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
              <span className="mt-1 block text-xs text-slate-500">{copy.newTagsHelp}</span>
            </label>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>{copy.cancel}</Button>
            <Button type="button" onClick={() => onSubmit(mode, submittedTags)} disabled={isPending || !submittedTags.length}>
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
              {mode === "add" ? copy.addTags : copy.removeTags}
            </Button>
          </div>
        </div>
      </div>
    </DialogPortal>
  );
}

function BulkDeleteDialog({ locale, count, isPending, onClose, onConfirm }: { locale: Locale; count: number; isPending: boolean; onClose: () => void; onConfirm: () => void }) {
  const copy = bulkCopy[locale];
  const dialogRef = useDialogFocus(true, () => { if (!isPending) onClose(); });
  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[var(--app-modal-z)] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bulk-drill-delete-title" onMouseDown={(event) => { if (event.currentTarget === event.target && !isPending) onClose(); }}>
        <div ref={dialogRef} tabIndex={-1} className="app-dialog-panel w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="bulk-drill-delete-title" className="text-xl font-bold text-board-navy">{copy.deleteTitle(count)}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy.deleteHelp}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{copy.deleteHistoryHelp}</p>
            </div>
            <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose} disabled={isPending} aria-label={copy.close}><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>{copy.cancel}</Button>
            <Button type="button" variant="danger" onClick={onConfirm} disabled={isPending}>
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {copy.deleteCount(count)}
            </Button>
          </div>
        </div>
      </div>
    </DialogPortal>
  );
}

async function executeBulkAction(action: DrillBulkAction, drillIds: string[], tags: string[]) {
  if (action === "archive") return bulkArchiveDrills({ drillIds });
  if (action === "restore") return bulkRestoreDrills({ drillIds });
  if (action === "favorite" || action === "unfavorite") return bulkSetDrillFavorite({ drillIds, favorite: action === "favorite" });
  if (action === "add_tags" || action === "remove_tags") return bulkUpdateDrillTags({ drillIds, tags, mode: action === "add_tags" ? "add" : "remove" });
  return bulkMoveDrillsToTrash({ drillIds });
}

function selectedDrill(drill: DrillWithLibraryData): SelectedDrill {
  return {
    id: drill.id,
    title: drill.title,
    isFavorite: drill.isFavorite,
    tags: drill.tags,
    archivedAt: drill.archivedAt,
    deletedAt: drill.deletedAt
  };
}

function resultMessage(result: DrillBulkActionResult, tags: string[], locale: Locale) {
  const count = result.affectedIds.length;
  const failed = result.failedIds.length;
  const unchanged = result.unchangedCount;
  const tagLabel = tags.length === 1 ? `“${tags[0]}”` : `${tags.length} ${locale === "de" ? "Tags" : "tags"}`;
  const base = locale === "de"
    ? result.action === "archive" ? `${count} ${count === 1 ? "Übung archiviert" : "Übungen archiviert"}`
      : result.action === "restore" ? `${count} ${count === 1 ? "Übung wiederhergestellt" : "Übungen wiederhergestellt"}`
      : result.action === "favorite" ? `${count} ${count === 1 ? "Übung zu Favoriten hinzugefügt" : "Übungen zu Favoriten hinzugefügt"}`
      : result.action === "unfavorite" ? `${count} ${count === 1 ? "Übung aus Favoriten entfernt" : "Übungen aus Favoriten entfernt"}`
      : result.action === "add_tags" ? `${tagLabel} zu ${count} ${count === 1 ? "Übung" : "Übungen"} hinzugefügt`
      : result.action === "remove_tags" ? `${tagLabel} von ${count} ${count === 1 ? "Übung" : "Übungen"} entfernt`
      : `${count} ${count === 1 ? "Übung in den Papierkorb verschoben" : "Übungen in den Papierkorb verschoben"}`
    : result.action === "archive" ? `${count} drill${count === 1 ? "" : "s"} archived`
      : result.action === "restore" ? `${count} drill${count === 1 ? "" : "s"} restored`
      : result.action === "favorite" ? `${count} drill${count === 1 ? "" : "s"} added to favorites`
      : result.action === "unfavorite" ? `${count} drill${count === 1 ? "" : "s"} removed from favorites`
      : result.action === "add_tags" ? `${tagLabel} added to ${count} drill${count === 1 ? "" : "s"}`
      : result.action === "remove_tags" ? `${tagLabel} removed from ${count} drill${count === 1 ? "" : "s"}`
      : `${count} drill${count === 1 ? "" : "s"} moved to Trash`;
  const details = [
    unchanged ? locale === "de" ? `${unchanged} nicht anwendbar oder bereits aktuell` : `${unchanged} not applicable or already up to date` : "",
    failed ? locale === "de" ? `${failed} fehlgeschlagen` : `${failed} failed` : "",
    result.error ?? ""
  ].filter(Boolean);
  return `${base}.${details.length ? ` ${details.join(". ")}.` : ""}`;
}

const bulkCopy = {
  en: {
    manage: "Bulk management",
    visibleCount: (count: number) => `${count} visible drill${count === 1 ? "" : "s"} in the current filter`,
    select: "Select",
    selectDrill: (title: string) => `Select Drill: ${title}`,
    selectAllVisible: "Select all visible",
    clearSelection: "Clear selection",
    selected: (count: number) => `${count} selected`,
    selectionHelp: (count: number) => `Select all visible means the ${count} drills currently shown by your filters. Selection stays when filters change.`,
    archive: "Archive",
    restore: "Restore",
    addFavorites: "Add to favorites",
    removeFavorites: "Remove from favorites",
    tags: "Tags",
    delete: "Delete",
    manageTags: "Manage tags",
    tagDialogHelp: (count: number) => `Update tags for ${count} selected drill${count === 1 ? "" : "s"}. Existing unrelated tags stay unchanged.`,
    tagAction: "Tag action",
    addTags: "Add tags",
    removeTags: "Remove tags",
    chooseTags: "Choose existing tags",
    chooseTagsToRemove: "Choose tags to remove",
    noTags: "No matching tags are available yet.",
    newTags: "New tags",
    newTagsPlaceholder: "Transition, finishing",
    newTagsHelp: "Separate multiple tags with commas.",
    deleteTitle: (count: number) => `Delete ${count} drill${count === 1 ? "" : "s"}?`,
    deleteHelp: "These drills will be moved to Trash and removed from the normal Drill Library. You can restore them later.",
    deleteHistoryHelp: "Historical Training and Session data remains intact. Uploaded images are retained while the drills are restorable.",
    deleteCount: (count: number) => `Delete ${count} drill${count === 1 ? "" : "s"}`,
    cancel: "Cancel",
    close: "Close",
    genericError: "The bulk action could not be completed."
  },
  de: {
    manage: "Mehrfachverwaltung",
    visibleCount: (count: number) => `${count} sichtbare ${count === 1 ? "Übung" : "Übungen"} im aktuellen Filter`,
    select: "Auswählen",
    selectDrill: (title: string) => `Übung auswählen: ${title}`,
    selectAllVisible: "Alle sichtbaren auswählen",
    clearSelection: "Auswahl aufheben",
    selected: (count: number) => `${count} ausgewählt`,
    selectionHelp: (count: number) => `Alle sichtbaren meint die ${count} aktuell gefilterten Übungen. Die Auswahl bleibt bei Filterwechseln erhalten.`,
    archive: "Archivieren",
    restore: "Wiederherstellen",
    addFavorites: "Zu Favoriten hinzufügen",
    removeFavorites: "Aus Favoriten entfernen",
    tags: "Tags",
    delete: "Löschen",
    manageTags: "Tags verwalten",
    tagDialogHelp: (count: number) => `Tags für ${count} ausgewählte ${count === 1 ? "Übung" : "Übungen"} bearbeiten. Andere bestehende Tags bleiben erhalten.`,
    tagAction: "Tag-Aktion",
    addTags: "Tags hinzufügen",
    removeTags: "Tags entfernen",
    chooseTags: "Bestehende Tags auswählen",
    chooseTagsToRemove: "Zu entfernende Tags auswählen",
    noTags: "Noch keine passenden Tags verfügbar.",
    newTags: "Neue Tags",
    newTagsPlaceholder: "Umschalten, Torabschluss",
    newTagsHelp: "Mehrere Tags durch Kommas trennen.",
    deleteTitle: (count: number) => `${count} ${count === 1 ? "Übung" : "Übungen"} löschen?`,
    deleteHelp: "Diese Übungen werden in den Papierkorb verschoben und aus der normalen Übungsbibliothek entfernt. Du kannst sie später wiederherstellen.",
    deleteHistoryHelp: "Historische Trainings- und Session-Daten bleiben erhalten. Hochgeladene Bilder bleiben verfügbar, solange die Übungen wiederherstellbar sind.",
    deleteCount: (count: number) => `${count} ${count === 1 ? "Übung" : "Übungen"} löschen`,
    cancel: "Abbrechen",
    close: "Schließen",
    genericError: "Die Mehrfachaktion konnte nicht abgeschlossen werden."
  }
} as const;
