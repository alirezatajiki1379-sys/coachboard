import { CalendarDays, Clock, Edit, Eye } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SessionActions } from "@/components/sessions/session-actions";
import type { SessionSummary } from "@/lib/sessions/queries";

export function SessionCard({ session }: { session: SessionSummary }) {
  return (
    <article className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase text-board-green">{session.mainFocus || "Session plan"}</p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-board-navy">{session.title}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-md bg-slate-100 px-2 py-1">{session.teamAgeGroup || "No team set"}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1">{session.drillCount} drills</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
              <Clock className="h-3.5 w-3.5" />
              {session.totalDuration} min
            </span>
            {session.date ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {session.date}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/sessions/${session.id}`} variant="secondary" className="h-9 justify-center px-3">
            <Eye className="h-4 w-4" />
            View
          </ButtonLink>
          <ButtonLink href={`/sessions/${session.id}/edit`} variant="secondary" className="h-9 justify-center px-3">
            <Edit className="h-4 w-4" />
            Edit
          </ButtonLink>
          <SessionActions sessionId={session.id} compact />
        </div>
      </div>
    </article>
  );
}
