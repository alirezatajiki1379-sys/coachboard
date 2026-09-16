"use client";

import { useEffect, useState } from "react";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { normalizeLocale, type Locale } from "@/lib/i18n";

export function RouteError({ reset }: { reset: () => void }) {
  const i18n = useOptionalI18n();
  const [documentLocale, setDocumentLocale] = useState<Locale>("en");
  useEffect(() => {
    setDocumentLocale(normalizeLocale(document.documentElement.lang) ?? "en");
  }, []);
  const locale = i18n?.locale ?? documentLocale;
  const copy = routeErrorCopy[locale];

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-900 shadow-soft">
      <p className="text-sm font-bold uppercase tracking-wide">{copy.eyebrow}</p>
      <h2 className="mt-2 text-xl font-bold">{copy.title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-red-800">
        {copy.description}
      </p>
      <Button type="button" variant="secondary" className="mt-4" onClick={reset}>
        {copy.retry}
      </Button>
    </section>
  );
}

const routeErrorCopy = {
  en: {
    eyebrow: "Page could not be loaded",
    title: "Please try again",
    description: "The page data could not be loaded right now.",
    retry: "Retry"
  },
  de: {
    eyebrow: "Seite konnte nicht geladen werden",
    title: "Bitte erneut versuchen",
    description: "Die Seitendaten konnten gerade nicht geladen werden.",
    retry: "Erneut versuchen"
  }
} as const;
