"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { trainingNowParts } from "@/lib/trainings/utils";

type AvailabilityType = "injured" | "sick" | "school" | "work" | "holiday" | "private" | "other";

type PlayerUnavailabilityFormProps = {
  playerId: string;
  returnTo: string;
  compact?: boolean;
  locale: Locale;
  action: (formData: FormData) => void | Promise<void>;
};

const copy = {
  en: {
    type: "Type",
    from: "From",
    until: "Until",
    expectedReturn: "Expected return",
    description: "Description",
    notes: "Notes",
    saveAbsence: "Save absence",
    saveMedical: "Save medical period",
    descriptionPlaceholder: "Ankle sprain, flu...",
    notesPlaceholder: "School trip, family holiday...",
    options: {
      injured: "Injured",
      sick: "Sick",
      school: "School",
      work: "Work",
      holiday: "Holiday",
      private: "Private",
      other: "Other"
    }
  },
  de: {
    type: "Art / Grund",
    from: "Von",
    until: "Bis",
    expectedReturn: "Erwartete Rückkehr",
    description: "Beschreibung",
    notes: "Notizen",
    saveAbsence: "Abwesenheit speichern",
    saveMedical: "Medizinischen Zeitraum speichern",
    descriptionPlaceholder: "Sprunggelenk, Grippe...",
    notesPlaceholder: "Klassenfahrt, Familienurlaub...",
    options: {
      injured: "Verletzt",
      sick: "Krank",
      school: "Schule",
      work: "Arbeit",
      holiday: "Urlaub",
      private: "Privat",
      other: "Sonstiges"
    }
  }
} as const;

export function PlayerUnavailabilityForm({ playerId, returnTo, compact = false, locale, action }: PlayerUnavailabilityFormProps) {
  const labels = copy[locale];
  const today = useMemo(() => trainingNowParts().date, []);
  const [type, setType] = useState<AvailabilityType>("injured");
  const isMedical = type === "injured" || type === "sick";
  const spanClass = compact ? "sm:col-span-2" : "md:col-span-2";

  return (
    <form action={action} className={`mt-3 grid gap-3 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"}`}>
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="block text-sm font-medium text-slate-700">
        <span>{labels.type}</span>
        <select name="reason" value={type} onChange={(event) => setType(event.target.value as AvailabilityType)} className={fieldClass()}>
          {Object.entries(labels.options).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        <span>{labels.from}</span>
        <input name="startsOn" required type="date" defaultValue={today} className={fieldClass()} />
      </label>
      {isMedical ? (
        <>
          <label className="block text-sm font-medium text-slate-700">
            <span>{labels.expectedReturn}</span>
            <input name="expectedReturnDate" type="date" className={fieldClass()} />
          </label>
          <label className={`block text-sm font-medium text-slate-700 ${spanClass}`}>
            <span>{labels.description}</span>
            <input name="description" required placeholder={labels.descriptionPlaceholder} className={fieldClass()} />
          </label>
        </>
      ) : (
        <label className="block text-sm font-medium text-slate-700">
          <span>{labels.until}</span>
          <input name="endsOn" type="date" className={fieldClass()} />
        </label>
      )}
      <label className={`block text-sm font-medium text-slate-700 ${spanClass}`}>
        <span>{labels.notes}</span>
        <textarea name="note" rows={compact ? 2 : 3} placeholder={isMedical ? undefined : labels.notesPlaceholder} className={textareaClass()} />
      </label>
      <div className={spanClass}>
        <Button type="submit" variant="secondary">{isMedical ? labels.saveMedical : labels.saveAbsence}</Button>
      </div>
    </form>
  );
}

function fieldClass() {
  return "mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100";
}

function textareaClass() {
  return "mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100";
}
