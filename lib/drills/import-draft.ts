import type { DrillImportDecision } from "@/lib/drills/import-actions";
import type { DrillImportItem } from "@/lib/drills/import-schema";

export type DrillImportDraftRow = {
  index: number;
  selected: boolean;
  decision: DrillImportDecision;
  imageRemoved: boolean;
  item: DrillImportItem;
};

export type DrillImportDraft = {
  version: 1;
  savedAt: string;
  sourceFilename: string;
  rows: DrillImportDraftRow[];
};

const databaseName = "coachboard-drill-import";
const storeName = "packages";

export function drillImportDraftKey(userId: string) {
  return `coachboard:draft:drill-import:${userId}`;
}

export function readDrillImportDraft(userId: string): DrillImportDraft | null {
  try {
    const raw = localStorage.getItem(drillImportDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DrillImportDraft>;
    if (parsed.version !== 1 || !parsed.savedAt || !parsed.sourceFilename || !Array.isArray(parsed.rows)) {
      localStorage.removeItem(drillImportDraftKey(userId));
      return null;
    }
    return parsed as DrillImportDraft;
  } catch {
    localStorage.removeItem(drillImportDraftKey(userId));
    return null;
  }
}

export function writeDrillImportDraft(userId: string, draft: DrillImportDraft) {
  localStorage.setItem(drillImportDraftKey(userId), JSON.stringify(draft));
}

export async function clearDrillImportDraft(userId: string) {
  localStorage.removeItem(drillImportDraftKey(userId));
  try {
    const database = await openDatabase();
    await transactionPromise(database.transaction(storeName, "readwrite").objectStore(storeName).delete(userId));
    database.close();
  } catch {
    // Draft metadata is already cleared; unavailable IndexedDB must not block the UI.
  }
}

export async function storeDrillImportPackage(userId: string, file: File) {
  const database = await openDatabase();
  await transactionPromise(database.transaction(storeName, "readwrite").objectStore(storeName).put(file, userId));
  database.close();
}

export async function readDrillImportPackage(userId: string): Promise<File | null> {
  try {
    const database = await openDatabase();
    const value = await requestPromise(database.transaction(storeName, "readonly").objectStore(storeName).get(userId));
    database.close();
    return value instanceof File ? value : value instanceof Blob ? new File([value], "coachboard-import.zip", { type: "application/zip" }) : null;
  } catch {
    return null;
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestPromise(request: IDBRequest) {
  return new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(request: IDBRequest) {
  return requestPromise(request).then(() => undefined);
}
