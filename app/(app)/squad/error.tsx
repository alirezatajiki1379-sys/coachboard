"use client";

import { Button } from "@/components/ui/button";

export default function SquadError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-100 bg-white p-6 shadow-soft">
      <p className="text-sm font-semibold uppercase text-red-700">Coach Workspace</p>
      <h1 className="mt-2 text-2xl font-bold text-board-navy">The squad workspace could not be loaded</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        CoachBoard kept your data unchanged. Try again, or verify the latest Supabase schema if this happens after a new deployment.
      </p>
      <Button type="button" onClick={reset} className="mt-5">Try again</Button>
    </div>
  );
}
