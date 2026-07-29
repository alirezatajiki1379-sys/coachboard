"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { deleteTrainingEvent, permanentlyDeleteTrainingEvent, restoreTrainingEvent } from "@/lib/squad/attendance-actions";

export function TrainingEventActions({ eventId, attendanceCount = 0, compact = false, isTrash = false, isRecurring = false }: { eventId: string; attendanceCount?: number; compact?: boolean; isTrash?: boolean; isRecurring?: boolean }) {
  const [editScopeOpen, setEditScopeOpen] = useState(false);
  const [trashScopeOpen, setTrashScopeOpen] = useState(false);

  if (isTrash) {
    return (
      <div className="relative z-10 flex flex-wrap gap-2">
        <form action={restoreTrainingEvent}>
          <input type="hidden" name="eventId" value={eventId} />
          <Button type="submit" variant="secondary" className={compact ? "h-9 px-3" : "justify-center"}>
            <RotateCcw className="h-4 w-4" />
            Restore
          </Button>
        </form>
        <form action={permanentlyDeleteTrainingEvent}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="confirmPermanent" value="DELETE" />
          <Button
            type="submit"
            variant="danger"
            className={compact ? "h-9 px-3" : "justify-center"}
            onClick={(event) => {
              const warning = attendanceCount
                ? `Permanently delete this training and ${attendanceCount} participant record${attendanceCount === 1 ? "" : "s"}? This cannot be undone.`
                : "Permanently delete this training? This cannot be undone.";
              if (!window.confirm(warning)) event.preventDefault();
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete permanently
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex flex-wrap gap-2">
      {isRecurring ? (
        <Button
          type="button"
          variant="secondary"
          className="h-10 w-10 justify-center px-0"
          aria-label="Edit training"
          title="Edit training"
          onClick={() => setEditScopeOpen(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : (
        <ButtonLink
          href={`/trainings/${eventId}/edit`}
          variant="secondary"
          className="h-10 w-10 justify-center px-0"
          aria-label="Edit training"
          title="Edit training"
        >
          <Pencil className="h-4 w-4" />
        </ButtonLink>
      )}
      <details className="relative">
        <summary className="flex h-10 cursor-pointer list-none items-center justify-center rounded-md border border-board-line bg-white px-3 text-sm font-bold text-board-navy transition hover:border-board-green hover:text-board-green" aria-label="More training actions">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">More</span>
        </summary>
        <div className="absolute right-0 top-12 z-30 w-56 rounded-lg border border-board-line bg-white p-2 shadow-xl">
          <Link href={`/trainings/${eventId}/plan`} className="block rounded-md px-3 py-2 text-sm font-bold text-board-navy hover:bg-green-50 hover:text-board-green">Open Training Plan</Link>
          <button type="button" onClick={() => setTrashScopeOpen(true)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
            Move to Trash
          </button>
        </div>
      </details>
      {editScopeOpen ? <EditScopeDialog eventId={eventId} onClose={() => setEditScopeOpen(false)} /> : null}
      {trashScopeOpen ? <TrashScopeDialog eventId={eventId} attendanceCount={attendanceCount} isRecurring={isRecurring} onClose={() => setTrashScopeOpen(false)} /> : null}
    </div>
  );
}

function EditScopeDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [scope, setScope] = useState("single");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="edit-training-scope-title">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 id="edit-training-scope-title" className="text-lg font-bold text-board-navy">Edit training</h2>
        <p className="mt-1 text-sm text-slate-600">Choose the scope for this recurring Training before opening the edit form.</p>
        <div className="mt-4 grid gap-2">
          <label className="rounded-md border border-board-line p-3 text-sm font-semibold text-board-navy">
            <input type="radio" value="single" checked={scope === "single"} onChange={() => setScope("single")} className="mr-2" />
            This Session only
          </label>
          <label className="rounded-md border border-board-line p-3 text-sm font-semibold text-board-navy">
            <input type="radio" value="future" checked={scope === "future"} onChange={() => setScope("future")} className="mr-2" />
            This and following Sessions
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href={`/trainings/${eventId}/edit?editScope=${scope}`} className="h-10 px-3">Continue</ButtonLink>
          <Button type="button" variant="ghost" className="h-10 px-3" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function TrashScopeDialog({ eventId, attendanceCount, isRecurring, onClose }: { eventId: string; attendanceCount: number; isRecurring: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="trash-training-scope-title">
      <form action={deleteTrainingEvent} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <input type="hidden" name="eventId" value={eventId} />
        <h2 id="trash-training-scope-title" className="text-lg font-bold text-board-navy">Move Training to Trash</h2>
        <p className="mt-1 text-sm text-slate-600">Training data is preserved and can be restored later.</p>
        {isRecurring ? (
          <div className="mt-4 grid gap-2">
            <label className="rounded-md border border-board-line p-3 text-sm font-semibold text-board-navy">
              <input type="radio" name="deleteScope" value="single" defaultChecked className="mr-2" />
              This Session only
            </label>
            <label className="rounded-md border border-board-line p-3 text-sm font-semibold text-board-navy">
              <input type="radio" name="deleteScope" value="future" className="mr-2" />
              This and following Sessions
            </label>
          </div>
        ) : (
          <input type="hidden" name="deleteScope" value="single" />
        )}
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {attendanceCount ? `${attendanceCount} participant record${attendanceCount === 1 ? "" : "s"} will stay connected to the Training in Trash.` : "This Training can be restored from Trash."}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="danger"
            className="h-10 px-3"
            onClick={(event) => {
              if (!window.confirm("Move this training to Trash?")) event.preventDefault();
            }}
          >
            <Trash2 className="h-4 w-4" />
            Move to Trash
          </Button>
          <Button type="button" variant="ghost" className="h-10 px-3" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
