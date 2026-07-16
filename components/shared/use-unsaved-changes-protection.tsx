"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const warningMessage = "You have unsaved changes.";

type UnsavedChangesOptions = {
  isDirty: boolean;
  isSaving?: boolean;
  onSaveAndLeave?: (href: string) => void;
};

export function useUnsavedChangesProtection({ isDirty, isSaving = false, onSaveAndLeave }: UnsavedChangesOptions) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const bypassWarningRef = useRef(false);

  useEffect(() => {
    if (!isDirty || isSaving) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassWarningRef.current) return;
      event.preventDefault();
      event.returnValue = warningMessage;
      return warningMessage;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isSaving]);

  useEffect(() => {
    if (!isDirty || isSaving) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target || link.download) return;
      if (link.origin !== window.location.origin) return;
      if (link.href === window.location.href || link.href.startsWith(`${window.location.href}#`)) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${link.pathname}${link.search}${link.hash}`);
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [isDirty, isSaving]);

  const leaveWithoutSaving = useCallback(() => {
    if (!pendingHref) return;
    bypassWarningRef.current = true;
    window.location.href = pendingHref;
  }, [pendingHref]);

  const saveAndLeave = useCallback(() => {
    if (!pendingHref) return;
    onSaveAndLeave?.(pendingHref);
  }, [onSaveAndLeave, pendingHref]);

  const dismissDialog = useCallback(() => {
    setPendingHref(null);
  }, []);

  const dialog = useMemo(() => pendingHref ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 sm:p-4">
      <div className="w-full max-w-md rounded-lg border border-board-line bg-white p-4 shadow-2xl sm:p-5">
        <h2 className="text-lg font-bold text-board-navy">You have unsaved changes.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Do you want to save before leaving?</p>
        <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button type="button" variant="primary" className="w-full justify-center sm:w-auto" onClick={saveAndLeave} disabled={isSaving}>
            Save &amp; leave
          </Button>
          <Button type="button" variant="danger" className="w-full justify-center sm:w-auto" onClick={leaveWithoutSaving} disabled={isSaving}>
            Leave without saving
          </Button>
          <Button type="button" variant="secondary" className="w-full justify-center sm:w-auto" onClick={dismissDialog} disabled={isSaving}>
            Stay
          </Button>
        </div>
      </div>
    </div>
  ) : null, [dismissDialog, isSaving, leaveWithoutSaving, pendingHref, saveAndLeave]);

  return { dialog, dismissDialog };
}
