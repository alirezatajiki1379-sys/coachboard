"use client";

import { useActionState, useState, useTransition } from "react";
import { Archive, Copy, RotateCcw, Star, Trash2 } from "lucide-react";
import { archiveDrill, deleteDrill, duplicateDrill, permanentlyDeleteDrill, restoreDrill, toggleFavorite } from "@/lib/drills/actions";
import { Button } from "@/components/ui/button";

type DrillActionsProps = {
  drillId: string;
  isFavorite: boolean;
  view?: "active" | "published" | "drafts" | "archived" | "trash";
  compact?: boolean;
  isDraft?: boolean;
};

export function DrillActions({ drillId, isFavorite, view = "active", compact = false, isDraft = false }: DrillActionsProps) {
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteDrill, {});
  const [permanentDeleteState, permanentDeleteAction, isPermanentlyDeleting] = useActionState(permanentlyDeleteDrill, {});
  const [deleteCancelled, setDeleteCancelled] = useState(false);
  const [favorite, setFavorite] = useState(isFavorite);
  const [favoriteError, setFavoriteError] = useState("");
  const [isFavoritePending, startFavoriteTransition] = useTransition();

  function handleFavoriteToggle() {
    const nextFavorite = !favorite;
    setFavorite(nextFavorite);
    setFavoriteError("");
    startFavoriteTransition(async () => {
      const formData = new FormData();
      formData.set("drillId", drillId);
      formData.set("nextFavorite", String(nextFavorite));
      const result = await toggleFavorite(formData);
      if (result?.error) {
        setFavorite(!nextFavorite);
        setFavoriteError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {view === "active" || view === "published" || view === "drafts" ? (
        <Button
          type="button"
          variant="secondary"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          className={compact ? "h-9 px-3" : undefined}
          disabled={isFavoritePending}
          onClick={handleFavoriteToggle}
        >
          <Star className={favorite ? "h-4 w-4 fill-board-green text-board-green" : "h-4 w-4"} />
          {compact ? null : favorite ? "Unfavorite" : "Favorite"}
        </Button>
      ) : null}

      {view !== "trash" ? <form action={duplicateDrill}>
        <input type="hidden" name="drillId" value={drillId} />
        <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
          <Copy className="h-4 w-4" />
          {compact ? null : "Duplicate"}
        </Button>
      </form> : null}

      {view === "active" || view === "published" || view === "drafts" ? (
        <form action={archiveDrill}>
          <input type="hidden" name="drillId" value={drillId} />
          <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
            <Archive className="h-4 w-4" />
            {compact ? null : "Archive"}
          </Button>
        </form>
      ) : null}

      {view === "archived" || view === "trash" ? (
        <form action={restoreDrill}>
          <input type="hidden" name="drillId" value={drillId} />
          <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : undefined}>
            <RotateCcw className="h-4 w-4" />
            {compact ? null : "Restore"}
          </Button>
        </form>
      ) : null}

      {view !== "trash" ? <form
        action={deleteAction}
        onSubmit={(event) => {
          setDeleteCancelled(false);
          if (!window.confirm(isDraft ? "Delete reusable Drill draft? This moves the draft to Trash. Existing Session copies remain unchanged." : "Move this drill to Trash? You can restore it later.")) {
            event.preventDefault();
            setDeleteCancelled(true);
          }
        }}
      >
        <input type="hidden" name="drillId" value={drillId} />
        <Button type="submit" variant="danger" className={compact ? "h-9 px-3" : undefined} disabled={isDeleting}>
          <Trash2 className="h-4 w-4" />
          {compact ? null : isDraft ? "Delete draft" : "Move to Trash"}
        </Button>
      </form> : null}
      {view === "trash" ? (
        <form
          action={permanentDeleteAction}
          onSubmit={(event) => {
            setDeleteCancelled(false);
            if (!window.confirm("Delete this drill permanently? This cannot be undone.")) {
              event.preventDefault();
              setDeleteCancelled(true);
            }
          }}
        >
          <input type="hidden" name="drillId" value={drillId} />
          <Button type="submit" variant="danger" className={compact ? "h-9 px-3" : undefined} disabled={isPermanentlyDeleting}>
            <Trash2 className="h-4 w-4" />
            {compact ? null : "Delete permanently"}
          </Button>
        </form>
      ) : null}
      {deleteState.error && !deleteCancelled ? (
        <p className="basis-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
          {deleteState.error}
        </p>
      ) : null}
      {permanentDeleteState.error && !deleteCancelled ? (
        <p className="basis-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
          {permanentDeleteState.error}
        </p>
      ) : null}
      {favoriteError ? (
        <p className="basis-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
          {favoriteError}
        </p>
      ) : null}
    </div>
  );
}
