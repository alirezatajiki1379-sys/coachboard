"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function SquadError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("squad_workspace_render_failed", error);
  }, [error]);

  const language = typeof document !== "undefined" ? document.documentElement.lang : "";
  const isGerman = language.toLowerCase().startsWith("de") || (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("de"));

  return (
    <div className="rounded-lg border border-red-100 bg-white p-6 shadow-soft">
      <p className="text-sm font-semibold uppercase text-red-700">{isGerman ? "Trainerbereich" : "Coach Workspace"}</p>
      <h1 className="mt-2 text-2xl font-bold text-board-navy">
        {isGerman ? "Der Kaderbereich konnte nicht geladen werden" : "The squad workspace could not be loaded"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        {isGerman
          ? "Deine Daten wurden nicht verändert. Versuche es erneut. Wenn das Problem nach einem Update bleibt, prüfe bitte die Server-Logs."
          : "Your data was not changed. Try again. If this keeps happening after an update, check the server logs."}
      </p>
      <Button type="button" onClick={reset} className="mt-5">{isGerman ? "Erneut versuchen" : "Try again"}</Button>
    </div>
  );
}
