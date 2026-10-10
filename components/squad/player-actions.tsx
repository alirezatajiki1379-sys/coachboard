"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, MoreHorizontal, RotateCcw, TimerReset } from "lucide-react";
import { DialogPortal } from "@/components/shared/dialog-portal";
import { useDialogFocus } from "@/components/shared/use-dialog-focus";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  archiveSquadPlayer,
  extendTrialPlayer,
  loadTrialExtensionContext,
  restoreSquadPlayer,
  type TrialExtensionActionState,
  type TrialExtensionContext
} from "@/lib/squad/actions";
import { estimatedSessionExtensionEnd, type TrialPeriodSummary } from "@/lib/squad/trials";
import { formatDate, formatMessage } from "@/lib/i18n";

type PlayerActionsProps = {
  playerId: string;
  playerType?: "roster" | "trial";
  archived?: boolean;
  initialTrialSummary?: TrialPeriodSummary;
};

const initialExtensionState: TrialExtensionActionState = { ok: false };

export function PlayerActions({ playerId, playerType = "roster", archived, initialTrialSummary }: PlayerActionsProps) {
  const { messages } = useI18n();
  const copy = messages.squad.trialExtension;
  const [menuOpen, setMenuOpen] = useState(false);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [menuOpen]);

  if (archived) {
    return (
      <form action={restoreSquadPlayer}>
        <input type="hidden" name="playerId" value={playerId} />
        <Button type="submit" variant="secondary" className="h-9 px-3">
          <RotateCcw className="h-4 w-4" />
          {messages.squad.actions.restore}
        </Button>
      </form>
    );
  }

  return (
    <div ref={menuRef} className="relative z-20">
      <Button
        type="button"
        variant="secondary"
        className="h-9 px-3"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal className="h-4 w-4" />
        {copy.actions}
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {menuOpen ? (
        <div role="menu" className="absolute right-0 top-11 z-40 w-56 rounded-lg border border-board-line bg-white p-2 shadow-xl">
          {playerType === "trial" ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-board-navy hover:bg-green-50 hover:text-board-green"
              onClick={() => {
                setMenuOpen(false);
                setExtensionOpen(true);
              }}
            >
              <TimerReset className="h-4 w-4" />
              {copy.extend}
            </button>
          ) : null}
          <form action={archiveSquadPlayer}>
            <input type="hidden" name="playerId" value={playerId} />
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-100"
              onClick={(event) => {
                if (!window.confirm(copy.archiveConfirm)) event.preventDefault();
              }}
            >
              <Archive className="h-4 w-4" />
              {messages.squad.actions.archive}
            </button>
          </form>
        </div>
      ) : null}
      {extensionOpen ? (
        <TrialExtensionDialog playerId={playerId} initialSummary={initialTrialSummary} onClose={() => setExtensionOpen(false)} />
      ) : null}
    </div>
  );
}

function TrialExtensionDialog({ playerId, initialSummary, onClose }: { playerId: string; initialSummary?: TrialPeriodSummary; onClose: () => void }) {
  const router = useRouter();
  const { locale, messages } = useI18n();
  const copy = messages.squad.trialExtension;
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose);
  const [context, setContext] = useState<TrialExtensionContext>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [method, setMethod] = useState<"training_count" | "end_date">(initialSummary?.mode ?? "training_count");
  const [quickAmount, setQuickAmount] = useState<"1" | "2" | "3" | "custom">("1");
  const [customAmount, setCustomAmount] = useState("4");
  const [state, formAction, isPending] = useActionState(extendTrialPlayer, initialExtensionState);

  useEffect(() => {
    let current = true;
    loadTrialExtensionContext(playerId)
      .then((loaded) => {
        if (!current) return;
        if (!loaded) {
          setLoadFailed(true);
          return;
        }
        setContext(loaded);
        setMethod(loaded.summary.mode);
      })
      .catch(() => {
        if (current) setLoadFailed(true);
      });
    return () => {
      current = false;
    };
  }, [playerId]);

  useEffect(() => {
    if (!state.ok) return;
    router.refresh();
    if (!state.warning) onClose();
  }, [onClose, router, state.ok, state.warning]);

  const amount = quickAmount === "custom" ? Number(customAmount) : Number(quickAmount);
  const estimatedEnd = useMemo(() => {
    if (!context || method !== "training_count" || !Number.isInteger(amount) || amount < 1) return undefined;
    return estimatedSessionExtensionEnd(context.summary, context.events, amount, context.trialStartDate);
  }, [amount, context, method]);
  const summary = context?.summary ?? initialSummary;
  const minimumDate = minimumExtensionDate(summary);
  const error = extensionError(state.code, state.message, copy);

  return (
    <DialogPortal>
      <div
        className="fixed inset-0 z-[var(--app-modal-z)] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-extension-title"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isPending) onClose();
        }}
      >
        <div ref={dialogRef} tabIndex={-1} className="app-dialog-panel max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl outline-none">
          <h2 id="trial-extension-title" className="text-xl font-bold text-board-navy">{copy.title}</h2>
          {summary ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full px-2.5 py-1 font-bold ${summary.status === "expired" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                {summary.status === "expired" ? copy.expired : copy.active}
              </span>
              {summary.currentEndDate ? <span className="font-semibold text-slate-600">{copy.currentEnd}: {formatDate(summary.currentEndDate, locale)}</span> : null}
              {summary.trainingLimit ? <span className="font-semibold text-slate-600">{copy.currentLimit}: {summary.trainingLimit}</span> : null}
              {summary.remainingTrainingCount !== undefined ? <span className="font-semibold text-slate-600">{formatMessage(copy.remaining, { count: summary.remainingTrainingCount })}</span> : null}
            </div>
          ) : null}

          {loadFailed ? <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{copy.loadError}</p> : null}
          {!context && !loadFailed ? <p className="mt-4 text-sm font-semibold text-slate-600">{copy.loading}</p> : null}

          {context ? (
            <form action={formAction} className="mt-5">
              <input type="hidden" name="playerId" value={playerId} />
              <input type="hidden" name="expectedUpdatedAt" value={context.summary.updatedAt} />
              <input type="hidden" name="extensionMethod" value={method} />
              <div className="grid grid-cols-2 rounded-md bg-slate-100 p-1" role="tablist" aria-label={copy.title}>
                <button type="button" role="tab" aria-selected={method === "training_count"} className={`min-h-10 rounded px-2 text-sm font-bold ${method === "training_count" ? "bg-white text-board-navy shadow-sm" : "text-slate-600"}`} onClick={() => setMethod("training_count")}>{copy.sessionsTab}</button>
                <button type="button" role="tab" aria-selected={method === "end_date"} className={`min-h-10 rounded px-2 text-sm font-bold ${method === "end_date" ? "bg-white text-board-navy shadow-sm" : "text-slate-600"}`} onClick={() => setMethod("end_date")}>{copy.dateTab}</button>
              </div>

              {method === "training_count" ? (
                <fieldset className="mt-5">
                  <legend className="text-sm font-bold text-board-navy">{copy.addSessions}</legend>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {(["1", "2", "3"] as const).map((value) => (
                      <button key={value} type="button" aria-pressed={quickAmount === value} className={`h-10 rounded-md text-sm font-bold ring-1 ${quickAmount === value ? "bg-board-green text-white ring-board-green" : "bg-white text-board-navy ring-board-line"}`} onClick={() => setQuickAmount(value)}>+{value}</button>
                    ))}
                    <button type="button" aria-pressed={quickAmount === "custom"} className={`h-10 rounded-md px-2 text-sm font-bold ring-1 ${quickAmount === "custom" ? "bg-board-green text-white ring-board-green" : "bg-white text-board-navy ring-board-line"}`} onClick={() => setQuickAmount("custom")}>{copy.custom}</button>
                  </div>
                  {quickAmount === "custom" ? (
                    <label className="mt-3 block text-sm font-bold text-board-navy">
                      {copy.customAmount}
                      <input type="number" min="1" max="50" step="1" inputMode="numeric" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-board-line px-3 text-base outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                    </label>
                  ) : null}
                  <input type="hidden" name="additionalSessions" value={Number.isFinite(amount) ? String(amount) : ""} />
                  <p className="mt-3 rounded-md bg-board-paper p-3 text-sm font-semibold text-slate-700">
                    {estimatedEnd ? formatMessage(copy.estimatedEnd, { date: formatDate(estimatedEnd, locale, { weekday: "long", day: "2-digit", month: "long" }) }) : copy.notScheduled}
                  </p>
                </fieldset>
              ) : (
                <label className="mt-5 block text-sm font-bold text-board-navy">
                  {copy.newEndDate}
                  <input name="newEndDate" type="date" required min={minimumDate} className="mt-1 h-11 w-full rounded-md border border-board-line px-3 text-base outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                </label>
              )}

              {error ? <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
              {state.ok && state.warning ? <p role="status" className="mt-4 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">{copy.syncWarning}</p> : null}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" disabled={isPending} onClick={onClose} className="w-full sm:w-auto">{copy.cancel}</Button>
                <Button type="submit" disabled={isPending || (method === "training_count" && (!Number.isInteger(amount) || amount < 1 || amount > 50))} className="w-full sm:w-auto">{isPending ? copy.saving : copy.save}</Button>
              </div>
            </form>
          ) : (
            <div className="mt-5 flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>{copy.cancel}</Button>
            </div>
          )}
        </div>
      </div>
    </DialogPortal>
  );
}

type TrialExtensionCopy = ReturnType<typeof useI18n>["messages"]["squad"]["trialExtension"];

function extensionError(code: TrialExtensionActionState["code"], message: string | undefined, copy: TrialExtensionCopy) {
  if (code === "invalid_player") return copy.invalidPlayer;
  if (code === "invalid_sessions") return copy.invalidSessions;
  if (code === "invalid_date") return copy.invalidDate;
  if (code === "stale") return copy.stale;
  if (code === "save_failed") return message ? `${copy.saveFailed} ${message}` : copy.saveFailed;
  return undefined;
}

function minimumExtensionDate(summary?: TrialPeriodSummary) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const minimum = new Date(today);
  minimum.setDate(minimum.getDate() + 1);
  if (summary?.currentEndDate) {
    const currentEnd = new Date(`${summary.currentEndDate}T12:00:00`);
    currentEnd.setDate(currentEnd.getDate() + 1);
    if (currentEnd > minimum) return dateInputValue(currentEnd);
  }
  return dateInputValue(minimum);
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
