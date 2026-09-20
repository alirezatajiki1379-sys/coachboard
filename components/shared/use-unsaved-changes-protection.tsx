"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDialogFocus } from "@/components/shared/use-dialog-focus";
import { DialogPortal } from "@/components/shared/dialog-portal";

const warningMessage = "You have unsaved changes.";

type UnsavedChangesOptions = {
  isDirty: boolean;
  isSaving?: boolean;
  onSaveDraftAndLeave?: (href: string) => void;
};

export function useUnsavedChangesProtection({ isDirty, isSaving = false, onSaveDraftAndLeave }: UnsavedChangesOptions) {
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

  const saveDraftAndLeave = useCallback(() => {
    if (!pendingHref) return;
    onSaveDraftAndLeave?.(pendingHref);
  }, [onSaveDraftAndLeave, pendingHref]);

  const dismissDialog = useCallback(() => {
    setPendingHref(null);
  }, []);
  const dialogRef = useDialogFocus(Boolean(pendingHref), dismissDialog);

  const dialog = useMemo(() => pendingHref ? (
    <DialogPortal>
    <div role="dialog" aria-modal="true" aria-labelledby="unsaved-changes-title" className="fixed inset-0 z-[var(--app-modal-z)] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 sm:p-4">
      <div ref={dialogRef} tabIndex={-1} className="app-dialog-panel w-full max-w-md rounded-lg border border-board-line bg-white p-4 shadow-2xl outline-none sm:p-5">
        <h2 id="unsaved-changes-title" className="text-lg font-bold text-board-navy">You have unsaved changes.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Do you want to keep a local draft before leaving?</p>
        <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button type="button" variant="primary" className="w-full justify-center sm:w-auto" onClick={saveDraftAndLeave} disabled={isSaving}>
            Save draft &amp; leave
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
    </DialogPortal>
  ) : null, [dialogRef, dismissDialog, isSaving, leaveWithoutSaving, pendingHref, saveDraftAndLeave]);

  return { dialog, dismissDialog };
}
