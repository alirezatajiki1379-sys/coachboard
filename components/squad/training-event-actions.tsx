"use client";

import { Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { deleteTrainingEvent } from "@/lib/squad/attendance-actions";

export function TrainingEventActions({ eventId, attendanceCount = 0, compact = false }: { eventId: string; attendanceCount?: number; compact?: boolean }) {
  return (
    <div className="relative z-10 flex flex-wrap gap-2">
      <ButtonLink href={`/trainings/${eventId}/edit`} variant="secondary" className={compact ? "h-9 px-3" : "justify-center"}>
        Edit
      </ButtonLink>
      <form action={deleteTrainingEvent}>
        <input type="hidden" name="eventId" value={eventId} />
        <Button
          type="submit"
          variant="danger"
          className={compact ? "h-9 px-3" : "justify-center"}
          onClick={(event) => {
            const warning = attendanceCount
              ? `Delete this training? This removes ${attendanceCount} participant record${attendanceCount === 1 ? "" : "s"}, including attendance, ratings and notes for this training only. This cannot be undone.`
              : "Delete this training? This cannot be undone.";
            if (!window.confirm(warning)) event.preventDefault();
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </form>
    </div>
  );
}
