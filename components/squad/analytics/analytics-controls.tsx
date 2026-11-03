"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Filter, MoreHorizontal, Printer, X } from "lucide-react";
import { DialogPortal } from "@/components/shared/dialog-portal";
import { useDialogFocus } from "@/components/shared/use-dialog-focus";
import { formatDate, type Locale } from "@/lib/i18n";
import type { AnalyticsFilters } from "@/lib/squad/analytics-queries";
import type { AnalyticsPeriod, AnalyticsPlayerTypeFilter } from "@/lib/squad/analytics";
import { cn } from "@/lib/utils";
import { analyticsCopy, analyticsPlayerTypeOptions } from "./analytics-copy";
import { hrefFor, reportHrefFor, formatGermanDate } from "./analytics-links";

type Props = {
  filters: AnalyticsFilters;
  methodology: boolean;
  positions: string[];
  events: Array<{ id: string; date: string; startTime: string; label?: string }>;
  periodLabel: string;
  periodNote?: string;
  locale: Locale;
};
const primary = ["overview", "players", "training", "attendance"] as const;
const secondary = ["development", "drills"] as const;
const field = "mt-1 min-h-11 w-full min-w-0 rounded-md border border-board-line bg-white px-3 text-base text-board-navy";

export function AnalyticsControls({ filters, methodology, positions, events, periodLabel, periodNote, locale }: Props) {
  const router = useRouter();
  const copy = analyticsCopy[locale];
  const [panel, setPanel] = useState<"more" | "filters" | null>(null);
  const focusRef = useDialogFocus<HTMLDivElement>(panel !== null, () => setPanel(null));
  const more = locale === "de" ? "Mehr" : "More";
  const method = locale === "de" ? "Methodik" : "Methodology";
  const activeSecondary = secondary.find((item) => item === filters.section);
  const count = Number(filters.playerType !== "all") + Number(Boolean(filters.position)) + Number(Boolean(filters.trainingId)) + Number(filters.ratedOnly);
  const reset = { ...filters, playerType: "all" as const, position: undefined, trainingId: undefined, ratedOnly: false };
  const destination = (next: AnalyticsFilters) => hrefFor(next) + (methodology ? (hrefFor(next).includes("?") ? "&" : "?") + "view=methodology" : "");
  const selectedEvent = events.find((event) => event.id === filters.trainingId);
  const chips = [
    filters.playerType !== "all" ? { label: analyticsPlayerTypeOptions[locale].find((item) => item.id === filters.playerType)!.label, next: { ...filters, playerType: "all" as const } } : null,
    filters.position ? { label: `${copy.position}: ${filters.position}`, next: { ...filters, position: undefined } } : null,
    filters.trainingId ? { label: selectedEvent ? `${formatDate(selectedEvent.date, locale)} · ${selectedEvent.label || copy.unnamedTraining}` : copy.training, next: { ...filters, trainingId: undefined } } : null,
    filters.ratedOnly ? { label: locale === "de" ? "Nur bewertete Spieler" : "Rated players only", next: { ...filters, ratedOnly: false } } : null
  ].filter((chip) => chip !== null);
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(destination({ ...filters, playerType: String(data.get("playerType")) as AnalyticsPlayerTypeFilter,
      position: String(data.get("position") || "") || undefined, trainingId: String(data.get("training") || "") || undefined, ratedOnly: data.has("ratedOnly") }));
    setPanel(null);
  }
  return (
    <div className="min-w-0 space-y-4" data-analytics-controls>
      <nav aria-label={copy.title} className="flex flex-wrap gap-1 border-b border-board-line pb-3">
        {primary.map((section) => <Link key={section} href={hrefFor({ ...filters, section })} aria-current={!methodology && filters.section === section ? "page" : undefined}
          className={cn("inline-flex min-h-11 items-center rounded-md px-3 text-sm font-bold transition-colors", !methodology && filters.section === section ? "bg-board-green text-white" : "text-slate-600 hover:bg-slate-100")}>{copy.sections[section]}</Link>)}
        <button type="button" onClick={() => setPanel("more")} aria-haspopup="dialog" aria-expanded={panel === "more"} aria-current={methodology || activeSecondary ? "page" : undefined}
          className={cn("inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold", methodology || activeSecondary ? "bg-board-green text-white" : "text-slate-600 hover:bg-slate-100")}>
          <MoreHorizontal className="h-4 w-4 shrink-0" />{more}{methodology ? ` · ${method}` : activeSecondary ? ` · ${copy.sections[activeSecondary]}` : ""}
        </button>
      </nav>
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <label className="min-w-0 basis-full text-sm font-bold text-board-navy sm:max-w-xs sm:flex-1 sm:basis-auto">{copy.period}
          <select aria-label={copy.period} className={field} value={filters.period} onChange={(event) => router.push(destination({ ...filters, period: event.target.value as AnalyticsPeriod, trainingId: undefined }))}>
            {Object.entries(copy.periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setPanel("filters")} aria-haspopup="dialog" aria-expanded={panel === "filters"} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-board-line bg-white px-3 text-sm font-bold text-board-navy">
          <Filter className="h-4 w-4" />{copy.filters} · {count}
        </button>
        <Link href={reportHrefFor(filters)} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold text-board-navy hover:bg-slate-100 sm:ml-auto">
          <Printer className="h-4 w-4" />{locale === "de" ? "Bericht erstellen" : "Create report"}
        </Link>
      </div>
      {filters.period === "custom" ? <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); router.push(destination({ ...filters, customFrom: String(data.get("from") || ""), customTo: String(data.get("to") || ""), trainingId: undefined })); }} className="grid min-w-0 gap-2 sm:max-w-xl sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0 text-sm font-semibold">{copy.customFrom}<input required name="from" defaultValue={formatGermanDate(filters.customFrom)} placeholder={copy.datePlaceholder} className={field} /></label>
        <label className="min-w-0 text-sm font-semibold">{copy.customTo}<input required name="to" defaultValue={formatGermanDate(filters.customTo)} placeholder={copy.datePlaceholder} className={field} /></label>
        <button className="min-h-11 self-end rounded-md bg-board-green px-3 text-sm font-bold text-white" type="submit">{copy.apply}</button>
      </form> : null}
      {methodology || periodNote ? <p className="break-words text-sm text-slate-600" data-period-context>{methodology ? periodLabel : periodNote}{methodology && periodNote ? ` · ${periodNote}` : ""}</p> : null}
      {chips.length ? <div className="flex flex-wrap items-center gap-2" data-active-filters>
        {chips.map((chip) => <Link key={chip.label} href={destination(chip.next)} aria-label={`${locale === "de" ? "Filter entfernen" : "Remove filter"}: ${chip.label}`} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md bg-slate-100 px-3 text-sm text-board-navy">
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{chip.label}</span><X className="h-4 w-4 shrink-0" />
        </Link>)}
        <Link href={destination(reset)} className="inline-flex min-h-11 items-center text-sm font-bold text-board-green">{copy.resetFilters}</Link>
      </div> : null}
      {panel ? <DialogPortal><div className="fixed inset-0 z-[var(--app-modal-z)] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center"
        onClick={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
        <div ref={focusRef} role="dialog" aria-modal="true" aria-labelledby="analytics-panel-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl outline-none">
          <div className="mb-4 flex items-center justify-between gap-2"><h2 id="analytics-panel-title" className="text-lg font-bold">{panel === "more" ? more : copy.filters}</h2><button type="button" onClick={() => setPanel(null)} aria-label={locale === "de" ? "Schließen" : "Close"} className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          {panel === "more" ? <nav className="grid gap-1" aria-label={more}>
            {secondary.map((section) => <Link key={section} href={hrefFor({ ...filters, section })} aria-current={!methodology && filters.section === section ? "page" : undefined} onClick={() => setPanel(null)} className="flex min-h-11 items-center rounded-md px-3 font-semibold text-board-navy hover:bg-slate-100">{copy.sections[section]}</Link>)}
            <Link href={hrefFor(filters) + (hrefFor(filters).includes("?") ? "&" : "?") + "view=methodology"} aria-current={methodology ? "page" : undefined} onClick={() => setPanel(null)} className="flex min-h-11 items-center rounded-md px-3 font-semibold text-board-navy hover:bg-slate-100">{method}</Link>
          </nav> : <form onSubmit={applyFilters} className="space-y-4">
            <label className="block text-sm font-semibold">{copy.players}<select name="playerType" defaultValue={filters.playerType} className={field}>{analyticsPlayerTypeOptions[locale].map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label className="block text-sm font-semibold">{copy.position}<select name="position" defaultValue={filters.position ?? ""} className={field}><option value="">{copy.allPositions}</option>{positions.map((position) => <option key={position}>{position}</option>)}</select></label>
            <label className="block text-sm font-semibold">{copy.training}<select name="training" defaultValue={filters.trainingId ?? ""} className={field}><option value="">{copy.allTrainings}</option>{events.map((event) => <option key={event.id} value={event.id}>{formatDate(event.date, locale)} · {event.startTime} · {event.label || copy.unnamedTraining}</option>)}</select></label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input name="ratedOnly" type="checkbox" defaultChecked={filters.ratedOnly} className="h-4 w-4" />{locale === "de" ? "Nur bewertete Spieler" : "Rated players only"}</label>
            <button type="submit" className="min-h-11 w-full rounded-md bg-board-green px-3 text-sm font-bold text-white">{copy.apply}</button>
          </form>}
        </div>
      </div></DialogPortal> : null}
    </div>
  );
}
