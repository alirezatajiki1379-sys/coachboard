"use client";

import { useRouter } from "next/navigation";
import type { AnalyticsPeriod } from "@/lib/squad/analytics";
import type { PlayerHubTab } from "@/lib/squad/player-hub";
import { Button } from "@/components/ui/button";

const options: Array<{ value: AnalyticsPeriod; en: string; de: string }> = [
  { value: "last5", en: "Last 5", de: "Letzte 5" },
  { value: "last10", en: "Last 10", de: "Letzte 10" },
  { value: "30d", en: "30 days", de: "30 Tage" },
  { value: "90d", en: "90 days", de: "90 Tage" },
  { value: "season", en: "Season", de: "Saison" },
  { value: "all", en: "All", de: "Gesamt" },
  { value: "custom", en: "Custom", de: "Benutzerdefiniert" }
];

export function PlayerPeriodControls({ playerId, tab, period, customFrom, customTo, locale }: {
  playerId: string;
  tab: PlayerHubTab;
  period: AnalyticsPeriod;
  customFrom?: string;
  customTo?: string;
  locale: "en" | "de";
}) {
  const router = useRouter();
  const copy = locale === "de" ? { period: "Zeitraum", from: "Von", to: "Bis", apply: "Anwenden" } : { period: "Period", from: "From", to: "To", apply: "Apply" };

  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <label className="block max-w-xs text-sm font-bold text-board-navy">
        {copy.period}
        <select
          value={period}
          onChange={(event) => router.push(periodHref(playerId, tab, event.target.value as AnalyticsPeriod))}
          className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option[locale]}</option>)}
        </select>
      </label>
      {period === "custom" ? (
        <form action={`/squad/players/${playerId}`} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-bold uppercase text-slate-500">{copy.from}<input name="from" type="date" defaultValue={customFrom ?? ""} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy" /></label>
          <label className="text-xs font-bold uppercase text-slate-500">{copy.to}<input name="to" type="date" defaultValue={customTo ?? ""} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy" /></label>
          <Button type="submit" variant="secondary" className="self-end">{copy.apply}</Button>
        </form>
      ) : null}
    </section>
  );
}

function periodHref(playerId: string, tab: PlayerHubTab, period: AnalyticsPeriod) {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (period !== "season") params.set("period", period);
  return `/squad/players/${playerId}${params.size ? `?${params}` : ""}`;
}
