"use client";

import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteSession, duplicateSession } from "@/lib/sessions/actions";

export function SessionActions({ sessionId, compact = false }: { sessionId: string; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={duplicateSession}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
          <Copy className="h-4 w-4" />
          {compact ? null : "Duplicate"}
        </Button>
      </form>
      <form
        action={deleteSession}
        onSubmit={(event) => {
          if (!window.confirm("Delete this training session? The original drills will stay in your library.")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <Button type="submit" variant="danger" className={compact ? "h-9 px-3" : undefined}>
          <Trash2 className="h-4 w-4" />
          {compact ? null : "Delete"}
        </Button>
      </form>
    </div>
  );
}
