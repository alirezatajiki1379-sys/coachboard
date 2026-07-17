"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const draftVersion = 1;
const autosaveDelayMs = 2000;

type DraftRecord<TData> = {
  version: number;
  entityType: "drill" | "session";
  entityId?: string;
  savedAt: string;
  baseUpdatedAt?: string;
  data: TData;
};

type DraftStatus = "idle" | "saving" | "saved" | "error";

type UseLocalDraftOptions<TData> = {
  draftKey: string;
  entityType: "drill" | "session";
  entityId?: string;
  baseUpdatedAt?: string;
  isDirty: boolean;
  initialData: TData;
  getData: () => TData;
  onRecover: (data: TData) => void;
};

export function useLocalDraft<TData>({
  draftKey,
  entityType,
  entityId,
  baseUpdatedAt,
  isDirty,
  initialData,
  getData,
  onRecover
}: UseLocalDraftOptions<TData>) {
  const [pendingDraft, setPendingDraft] = useState<DraftRecord<TData> | null>(null);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Local drafts are best-effort only.
    }
    setStatus("idle");
    setSavedAt(null);
  }, [draftKey]);

  const saveDraftNow = useCallback(() => {
    const nextSavedAt = new Date().toISOString();
    const record: DraftRecord<TData> = {
      version: draftVersion,
      entityType,
      entityId,
      baseUpdatedAt,
      savedAt: nextSavedAt,
      data: getData()
    };

    try {
      window.localStorage.setItem(draftKey, JSON.stringify(record));
      setSavedAt(nextSavedAt);
      setStatus("saved");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }, [baseUpdatedAt, draftKey, entityId, entityType, getData]);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(draftKey);
    } catch {
      setStatus("error");
      return;
    }

    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as DraftRecord<TData>;
      if (
        !parsed ||
        parsed.version !== draftVersion ||
        parsed.entityType !== entityType ||
        !parsed.savedAt ||
        !("data" in parsed)
      ) {
        window.localStorage.removeItem(draftKey);
        return;
      }

      if (stableStringify(parsed.data) === stableStringify(initialData)) {
        window.localStorage.removeItem(draftKey);
        return;
      }

      setPendingDraft(parsed);
      setSavedAt(parsed.savedAt);
      setStatus("saved");
    } catch {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Ignore cleanup failures.
      }
      setStatus("error");
    }
  }, [draftKey, entityType, initialData]);

  useEffect(() => {
    if (!isDirty) return;

    setStatus("saving");
    const timeout = window.setTimeout(() => {
      saveDraftNow();
    }, autosaveDelayMs);

    return () => window.clearTimeout(timeout);
  }, [isDirty, saveDraftNow]);

  const hasConflict = useMemo(() => {
    if (!pendingDraft?.baseUpdatedAt || !baseUpdatedAt) return false;
    return new Date(baseUpdatedAt).getTime() > new Date(pendingDraft.baseUpdatedAt).getTime();
  }, [baseUpdatedAt, pendingDraft]);

  const recoverDraft = useCallback(() => {
    if (!pendingDraft) return;
    onRecover(pendingDraft.data);
    setPendingDraft(null);
    setStatus("saved");
    setSavedAt(pendingDraft.savedAt);
  }, [onRecover, pendingDraft]);

  const discardDraft = useCallback(() => {
    clearDraft();
    setPendingDraft(null);
  }, [clearDraft]);

  const keepCurrentVersion = useCallback(() => {
    setPendingDraft(null);
  }, []);

  return {
    autosaveDelayMs,
    clearDraft,
    indicator: <AutosaveIndicator isDirty={isDirty} status={status} savedAt={savedAt} />,
    recoveryDialog: pendingDraft ? (
      <DraftRecoveryDialog
        savedAt={pendingDraft.savedAt}
        hasConflict={hasConflict}
        onRecover={recoverDraft}
        onDiscard={discardDraft}
        onKeepCurrent={keepCurrentVersion}
      />
    ) : null,
    saveDraftNow
  };
}

function AutosaveIndicator({
  isDirty,
  status,
  savedAt
}: {
  isDirty: boolean;
  status: DraftStatus;
  savedAt: string | null;
}) {
  if (status === "error") {
    return (
      <span className="self-center text-sm font-semibold text-red-700">
        Draft could not be saved locally
      </span>
    );
  }

  if (status === "saving") {
    return <span className="self-center text-sm font-semibold text-slate-500">Saving draft...</span>;
  }

  if (status === "saved" && savedAt) {
    return (
      <span className="self-center text-sm font-semibold text-slate-500">
        Draft saved at {formatDraftTime(savedAt)}
      </span>
    );
  }

  if (isDirty) {
    return <span className="self-center text-sm font-semibold text-amber-700">Unsaved changes</span>;
  }

  return null;
}

function DraftRecoveryDialog({
  savedAt,
  hasConflict,
  onRecover,
  onDiscard,
  onKeepCurrent
}: {
  savedAt: string;
  hasConflict: boolean;
  onRecover: () => void;
  onDiscard: () => void;
  onKeepCurrent: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 sm:p-4">
      <div className="w-full max-w-lg rounded-lg border border-board-line bg-white p-4 shadow-2xl sm:p-5">
        <h2 className="text-lg font-bold text-board-navy">Recover unsaved draft?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Unsaved work from an earlier visit was found. Draft saved at{" "}
          <span className="font-semibold text-board-navy">{formatDraftTime(savedAt)}</span>.
        </p>
        {hasConflict ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The saved version may have changed since this draft was created.
          </p>
        ) : null}
        <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button type="button" className="w-full justify-center sm:w-auto" onClick={onRecover}>
            Recover draft
          </Button>
          <Button type="button" variant="danger" className="w-full justify-center sm:w-auto" onClick={onDiscard}>
            Discard draft
          </Button>
          <Button type="button" variant="secondary" className="w-full justify-center sm:w-auto" onClick={onKeepCurrent}>
            Keep current version
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDraftTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function stableStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
