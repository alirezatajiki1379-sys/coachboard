import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePlayerHeaderPreferences } from "@/lib/squad/player-hub-actions";
import type { PlayerHeaderPreferences } from "@/types/domain";

export function PlayerHeaderPreferences({ playerId, preferences, locale }: {
  playerId: string;
  preferences: PlayerHeaderPreferences;
  locale: "en" | "de";
}) {
  const copy = locale === "de"
    ? { title: "Darstellung", help: "Zusätzliche Angaben im kompakten Profilkopf anzeigen.", height: "Größe", weight: "Gewicht", jersey: "Trikotnummer", captain: "Kapitän", joined: "Eintritt", last: "Letztes Training", save: "Darstellung speichern" }
    : { title: "Display", help: "Choose additional details for the compact player header.", height: "Height", weight: "Weight", jersey: "Jersey number", captain: "Captain", joined: "Joined", last: "Last training", save: "Save display" };
  const options: Array<[keyof PlayerHeaderPreferences, string]> = [
    ["showHeight", copy.height],
    ["showWeight", copy.weight],
    ["showJerseyNumber", copy.jersey],
    ["showCaptain", copy.captain],
    ["showJoinedDate", copy.joined],
    ["showLastTraining", copy.last]
  ];

  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><SlidersHorizontal className="h-5 w-5" />{copy.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{copy.help}</p>
      <form action={savePlayerHeaderPreferences} className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <input type="hidden" name="playerId" value={playerId} />
        <input type="hidden" name="returnTo" value={`/squad/players/${playerId}?tab=details`} />
        {options.map(([name, label]) => (
          <label key={name} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-slate-50 px-3">
            <input name={name} type="checkbox" defaultChecked={preferences[name]} className="h-4 w-4" />
            {label}
          </label>
        ))}
        <Button type="submit" variant="secondary" className="min-h-11">{copy.save}</Button>
      </form>
    </section>
  );
}
