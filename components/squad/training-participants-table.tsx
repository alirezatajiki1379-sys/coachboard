"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, CheckSquare, Columns3, Search, Settings2, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { attendanceDisplayName, finalStatusLabel, plannedReasonLabel, plannedStatusLabel, reliabilityMalus } from "@/lib/squad/attendance-format";
import { effectiveParticipantPositionFamily, effectiveParticipantPositionLabel } from "@/lib/squad/attendance-utils";
import { calculateAge } from "@/lib/squad/format";
import { formatPositionLabel } from "@/lib/squad/positions";
import { cn } from "@/lib/utils";
import type { SquadAttendanceEntry } from "@/types/domain";

type ParticipantColumnId =
  | "player"
  | "position"
  | "planned"
  | "reason"
  | "group"
  | "age"
  | "availability"
  | "actual"
  | "rating"
  | "malus"
  | "secondaryPositions"
  | "medical"
  | "squadStatus"
  | "actions";

type ParticipantColumn = {
  id: ParticipantColumnId;
  label: string;
  optional?: boolean;
  required?: boolean;
};

const preferenceKey = "coachboard:training-participants:columns:v1";

const participantColumns: ParticipantColumn[] = [
  { id: "player", label: "Player", required: true },
  { id: "position", label: "Position" },
  { id: "planned", label: "Planned participation" },
  { id: "reason", label: "Reason", optional: true },
  { id: "group", label: "Group" },
  { id: "age", label: "Age", optional: true },
  { id: "availability", label: "Availability", optional: true },
  { id: "actual", label: "Actual attendance", optional: true },
  { id: "rating", label: "Rating", optional: true },
  { id: "malus", label: "Malus", optional: true },
  { id: "secondaryPositions", label: "Secondary positions", optional: true },
  { id: "medical", label: "Medical availability", optional: true },
  { id: "squadStatus", label: "Squad status", optional: true },
  { id: "actions", label: "Actions" }
];

const defaultVisibleColumns: ParticipantColumnId[] = ["player", "position", "planned", "group", "actions"];
const defaultColumnOrder: ParticipantColumnId[] = participantColumns.map((column) => column.id);
const hiddenOnMobile = new Set<ParticipantColumnId>(["actions"]);

type TrainingParticipantsTableProps = {
  eventId: string;
  attendance: SquadAttendanceEntry[];
  groupLabelsByPlayerId: Array<[string, string[]]>;
  summary: {
    expected: number;
    notExpected: number;
    goalkeepers: number;
    fieldPlayers: number;
    defensive: number;
    midfield: number;
    attacking: number;
    positionMissing: number;
  };
};

export function TrainingParticipantsTable({ eventId, attendance, groupLabelsByPlayerId, summary }: TrainingParticipantsTableProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(64);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ParticipantColumnId[]>(defaultVisibleColumns);
  const [columnOrder, setColumnOrder] = useState<ParticipantColumnId[]>(defaultColumnOrder);
  const [draftVisibleColumns, setDraftVisibleColumns] = useState<ParticipantColumnId[]>(defaultVisibleColumns);
  const [draftColumnOrder, setDraftColumnOrder] = useState<ParticipantColumnId[]>(defaultColumnOrder);
  const groupLabels = useMemo(() => new Map(groupLabelsByPlayerId), [groupLabelsByPlayerId]);
  const visibleSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const shownColumns = useMemo(
    () => columnOrder
      .map((id) => participantColumns.find((column) => column.id === id))
      .filter((column): column is ParticipantColumn => {
        if (!column) return false;
        return Boolean(column.required || visibleSet.has(column.id));
      }),
    [columnOrder, visibleSet]
  );

  const filteredAttendance = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return attendance.filter((entry) => {
      const player = entry.player;
      const labels = player ? groupLabels.get(player.id) ?? [] : [];
      const matchesSearch = !needle || [
        attendanceDisplayName(entry),
        effectiveParticipantPositionLabel(entry),
        player?.secondaryPositions.map(formatPositionLabel).filter(Boolean).join(" "),
        labels.join(" "),
        playerTypeLabel(entry)
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
      if (!matchesSearch) return false;
      if (filter === "expected") return plannedStatusLabel(entry.plannedStatus) === "Expected";
      if (filter === "notExpected") return plannedStatusLabel(entry.plannedStatus) === "Not expected";
      if (filter === "noGroup") return !player || !(groupLabels.get(player.id)?.length);
      if (filter === "exceptional") return Boolean(playerTypeLabel(entry));
      return true;
    });
  }, [attendance, filter, groupLabels, query]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(preferenceKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { visibleColumns?: unknown; columnOrder?: unknown };
      const nextVisible = normalizeColumns(parsed.visibleColumns, defaultVisibleColumns);
      const nextOrder = normalizeColumns(parsed.columnOrder, defaultColumnOrder);
      setVisibleColumns(nextVisible);
      setColumnOrder(nextOrder);
      setDraftVisibleColumns(nextVisible);
      setDraftColumnOrder(nextOrder);
    } catch {
      window.localStorage.removeItem(preferenceKey);
    }
  }, []);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const toolbarElement = toolbar;
    function updateHeight() {
      setToolbarHeight(Math.ceil(toolbarElement.getBoundingClientRect().height));
    }
    updateHeight();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateHeight) : null;
    observer?.observe(toolbarElement);
    window.addEventListener("resize", updateHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setColumnsOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (!columnsOpen) return;
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      setColumnsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [columnsOpen]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => filteredAttendance.some((entry) => entry.id === id)));
  }, [filteredAttendance]);

  function openColumns() {
    if (columnsOpen) {
      setColumnsOpen(false);
      return;
    }
    setDraftVisibleColumns(visibleColumns);
    setDraftColumnOrder(columnOrder);
    setColumnsOpen(true);
  }

  function applyColumns() {
    const nextVisible = normalizeColumns(draftVisibleColumns, defaultVisibleColumns);
    const nextOrder = normalizeColumns(draftColumnOrder, defaultColumnOrder);
    setVisibleColumns(nextVisible);
    setColumnOrder(nextOrder);
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify({ visibleColumns: nextVisible, columnOrder: nextOrder }));
    } catch {
      // The table still works with in-memory preferences if localStorage is unavailable.
    }
    setColumnsOpen(false);
  }

  function resetColumns() {
    setDraftVisibleColumns(defaultVisibleColumns);
    setDraftColumnOrder(defaultColumnOrder);
  }

  function cancelColumns() {
    setDraftVisibleColumns(visibleColumns);
    setDraftColumnOrder(columnOrder);
    setColumnsOpen(false);
  }

  function selectAllVisible() {
    setSelectedIds(filteredAttendance.map((entry) => entry.id));
  }

  function selectAllExpected() {
    setSelectedIds(filteredAttendance.filter((entry) => plannedStatusLabel(entry.plannedStatus) === "Expected").map((entry) => entry.id));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const layoutStyle = {
    "--training-participant-toolbar-height": `${toolbarHeight}px`
  } as CSSProperties;

  const hasFilters = Boolean(query.trim()) || filter !== "all";

  return (
    <div className="space-y-4" style={layoutStyle}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Expected" value={String(summary.expected)} />
        <Metric label="Not expected" value={String(summary.notExpected)} tone={summary.notExpected > 0 ? "warning" : "normal"} />
        <Metric label="Goalkeepers" value={String(summary.goalkeepers)} tone={summary.goalkeepers === 0 ? "warning" : "normal"} />
        <Metric label="Field players" value={String(summary.fieldPlayers)} />
        <Metric label="Position missing" value={String(summary.positionMissing)} tone={summary.positionMissing > 0 ? "warning" : "normal"} />
      </div>
      <p className="text-xs font-semibold text-slate-500">
        Defensive: {summary.defensive} · Midfield: {summary.midfield} · Attacking: {summary.attacking} · Groups: {new Set(groupLabelsByPlayerId.flatMap(([, labels]) => labels)).size} · No group: {attendance.filter((entry) => entry.player && !(groupLabels.get(entry.player.id)?.length)).length}
      </p>

      <div ref={toolbarRef} className="sticky top-0 z-20 rounded-lg border border-board-line bg-white p-3 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-bold text-board-navy">Training participants</h3>
            <p className="text-sm text-slate-600">{filteredAttendance.length} shown · {summary.expected} expected · {summary.notExpected} not expected</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <label className="relative min-w-0 sm:w-64">
              <span className="sr-only">Search participants</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search participants..." className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </label>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-md border border-board-line bg-white px-3 text-sm font-semibold text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
              <option value="all">All</option>
              <option value="expected">Expected</option>
              <option value="notExpected">Not expected</option>
              <option value="noGroup">No group</option>
              <option value="exceptional">Trial / inactive</option>
            </select>
            <div ref={panelRef} className="relative">
              <Button type="button" variant={columnsOpen ? "primary" : "secondary"} className="h-10 px-3" onClick={openColumns} aria-expanded={columnsOpen}>
                <Columns3 className="h-4 w-4" />
                Columns
              </Button>
              {columnsOpen ? (
                <ColumnsPanel
                  visibleColumns={draftVisibleColumns}
                  columnOrder={draftColumnOrder}
                  onVisibleColumnsChange={setDraftVisibleColumns}
                  onColumnOrderChange={setDraftColumnOrder}
                  onApply={applyColumns}
                  onCancel={cancelColumns}
                  onReset={resetColumns}
                />
              ) : null}
            </div>
            <Button type="button" variant={selectionMode ? "secondary" : "ghost"} className="h-10 px-3" onClick={() => setSelectionMode((current) => !current)}>
              <CheckSquare className="h-4 w-4" />
              {selectionMode ? "Selection on" : "Select"}
            </Button>
          </div>
        </div>
        {selectionMode ? (
          <div className="mt-3 flex flex-col gap-2 rounded-md bg-board-paper p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <p className="text-sm font-bold text-board-navy">{selectedIds.length} selected</p>
            <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={selectAllVisible}>Select all visible</Button>
            <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={selectAllExpected}>Select all expected</Button>
            <Button type="button" variant="ghost" className="h-9 px-3 text-xs" onClick={() => setSelectedIds([])}>Clear selection</Button>
            <ButtonLink href={`/trainings/${eventId}/edit`} variant="secondary" className="h-9 px-3 text-xs">Edit participants</ButtonLink>
            <ButtonLink href={`/trainings/${eventId}/check-in`} variant="secondary" className="h-9 px-3 text-xs">Attendance</ButtonLink>
            <ButtonLink href="#training-groups" variant="secondary" className="h-9 px-3 text-xs">Groups</ButtonLink>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-board-line">
        {!attendance.length ? (
          <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No participants in this Training. Open the edit page to add squad players or trial players.</p>
        ) : !filteredAttendance.length ? (
          <div className="p-4 text-sm text-slate-600">
            <p className="font-semibold text-board-navy">No participants match the current filters.</p>
            <Button type="button" variant="secondary" className="mt-3 h-9 px-3" onClick={() => {
              setQuery("");
              setFilter("all");
            }}>Clear filters</Button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-[900px] w-full border-collapse text-left text-sm">
                <thead className="sticky top-[var(--training-participant-toolbar-height,64px)] z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-sm">
                  <tr className="border-b border-board-line">
                    {selectionMode ? <th className="w-12 bg-slate-50 px-3 py-3">Select</th> : null}
                    {shownColumns.map((column) => <th key={column.id} className={cn("bg-slate-50 px-3 py-3", column.id === "player" && "min-w-56")}>{shortColumnLabel(column)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((entry) => (
                    <tr key={entry.id} className="h-14 border-b border-board-line bg-white last:border-b-0 hover:bg-slate-50">
                      {selectionMode ? (
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={selectedSet.has(entry.id)} onChange={() => toggleSelected(entry.id)} className="h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" aria-label={`Select ${attendanceDisplayName(entry)}`} />
                        </td>
                      ) : null}
                      {shownColumns.map((column) => (
                        <td key={column.id} className="px-3 py-3 align-middle">
                          <ParticipantCell eventId={eventId} entry={entry} columnId={column.id} groupLabels={entry.player ? groupLabels.get(entry.player.id) ?? [] : []} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 xl:hidden">
              {filteredAttendance.map((entry) => (
                <ParticipantCard key={entry.id} eventId={eventId} entry={entry} groupLabels={entry.player ? groupLabels.get(entry.player.id) ?? [] : []} selectionMode={selectionMode} selected={selectedSet.has(entry.id)} onToggleSelected={() => toggleSelected(entry.id)} columns={shownColumns.filter((column) => !hiddenOnMobile.has(column.id)).map((column) => column.id)} />
              ))}
            </div>
          </>
        )}
      </div>
      {hasFilters ? <p className="text-xs font-semibold text-slate-500">Filtered participant view. Clear filters to see the full Training list.</p> : null}
    </div>
  );
}

function ParticipantCell({ eventId, entry, columnId, groupLabels }: { eventId: string; entry: SquadAttendanceEntry; columnId: ParticipantColumnId; groupLabels: string[] }) {
  const player = entry.player;
  if (columnId === "player") {
    return (
      <div className="min-w-0">
        {player ? (
          <Link href={playerProfileHref(player.id, eventId)} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
            {attendanceDisplayName(entry)}
          </Link>
        ) : (
          <p className="font-bold text-board-navy">{attendanceDisplayName(entry)}</p>
        )}
        <ExceptionalPlayerBadge entry={entry} />
      </div>
    );
  }
  if (columnId === "position") return <PositionCell entry={entry} />;
  if (columnId === "planned") return <PlannedBadge entry={entry} />;
  if (columnId === "reason") return <span className="font-semibold text-slate-600">{entry.plannedReason ? plannedReasonLabel(entry.plannedReason) : "-"}</span>;
  if (columnId === "group") return <GroupCell eventId={eventId} labels={groupLabels} />;
  if (columnId === "age") return <span className="font-semibold text-slate-700">{calculateAge(player?.dateOfBirth) ?? "-"}</span>;
  if (columnId === "availability") return <span className="font-semibold text-slate-700">{availabilityLabel(entry)}</span>;
  if (columnId === "actual") return <span className="font-semibold text-slate-700">{entry.finalStatus ? finalStatusLabel(entry.finalStatus) : "Not recorded"}</span>;
  if (columnId === "rating") return <span className="font-semibold text-slate-700">{entry.overallRating ? `${entry.overallRating}/5` : "Not rated"}</span>;
  if (columnId === "malus") return <span className="font-semibold text-slate-700">{reliabilityMalus(entry)}</span>;
  if (columnId === "secondaryPositions") return <span className="font-semibold text-slate-700">{player?.secondaryPositions.map(formatPositionLabel).filter(Boolean).join(", ") || "-"}</span>;
  if (columnId === "medical") return <span className="font-semibold text-slate-700">{entry.medicalAvailability?.label ?? "-"}</span>;
  if (columnId === "squadStatus") return <span className="font-semibold text-slate-700">{squadStatusLabel(entry)}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {player ? <ButtonLink href={playerProfileHref(player.id, eventId)} variant="ghost" className="h-8 px-2 text-xs">Profile</ButtonLink> : null}
      <ButtonLink href={`/trainings/${eventId}/edit`} variant="ghost" className="h-8 px-2 text-xs">More</ButtonLink>
    </div>
  );
}

function ParticipantCard({ eventId, entry, groupLabels, selectionMode, selected, onToggleSelected, columns }: { eventId: string; entry: SquadAttendanceEntry; groupLabels: string[]; selectionMode: boolean; selected: boolean; onToggleSelected: () => void; columns: ParticipantColumnId[] }) {
  return (
    <article className={cn("rounded-lg border bg-white p-3", selected ? "border-board-green ring-2 ring-board-green/20" : "border-board-line")}>
      <div className="flex items-start gap-3">
        {selectionMode ? <input type="checkbox" checked={selected} onChange={onToggleSelected} className="mt-1 h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" aria-label={`Select ${attendanceDisplayName(entry)}`} /> : null}
        <div className="min-w-0 flex-1">
          <ParticipantCell eventId={eventId} entry={entry} columnId="player" groupLabels={groupLabels} />
          <div className="mt-2 grid gap-2 text-sm">
            {columns.filter((column) => column !== "player").map((column) => (
              <div key={column} className="flex items-start justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{shortColumnLabel(participantColumns.find((item) => item.id === column) ?? participantColumns[0])}</span>
                <div className="text-right"><ParticipantCell eventId={eventId} entry={entry} columnId={column} groupLabels={groupLabels} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function ColumnsPanel({ visibleColumns, columnOrder, onVisibleColumnsChange, onColumnOrderChange, onApply, onCancel, onReset }: { visibleColumns: ParticipantColumnId[]; columnOrder: ParticipantColumnId[]; onVisibleColumnsChange: (columns: ParticipantColumnId[]) => void; onColumnOrderChange: (columns: ParticipantColumnId[]) => void; onApply: () => void; onCancel: () => void; onReset: () => void }) {
  const visibleSet = new Set(visibleColumns);
  const orderedColumns = columnOrder
    .map((id) => participantColumns.find((column) => column.id === id))
    .filter((column): column is ParticipantColumn => Boolean(column));

  function toggleColumn(column: ParticipantColumn) {
    if (column.required) return;
    if (visibleSet.has(column.id)) {
      onVisibleColumnsChange(visibleColumns.filter((id) => id !== column.id));
      return;
    }
    onVisibleColumnsChange([...visibleColumns, column.id]);
  }

  function moveColumn(columnId: ParticipantColumnId, direction: -1 | 1) {
    if (columnId === "player") return;
    const next = [...columnOrder];
    const index = next.indexOf(columnId);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex <= 0 || targetIndex >= next.length) return;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onColumnOrderChange(next);
  }

  return (
    <div className="absolute right-0 top-12 z-40 w-[min(92vw,420px)] rounded-lg border border-board-line bg-white p-4 text-left shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-board-navy">Participant columns</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">Separate from Squad table preferences.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close columns panel"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {orderedColumns.map((column, index) => (
          <div key={column.id} className="flex items-center gap-2 rounded-md border border-board-line bg-board-paper p-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-board-navy">
              <input type="checkbox" checked={column.required || visibleSet.has(column.id)} disabled={column.required} onChange={() => toggleColumn(column)} className="h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" />
              <span className="truncate">{column.label}</span>
            </label>
            <button type="button" disabled={column.id === "player" || index <= 1} onClick={() => moveColumn(column.id, -1)} className="rounded-md p-1 text-slate-500 hover:bg-white disabled:opacity-40" aria-label={`Move ${column.label} left`}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" disabled={column.id === "player" || index === orderedColumns.length - 1} onClick={() => moveColumn(column.id, 1)} className="rounded-md p-1 text-slate-500 hover:bg-white disabled:opacity-40" aria-label={`Move ${column.label} right`}><ArrowDown className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" className="h-9 px-3" onClick={onApply}>Apply</Button>
        <Button type="button" variant="secondary" className="h-9 px-3" onClick={onReset}><Settings2 className="h-4 w-4" />Reset</Button>
        <Button type="button" variant="ghost" className="h-9 px-3" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function PositionCell({ entry }: { entry: SquadAttendanceEntry }) {
  const family = effectiveParticipantPositionFamily(entry);
  const familyLabel = family === "goalkeeper" ? "GK" : family === "defensive" ? "DEF" : family === "midfield" ? "MID" : family === "attacking" ? "ATT" : "OPEN";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-700">{effectiveParticipantPositionLabel(entry)}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{familyLabel}</span>
    </div>
  );
}

function PlannedBadge({ entry }: { entry: SquadAttendanceEntry }) {
  const notExpected = entry.plannedStatus === "unavailable" || entry.plannedStatus === "unclear";
  return (
    <span className={cn("inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold", notExpected ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700")}>
      {plannedStatusLabel(entry.plannedStatus)}{notExpected && entry.plannedReason ? ` · ${plannedReasonLabel(entry.plannedReason)}` : ""}
    </span>
  );
}

function GroupCell({ eventId, labels }: { eventId: string; labels: string[] }) {
  return (
    <Link href="#training-groups" className="font-semibold text-slate-700 underline-offset-4 hover:text-board-green hover:underline">
      {labels.length ? labels.join(", ") : "No group"}
      <span className="sr-only"> for Training {eventId}</span>
    </Link>
  );
}

function ExceptionalPlayerBadge({ entry }: { entry: SquadAttendanceEntry }) {
  const label = playerTypeLabel(entry);
  if (!label) return null;
  return <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">{label}</span>;
}

function playerTypeLabel(entry: SquadAttendanceEntry) {
  if (!entry.player) return "Guest";
  if (entry.player.deletedAt || entry.player.archivedAt) return "No longer in Squad";
  if (entry.player.playerType === "trial") return "Trial";
  return "";
}

function squadStatusLabel(entry: SquadAttendanceEntry) {
  return playerTypeLabel(entry) || "Roster";
}

function availabilityLabel(entry: SquadAttendanceEntry) {
  if (entry.medicalAvailability?.label) return entry.medicalAvailability.label;
  if (entry.plannedStatus === "unavailable" && entry.plannedReason) return plannedReasonLabel(entry.plannedReason);
  if (entry.plannedStatus === "unclear") return "Unknown";
  return "Available";
}

function shortColumnLabel(column: ParticipantColumn) {
  if (column.id === "planned") return "Planned";
  if (column.id === "secondaryPositions") return "Secondary";
  if (column.id === "squadStatus") return "Squad status";
  return column.label;
}

function normalizeColumns(value: unknown, fallback: ParticipantColumnId[]): ParticipantColumnId[] {
  const allowed = new Set(participantColumns.map((column) => column.id));
  const source = Array.isArray(value) ? value.filter((item): item is ParticipantColumnId => typeof item === "string" && allowed.has(item as ParticipantColumnId)) : fallback;
  const unique = Array.from(new Set(source));
  const withPlayer: ParticipantColumnId[] = unique.includes("player") ? unique : ["player", ...unique];
  return withPlayer.length ? withPlayer : fallback;
}

function playerProfileHref(playerId: string, eventId: string) {
  const params = new URLSearchParams({ returnTo: `/trainings/${eventId}` });
  return `/squad/players/${playerId}?${params.toString()}`;
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warning" }) {
  return (
    <div className={cn("rounded-lg border p-3", tone === "warning" ? "border-red-200 bg-red-50" : "border-board-line bg-white")}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone === "warning" ? "text-red-700" : "text-board-navy")}>{value}</p>
    </div>
  );
}
