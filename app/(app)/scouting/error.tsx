"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { scoutingCopy } from "@/lib/scouting/copy";

export default function ScoutingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useI18n();
  const copy = scoutingCopy(locale);
  useEffect(() => {
    console.error("Scouting route failed", error);
  }, [error]);
  return <section className="rounded-md border border-red-200 bg-red-50 p-5">
    <h1 className="text-xl font-bold text-red-900">{copy.loadError}</h1>
    <p className="mt-2 text-sm text-red-800">{copy.migrationHint}</p>
    <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-md bg-red-900 px-4 text-sm font-bold text-white">{copy.tryAgain}</button>
  </section>;
}
