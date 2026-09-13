"use client";

import { Button } from "@/components/ui/button";

export function RouteError({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-900 shadow-soft">
      <p className="text-sm font-bold uppercase tracking-wide">Page could not be loaded · Seite konnte nicht geladen werden</p>
      <h2 className="mt-2 text-xl font-bold">Please try again · Bitte erneut versuchen</h2>
      <p className="mt-2 max-w-2xl text-sm text-red-800">
        The page data could not be loaded right now. Die Seitendaten konnten gerade nicht geladen werden.
      </p>
      <Button type="button" variant="secondary" className="mt-4" onClick={reset}>
        Retry · Erneut versuchen
      </Button>
    </section>
  );
}
