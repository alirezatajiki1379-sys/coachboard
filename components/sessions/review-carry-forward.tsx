"use client";

import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSystemText } from "@/components/i18n/use-system-text";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { formatEventDate } from "@/lib/squad/attendance-format";
import type { PreviousTrainingPlanningContext } from "@/lib/squad/session-review";

export function ReviewCarryForward({
  context,
  action,
  alreadyIncluded = false,
  onApply
}: {
  context: PreviousTrainingPlanningContext;
  action?: "focus" | "notes";
  alreadyIncluded?: boolean;
  onApply?: () => void;
}) {
  const locale = useOptionalI18n()?.locale ?? "en";
  const ui = useSystemText();
  return (
    <aside className="min-w-0 rounded-md border border-board-line bg-slate-50 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase text-board-green"><ClipboardCheck className="h-4 w-4 shrink-0" />{ui("From the last reflection")}</p>
          <p className="mt-1 break-words text-xs font-semibold text-slate-500 [overflow-wrap:anywhere]">
            {formatEventDate(context.sourceDate, locale)} · {context.sourceLabel ? <span translate="no">{context.sourceLabel}</span> : ui("Training")}
          </p>
          <p translate="no" className="mt-2 break-words whitespace-pre-wrap text-sm leading-5 text-board-navy [overflow-wrap:anywhere]">{context.nextTrainingNote}</p>
        </div>
        {onApply ? (
          alreadyIncluded ? <span className="shrink-0 text-sm font-bold text-board-green">{ui("Already included")}</span> : (
            <Button type="button" variant="secondary" className="w-full shrink-0 sm:w-auto" onClick={onApply}>
              {ui(action === "focus" ? "Use as focus" : "Add to planning notes")}
            </Button>
          )
        ) : null}
      </div>
    </aside>
  );
}
