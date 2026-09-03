"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { permanentlyDeleteTeam } from "@/lib/squad/team-actions";

type TeamDeleteFormProps = {
  teamId: string;
  teamName: string;
  returnTo: string;
  compact?: boolean;
};

export function TeamDeleteForm({ teamId, teamName, returnTo, compact = false }: TeamDeleteFormProps) {
  const [confirmation, setConfirmation] = useState("");
  const matches = confirmation === teamName;

  return (
    <form action={permanentlyDeleteTeam} className={compact ? "space-y-2" : "rounded-lg border border-red-200 bg-red-50 p-4"}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {!compact ? (
        <>
          <h3 className="flex items-center gap-2 font-bold text-red-800">
            <Trash2 className="h-4 w-4" />
            Delete Team?
          </h3>
          <p className="mt-2 text-sm text-red-700">
            This permanently deletes this Team and its Team-specific players, trainings, attendance, ratings, planner data and calendar exclusions. Shared drills, drill templates and global coach settings are preserved.
          </p>
        </>
      ) : null}
      <label className="mt-3 block">
        <span className="text-xs font-bold uppercase tracking-wide text-red-800">Type &quot;{teamName}&quot; to confirm</span>
        <input
          name="confirmationName"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          className="mt-1 h-10 w-full rounded-md border border-red-200 bg-white px-3 text-sm text-board-navy outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
        />
      </label>
      <DeleteSubmit disabled={!matches} compact={compact} />
    </form>
  );
}

function DeleteSubmit({ disabled, compact }: { disabled: boolean; compact: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={disabled || pending} className={compact ? "h-9 w-full px-3 text-xs sm:w-auto" : "mt-3 w-full sm:w-auto"}>
      <Trash2 className="h-4 w-4" />
      {pending ? "Deleting..." : "Delete Team permanently"}
    </Button>
  );
}
