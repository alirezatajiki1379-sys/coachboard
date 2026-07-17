"use client";

import { Archive, Copy, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveSession, deleteSession, duplicateSession, permanentlyDeleteSession, restoreSession } from "@/lib/sessions/actions";

export function SessionActions({ sessionId, view = "active", compact = false }: { sessionId: string; view?: "active" | "archived" | "trash"; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {view !== "trash" ? <form action={duplicateSession}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
          <Copy className="h-4 w-4" />
          {compact ? null : "Duplicate"}
        </Button>
      </form> : null}
      {view === "active" ? (
        <form action={archiveSession}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
            <Archive className="h-4 w-4" />
            {compact ? null : "Archive"}
          </Button>
        </form>
      ) : null}
      {view === "archived" || view === "trash" ? (
        <form action={restoreSession}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
            <RotateCcw className="h-4 w-4" />
            {compact ? null : "Restore"}
          </Button>
        </form>
      ) : null}
      {view !== "trash" ? <form
        action={deleteSession}
        onSubmit={(event) => {
          if (!window.confirm("Move this training session to Trash? The original drills will stay in your library.")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <Button type="submit" variant="danger" className={compact ? "h-9 px-3" : undefined}>
          <Trash2 className="h-4 w-4" />
          {compact ? null : "Move to Trash"}
        </Button>
      </form> : null}
      {view === "trash" ? (
        <form
          action={permanentlyDeleteSession}
          onSubmit={(event) => {
            if (!window.confirm("Delete this training session permanently? This cannot be undone. Original drills will stay in your library.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <Button type="submit" variant="danger" className={compact ? "h-9 px-3" : undefined}>
            <Trash2 className="h-4 w-4" />
            {compact ? null : "Delete permanently"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
