export const DRILL_BULK_BATCH_SIZE = 100;
export const DRILL_BULK_MAX_SELECTION = 2_000;

export type DrillBulkRecord = {
  id: string;
  tags: string[] | null;
  is_favorite: boolean | null;
  archived_at: string | null;
  deleted_at: string | null;
};

export function normalizeBulkDrillIds(ids: readonly string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawId of ids) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= DRILL_BULK_MAX_SELECTION) break;
  }

  return normalized;
}

export function normalizeBulkDrillTags(tags: readonly string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawTag of tags) {
    const tag = typeof rawTag === "string" ? rawTag.trim() : "";
    const comparisonKey = tag.toLocaleLowerCase();
    if (!tag || seen.has(comparisonKey)) continue;
    seen.add(comparisonKey);
    normalized.push(tag);
  }

  return normalized;
}

export function addDrillTags(existingTags: readonly string[] | null | undefined, addedTags: readonly string[]) {
  return normalizeBulkDrillTags([...(existingTags ?? []), ...addedTags]);
}

export function removeDrillTags(existingTags: readonly string[] | null | undefined, removedTags: readonly string[]) {
  const removed = new Set(normalizeBulkDrillTags(removedTags).map((tag) => tag.toLocaleLowerCase()));
  return normalizeBulkDrillTags(existingTags ?? []).filter((tag) => !removed.has(tag.toLocaleLowerCase()));
}

export function sameDrillTags(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined) {
  const normalizedLeft = normalizeBulkDrillTags(left ?? []);
  const normalizedRight = normalizeBulkDrillTags(right ?? []);
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((tag, index) => tag === normalizedRight[index]);
}

export function chunkDrillBulkItems<T>(items: readonly T[], size = DRILL_BULK_BATCH_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function groupDrillsByResultingTags(
  records: readonly DrillBulkRecord[],
  tags: readonly string[],
  mode: "add" | "remove"
) {
  const groups = new Map<string, { ids: string[]; tags: string[] }>();

  for (const record of records) {
    const nextTags = mode === "add" ? addDrillTags(record.tags, tags) : removeDrillTags(record.tags, tags);
    if (sameDrillTags(record.tags, nextTags)) continue;
    const key = JSON.stringify(nextTags);
    const existing = groups.get(key);
    if (existing) existing.ids.push(record.id);
    else groups.set(key, { ids: [record.id], tags: nextTags });
  }

  return [...groups.values()];
}
