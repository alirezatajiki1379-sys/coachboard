"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { ageGroups, drillTypes, mainFocuses, trainingBlocks } from "@/config/options";
import { Button } from "@/components/ui/button";
import { DialogPortal } from "@/components/shared/dialog-portal";
import { useDialogFocus } from "@/components/shared/use-dialog-focus";
import { useSystemText } from "@/components/i18n/use-system-text";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { DrillMaterialLabel } from "@/components/drills/drill-material-label";
import { drillMatchesAgeFilter } from "@/lib/drills/age-suitability";
import { trainingFocusLabel } from "@/lib/i18n/training-labels";
import type { Drill } from "@/types/domain";

export function SessionDrillPicker({ drills, target, sections, counts, onTargetChange, onAdd, onClose }: {
  drills: Array<Drill & { isSessionSnapshot?: boolean }>;
  target: string;
  sections: Array<{ key: string; label: string }>;
  counts: Map<string, number>;
  onTargetChange: (key: string) => void;
  onAdd: (drill: Drill, section: string) => void;
  onClose: () => void;
}) {
  const ui = useSystemText();
  const locale = useOptionalI18n()?.locale ?? "en";
  const dialogRef = useDialogFocus(true, onClose);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ age: "", focus: "", block: "", type: "" });
  const [addedTitle, setAddedTitle] = useState("");
  useEffect(() => { searchRef.current?.focus(); }, []);
  const filtered = useMemo(() => drills.filter((drill) => !drill.isSessionSnapshot &&
    (!search || drill.title.toLowerCase().includes(search.toLowerCase())) &&
    (!filters.age || drillMatchesAgeFilter(drill, filters.age)) &&
    (!filters.focus || drill.mainFocus === filters.focus) &&
    (!filters.block || drill.trainingBlocks.some((block) => block === filters.block)) &&
    (!filters.type || drill.drillType === filters.type)), [drills, search, filters]);
  return <DialogPortal>
    <div role="dialog" aria-modal="true" aria-labelledby="session-drill-picker-title" className="fixed inset-0 z-[var(--app-modal-z)] flex items-end justify-center bg-slate-950/45 p-2 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} className="app-dialog-panel flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl outline-none">
        <div className="shrink-0 space-y-3 border-b border-board-line p-3 sm:p-5">
          <div className="flex items-center justify-between gap-3"><h2 id="session-drill-picker-title" className="text-lg font-bold text-board-navy">{ui("Add Drill")}</h2><button type="button" onClick={onClose} aria-label={ui("Close")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          <label className="block text-sm font-semibold">{ui("Training section")}<select aria-label={ui("Training section")} value={target} onChange={(event) => onTargetChange(event.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-md border border-board-line px-2">{sections.map((section) => <option key={section.key} value={section.key} translate="no">{section.label}</option>)}</select></label>
          <label className="relative block"><span className="sr-only">{ui("Search drills")}</span><Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui("Search drills")} className="h-11 w-full min-w-0 rounded-md border border-board-line pl-10 pr-3" /></label>
          <details><summary className="cursor-pointer py-2 text-sm font-semibold">{ui("Filters")}</summary><div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {([{ key: "age", label: "Age group", options: ageGroups }, { key: "focus", label: "Focus", options: mainFocuses }, { key: "block", label: "Block", options: trainingBlocks }, { key: "type", label: "Drill type", options: drillTypes }] as const).map(({ key, label, options }) => <label key={key} className="min-w-0 text-xs font-semibold">{ui(label)}<select aria-label={ui(label)} value={filters[key]} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 h-11 w-full min-w-0 rounded-md border border-board-line px-2"><option value="">{ui("Any")}</option>{options.map((value) => <option key={value} value={value}>{ui(value)}</option>)}</select></label>)}
          </div></details>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:px-5">
          {filtered.length ? <ul className="divide-y divide-board-line">{filtered.map((drill) => <li key={drill.id} className="min-w-0 space-y-2 py-3">
            <h3 translate="no" className="break-words font-bold text-board-navy">{drill.title}</h3>
            <p className="text-sm text-slate-600"><span translate="no">{trainingFocusLabel(drill.mainFocus, locale)}</span> · {drill.durationMinutes} {ui("min")} · {drill.minPlayers}-{drill.maxPlayers} {ui("Players")}</p>
            {drill.materials.length ? <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">{drill.materials.map((material, index) => <li key={index} className="min-w-0 max-w-full break-words"><DrillMaterialLabel material={material} locale={locale} /></li>)}</ul> : null}
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{counts.get(drill.id) ? ui("Already {count} times in plan", { count: counts.get(drill.id)! }) : null}</span><Button type="button" variant={counts.has(drill.id) ? "secondary" : "primary"} onClick={() => { onAdd(drill, target); setAddedTitle(drill.title); }}><Plus className="h-4 w-4" />{ui(counts.has(drill.id) ? "Add again" : "Add")}</Button></div>
          </li>)}</ul> : <p className="py-5 text-sm text-slate-500">{ui("No drills match these filters. Clear the filters or create a drill in the library first.")}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-board-line p-3"><p role="status" className="min-w-0 break-words text-xs text-board-green">{addedTitle ? <>{ui("Added")}: <span translate="no">{addedTitle}</span></> : null}</p><Button type="button" variant="secondary" onClick={onClose}>{ui("Done")}</Button></div>
      </div>
    </div>
  </DialogPortal>;
}
