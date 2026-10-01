const databaseName = "coachboard-local-assets";
const storeName = "drill-images";

type PendingImageRecord = {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
};

export async function savePendingDrillImage(key: string, file: File) {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.put({
    blob: file.slice(0, file.size, file.type),
    name: file.name,
    type: file.type,
    lastModified: file.lastModified
  } satisfies PendingImageRecord, key));
  database.close();
}

export async function loadPendingDrillImage(key: string) {
  const database = await openDatabase();
  const record = await transactionPromise<PendingImageRecord | undefined>(database, "readonly", (store) => store.get(key));
  database.close();
  if (!record?.blob) return undefined;
  return new File([record.blob], record.name, { type: record.type, lastModified: record.lastModified });
}

export async function clearPendingDrillImage(key: string) {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.delete(key));
  database.close();
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local image storage."));
  });
}

function transactionPromise<TResult = undefined>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<TResult>
) {
  return new Promise<TResult>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not access the local image draft."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local image draft transaction failed."));
  });
}
