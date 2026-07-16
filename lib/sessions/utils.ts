import { trainingBlocks } from "@/config/options";
import { materialLineLabel } from "@/lib/drills/materials";
import type { Drill, MaterialItem, SessionPlayerGroup } from "@/types/domain";

export const stationSetOptions = [
  { id: "set-1", label: "Set 1" },
  { id: "set-2", label: "Set 2" },
  { id: "set-3", label: "Set 3" },
  { id: "set-4", label: "Set 4" }
] as const;

const defaultSessionPlayerGroups: SessionPlayerGroup[] = [
  { id: "group-a", name: "Group A", notes: "" },
  { id: "group-b", name: "Group B", notes: "" },
  { id: "group-c", name: "Group C", notes: "" },
  { id: "group-d", name: "Group D", notes: "" }
];

export type SessionFormDrill = {
  id: string;
  drillId: string;
  block: string;
  plannedDurationMinutes: number;
  coachNotes: string;
  orderIndex: number;
  timingMode: "sequential" | "simultaneous";
  simultaneousGroup: string;
  participatingGroups: string[];
  startingGroup: string;
};

export type SessionFormValues = {
  title: string;
  sessionDate: string;
  startTime: string;
  teamAgeGroup: string;
  mainFocus: string;
  secondaryFocus: string;
  expectedPlayers: string;
  durationTargetMinutes: string;
  location: string;
  notes: string;
  playerGroups: SessionPlayerGroup[];
  drills: SessionFormDrill[];
};

export type MaterialSummaryItem = {
  key: string;
  type: string;
  color?: string;
  label?: string;
  variant?: string;
  quantity: number;
};

export type SessionMaterialSource = {
  drill: Pick<Drill, "materials">;
  timingMode?: "sequential" | "simultaneous";
  simultaneousGroup?: string;
};

export type BlockGroup<T extends SessionDurationItem> = {
  block: string;
  duration: number;
  stationSets: StationSetSummary[];
  items: T[];
};

export type SessionDurationItem = {
  block: string;
  plannedDurationMinutes?: number;
  timingMode?: "sequential" | "simultaneous";
  simultaneousGroup?: string;
  participatingGroups?: string[];
};

export type StationSetSummary = {
  name: string;
  duration: number;
};

export function aggregateMaterials(drills: Drill[]): MaterialSummaryItem[] {
  const totals = new Map<string, MaterialSummaryItem>();

  for (const drill of drills) {
    for (const material of drill.materials) {
      const key = materialKey(material);
      const current = totals.get(key);
      if (current) {
        current.quantity += material.quantity;
      } else {
        totals.set(key, {
          key,
          type: material.type,
          color: material.color,
          label: material.label,
          variant: material.variant,
          quantity: material.quantity
        });
      }
    }
  }

  return Array.from(totals.values()).sort((a, b) => a.type.localeCompare(b.type) || (a.color ?? "").localeCompare(b.color ?? ""));
}

export function calculateSessionMaterials(items: SessionMaterialSource[]): MaterialSummaryItem[] {
  const timeSlots: Array<Map<string, MaterialSummaryItem>> = [];
  const simultaneousGroups = new Map<string, SessionMaterialSource[]>();

  for (const item of items) {
    if (item.timingMode === "simultaneous") {
      const group = normalizeSimultaneousGroup(item.simultaneousGroup);
      simultaneousGroups.set(group, [...(simultaneousGroups.get(group) ?? []), item]);
    } else {
      timeSlots.push(materialsForDrills([item.drill]));
    }
  }

  for (const groupItems of simultaneousGroups.values()) {
    timeSlots.push(materialsForDrills(groupItems.map((item) => item.drill)));
  }

  const required = new Map<string, MaterialSummaryItem>();
  for (const slot of timeSlots) {
    for (const item of slot.values()) {
      const current = required.get(item.key);
      if (!current || item.quantity > current.quantity) {
        required.set(item.key, { ...item });
      }
    }
  }

  return sortMaterials(Array.from(required.values()));
}

export function materialSummaryLabel(item: MaterialSummaryItem) {
  return materialLineLabel({
    type: item.type as MaterialItem["type"],
    color: item.color as MaterialItem["color"],
    label: item.label,
    variant: item.variant,
    quantity: item.quantity
  });
}

export function normalizeSimultaneousGroup(group?: string | null) {
  const normalized = group?.trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return "set-1";
  const compact = normalized.replace(/\s+/g, " ");
  const map: Record<string, string> = {
    "set-1": "set-1",
    "set 1": "set-1",
    "set-a": "set-1",
    "set a": "set-1",
    "group-a": "set-1",
    "group a": "set-1",
    "set-2": "set-2",
    "set 2": "set-2",
    "set-b": "set-2",
    "set b": "set-2",
    "group-b": "set-2",
    "group b": "set-2",
    "set-3": "set-3",
    "set 3": "set-3",
    "set-c": "set-3",
    "set c": "set-3",
    "group-c": "set-3",
    "group c": "set-3",
    "set-4": "set-4",
    "set 4": "set-4",
    "set-d": "set-4",
    "set d": "set-4",
    "group-d": "set-4",
    "group d": "set-4"
  };
  return map[compact] ?? stationSetOptions.find((option) => option.id === normalized)?.id ?? "set-1";
}

export function stationSetLabel(group?: string | null) {
  const normalized = normalizeSimultaneousGroup(group);
  return stationSetOptions.find((option) => option.id === normalized)?.label ?? "Set 1";
}

export function defaultSessionGroups() {
  return defaultSessionPlayerGroups.map((group) => ({ ...group }));
}

export function normalizePlayerGroups(value: unknown): SessionPlayerGroup[] {
  if (!Array.isArray(value)) return defaultSessionGroups();
  const usedIds = new Set<string>();
  const groups = value
    .filter((group): group is Record<string, unknown> => Boolean(group) && typeof group === "object" && !Array.isArray(group))
    .map((group, index) => {
      const rawId = typeof group.id === "string" ? group.id : "";
      const rawName = typeof group.name === "string" ? group.name : "";
      const canonicalId = normalizePlayerGroupValue(rawId) ?? normalizePlayerGroupValue(rawName);
      const fallbackName = playerGroupName(index);
      const normalizedName = normalizePlayerGroupValue(rawName);
      const preferredId = canonicalId ?? (rawId.trim() || `group-${index + 1}`);
      const id = uniquePlayerGroupId(preferredId, usedIds);
      return {
        id,
        name: canonicalId && (!rawName.trim() || normalizedName) ? resolveCanonicalPlayerGroupName(canonicalId) : rawName.trim() || fallbackName,
        notes: typeof group.notes === "string" ? group.notes : ""
      };
    });
  return groups;
}

export function resolveGroupName(groups: SessionPlayerGroup[], value?: string) {
  if (!value) return "";
  const canonicalValue = normalizePlayerGroupValue(value) ?? value;
  return groups.find((group) => group.id === canonicalValue)?.name ?? groups.find((group) => group.name === value)?.name ?? value;
}

export function normalizeGroupRefs(values: string[] | undefined, groups: SessionPlayerGroup[]) {
  return (values ?? [])
    .map((value) => normalizePlayerGroupValue(value) ?? groups.find((group) => group.id === value)?.id ?? groups.find((group) => group.name === value)?.id ?? value)
    .filter(Boolean);
}

export function normalizeGroupRef(value: string | undefined, groups: SessionPlayerGroup[]) {
  if (!value) return "";
  return normalizePlayerGroupValue(value) ?? groups.find((group) => group.id === value)?.id ?? groups.find((group) => group.name === value)?.id ?? value;
}

export function playerGroupName(index: number) {
  const letter = String.fromCharCode(65 + index);
  return `Group ${letter}`;
}

function normalizePlayerGroupValue(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return null;
  const compact = normalized.replace(/\s+/g, " ");
  const map: Record<string, string> = {
    "group-a": "group-a",
    "group a": "group-a",
    "group-1": "group-a",
    "group 1": "group-a",
    "group-b": "group-b",
    "group b": "group-b",
    "group-2": "group-b",
    "group 2": "group-b",
    "group-c": "group-c",
    "group c": "group-c",
    "group-3": "group-c",
    "group 3": "group-c",
    "group-d": "group-d",
    "group d": "group-d",
    "group-4": "group-d",
    "group 4": "group-d"
  };
  return map[compact] ?? null;
}

function uniquePlayerGroupId(preferredId: string, usedIds: Set<string>) {
  let id = preferredId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${preferredId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function resolveCanonicalPlayerGroupName(id: string) {
  const defaultIndex = defaultSessionPlayerGroups.findIndex((group) => group.id === id);
  return defaultIndex >= 0 ? defaultSessionPlayerGroups[defaultIndex].name : id;
}

function materialKey(material: MaterialItem) {
  return `${material.type}:${material.color ?? ""}:${material.variant ?? ""}:${material.label ?? ""}`;
}

function materialsForDrills(drills: Array<Pick<Drill, "materials">>) {
  const totals = new Map<string, MaterialSummaryItem>();
  for (const drill of drills) {
    for (const material of drill.materials) {
      const key = materialKey(material);
      const current = totals.get(key);
      if (current) {
        current.quantity += material.quantity;
      } else {
        totals.set(key, {
          key,
          type: material.type,
          color: material.color,
          label: material.label,
          variant: material.variant,
          quantity: material.quantity
        });
      }
    }
  }
  return totals;
}

function sortMaterials(items: MaterialSummaryItem[]) {
  return items.sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      (a.color ?? "").localeCompare(b.color ?? "") ||
      (a.variant ?? "").localeCompare(b.variant ?? "") ||
      (a.label ?? "").localeCompare(b.label ?? "")
  );
}

export function plannedDuration(items: Array<{ plannedDurationMinutes: number }>) {
  return items.reduce((total, item) => total + item.plannedDurationMinutes, 0);
}

export function effectiveStationDuration(item: {
  plannedDurationMinutes?: number;
  participatingGroups?: string[];
}) {
  return safeDuration(item.plannedDurationMinutes) * Math.max(1, item.participatingGroups?.length ?? 0);
}

export function calculateBlockDuration(items: SessionDurationItem[]) {
  const sequentialTotal = items
    .filter((item) => item.timingMode !== "simultaneous")
    .reduce((total, item) => total + safeDuration(item.plannedDurationMinutes), 0);

  return sequentialTotal + stationSetSummaries(items).reduce((total, set) => total + set.duration, 0);
}

export function calculateSessionDuration(items: SessionDurationItem[]) {
  return groupByTrainingBlock(items).reduce((total, block) => total + block.duration, 0);
}

export function stationSetSummaries(items: SessionDurationItem[]): StationSetSummary[] {
  const sets = new Map<string, number>();
  for (const item of items) {
    if (item.timingMode !== "simultaneous") continue;
    const set = stationSetLabel(item.simultaneousGroup);
    const duration = effectiveStationDuration(item);
    sets.set(set, Math.max(sets.get(set) ?? 0, duration));
  }
  return Array.from(sets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, duration]) => ({ name, duration }));
}

export function durationDeltaLabel(total: number, target?: number | null) {
  if (!target) return null;
  const delta = target - total;
  if (delta === 0) return "On target";
  return delta > 0 ? `${delta} minutes remaining` : `${Math.abs(delta)} minutes over target`;
}

export function formatTimelineRange(startOffsetMinutes: number, durationMinutes: number, startTime?: string | null) {
  const start = parseTimeToMinutes(startTime);
  if (start === null) return `${formatMinutes(startOffsetMinutes)}-${formatMinutes(startOffsetMinutes + durationMinutes)}`;
  return `${formatClockMinutes(start + startOffsetMinutes)}-${formatClockMinutes(start + startOffsetMinutes + durationMinutes)}`;
}

function parseTimeToMinutes(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClockMinutes(totalMinutes: number) {
  const dayMinutes = 24 * 60;
  const normalized = ((totalMinutes % dayMinutes) + dayMinutes) % dayMinutes;
  return formatMinutes(normalized);
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function groupByTrainingBlock<T extends SessionDurationItem>(items: T[]): BlockGroup<T>[] {
  const knownBlocks = new Set<string>(trainingBlocks);
  const blockOrder = new Map<string, number>(trainingBlocks.map((block, index) => [block, index]));
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    grouped.set(item.block, [...(grouped.get(item.block) ?? []), item]);
  }

  return Array.from(grouped.entries())
    .sort(([blockA], [blockB]) => {
      const a = knownBlocks.has(blockA) ? blockOrder.get(blockA) ?? 0 : Number.MAX_SAFE_INTEGER;
      const b = knownBlocks.has(blockB) ? blockOrder.get(blockB) ?? 0 : Number.MAX_SAFE_INTEGER;
      return a - b || blockA.localeCompare(blockB);
    })
    .map(([block, blockItems]) => ({
      block,
      items: blockItems,
      stationSets: stationSetSummaries(blockItems),
      duration: calculateBlockDuration(blockItems)
    }));
}

function safeDuration(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
