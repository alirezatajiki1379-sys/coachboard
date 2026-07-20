"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { deleteTrainingEvent, permanentlyDeleteTrainingEvent, restoreTrainingEvent } from "@/lib/squad/attendance-actions";

export function TrainingEventActions({ eventId, attendanceCount = 0, compact = false, isTrash = false, isRecurring = false }: { eventId: string; attendanceCount?: number; compact?: boolean; isTrash?: boolean; isRecurring?: boolean }) {
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
      <ButtonLink href={`/trainings/${eventId}/edit`} variant="secondary" className={compact ? "h-9 px-3" : "justify-center"}>
        Edit
      </ButtonLink>
      <form action={deleteTrainingEvent}>
        <input type="hidden" name="eventId" value={eventId} />
        {isRecurring ? (
          <label className="block">
            <span className="sr-only">Delete scope</span>
            <select name="deleteScope" defaultValue="single" className="h-9 rounded-md border border-board-line bg-white px-2 text-xs font-semibold text-board-navy">
              <option value="single">This Session only</option>
              <option value="future">This and following Sessions</option>
            </select>
          </label>
        ) : null}
        <Button
          type="submit"
          variant="danger"
          className={compact ? "h-9 px-3" : "justify-center"}
          onClick={(event) => {
            const warning = attendanceCount
              ? `Move this training to Trash? ${attendanceCount} participant record${attendanceCount === 1 ? "" : "s"} will be preserved and can be restored with the training.${isRecurring ? " Recurring trainings default to this Session only." : ""}`
              : "Move this training to Trash? You can restore it later.";
            if (!window.confirm(warning)) event.preventDefault();
          }}
        >
          <Trash2 className="h-4 w-4" />
          Move to Trash
        </Button>
      </form>
    </div>
  );
}
