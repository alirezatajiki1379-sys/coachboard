"use client";

import { Button } from "@/components/ui/button";
import { useSystemText } from "@/components/i18n/use-system-text";

export default function ActionsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ui = useSystemText();
  return (
    <div className="rounded-lg border border-red-100 bg-white p-6 shadow-soft">
      <p className="text-sm font-semibold uppercase text-red-700">{ui("Action Center")}</p>
      <h1 className="mt-2 text-2xl font-bold text-board-navy">{ui("Coaching actions could not be loaded")}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        {ui("The current list is unavailable. Your player data was not changed. Try again, or check that the latest Supabase SQL has been applied.")}
      </p>
      <Button type="button" onClick={reset} className="mt-5">{ui("Try again")}</Button>
    </div>
  );
}
