"use client";

import { useActionState, useState } from "react";
import { Copy, Star, Trash2 } from "lucide-react";
import { deleteDrill, duplicateDrill, toggleFavorite } from "@/lib/drills/actions";
import { Button } from "@/components/ui/button";

type DrillActionsProps = {
  drillId: string;
  isFavorite: boolean;
  compact?: boolean;
};

export function DrillActions({ drillId, isFavorite, compact = false }: DrillActionsProps) {
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteDrill, {});
  const [deleteCancelled, setDeleteCancelled] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <form action={toggleFavorite}>
        <input type="hidden" name="drillId" value={drillId} />
        <input type="hidden" name="nextFavorite" value={String(!isFavorite)} />
        <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
          <Star className={isFavorite ? "h-4 w-4 fill-board-green text-board-green" : "h-4 w-4"} />
          {compact ? null : isFavorite ? "Unfavorite" : "Favorite"}
        </Button>
      </form>

      <form action={duplicateDrill}>
        <input type="hidden" name="drillId" value={drillId} />
        <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
          <Copy className="h-4 w-4" />
          {compact ? null : "Duplicate"}
        </Button>
      </form>

      <form
        action={deleteAction}
        onSubmit={(event) => {
          setDeleteCancelled(false);
          if (!window.confirm("Delete this drill? This cannot be undone.")) {
            event.preventDefault();
            setDeleteCancelled(true);
          }
        }}
      >
        <input type="hidden" name="drillId" value={drillId} />
        <Button type="submit" variant="danger" className={compact ? "h-9 px-3" : undefined} disabled={isDeleting}>
          <Trash2 className="h-4 w-4" />
          {compact ? null : "Delete"}
        </Button>
      </form>
      {deleteState.error && !deleteCancelled ? (
        <p className="basis-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
          {deleteState.error}
        </p>
      ) : null}
    </div>
  );
}
