"use client";

import { Archive, RotateCcw } from "lucide-react";
import { archiveSquadPlayer, restoreSquadPlayer } from "@/lib/squad/actions";
import { Button } from "@/components/ui/button";

export function PlayerActions({ playerId, archived }: { playerId: string; archived?: boolean }) {
  return (
    <form action={archived ? restoreSquadPlayer : archiveSquadPlayer}>
      <input type="hidden" name="playerId" value={playerId} />
      <Button
        type="submit"
        variant="secondary"
        className="h-9 px-3"
        onClick={(event) => {
          if (!archived && !window.confirm("Archive this player? You can restore them later.")) {
            event.preventDefault();
          }
        }}
      >
        {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        {archived ? "Restore" : "Archive"}
      </Button>
    </form>
  );
}
