import Link from "next/link";
import { CalendarDays, Clock, Edit, Eye, Layers3, UsersRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SessionActions } from "@/components/sessions/session-actions";
import type { SessionSummary } from "@/lib/sessions/queries";

export function SessionCard({ session, view = "active" }: { session: SessionSummary; view?: "active" | "archived" | "trash" }) {
  const materialPreview = session.materialLabels.slice(0, 3);
  const moreMaterials = Math.max(0, session.materialLabels.length - materialPreview.length);

  return (
    <article className="group rounded-lg border border-board-line bg-white p-5 shadow-soft transition hover:border-board-green/40 hover:shadow-md">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <Link
          href={`/sessions/${session.id}`}
          className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-board-green/30"
          aria-label={`Open ${session.title}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase text-board-green">{session.mainFocus || "Training plan"}</p>
            {view === "archived" ? <StatusBadge label="Archived" /> : null}
            {view === "trash" ? <StatusBadge label="Trash" danger /> : null}
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-board-navy underline-offset-4 group-hover:text-board-green group-hover:underline">{session.title}</h2>
          {session.notes ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{session.notes}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-md bg-slate-100 px-2 py-1">{session.teamAgeGroup || "No team set"}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1">{session.drillCount} drills</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
              <Layers3 className="h-3.5 w-3.5" />
              {session.blockCount} block{session.blockCount === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
              <Clock className="h-3.5 w-3.5" />
              {session.totalDuration} min
            </span>
            {session.expectedPlayers ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <UsersRound className="h-3.5 w-3.5" />
                {session.expectedPlayers} players
              </span>
            ) : null}
            {session.date ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {session.date}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            {materialPreview.length ? (
              <>
                {materialPreview.map((label) => (
                  <span key={label} className="rounded-full bg-green-50 px-2 py-1 text-board-green">{label}</span>
                ))}
                {moreMaterials ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">+{moreMaterials} more</span> : null}
              </>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">No materials</span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">Updated {formatShortDate(session.updatedAt)}</span>
          </div>
        </Link>
        <div className="relative z-10 flex flex-wrap gap-2">
          <ButtonLink href={`/sessions/${session.id}`} variant="secondary" className="h-9 justify-center px-3">
            <Eye className="h-4 w-4" />
            View
          </ButtonLink>
          {view !== "trash" ? <ButtonLink href={`/sessions/${session.id}/edit`} variant="secondary" className="h-9 justify-center px-3">
            <Edit className="h-4 w-4" />
            Edit
          </ButtonLink> : null}
          <SessionActions sessionId={session.id} view={view} compact />
        </div>
      </div>
    </article>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatusBadge({ label, danger = false }: { label: string; danger?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${danger ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
      {label}
    </span>
  );
}
