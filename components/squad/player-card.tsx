import { CalendarDays, Footprints, Mail, Phone, UserRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PlayerActions } from "@/components/squad/player-actions";
import type { SquadPlayer } from "@/types/domain";

function fullName(player: SquadPlayer) {
  return `${player.firstName} ${player.lastName}`.trim();
}

export function PlayerCard({ player, view }: { player: SquadPlayer; view: "active" | "archived" }) {
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-board-green">{player.position || "Squad player"}</p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-board-navy">{fullName(player)}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            {player.dateOfBirth ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-3.5 w-3.5" />{player.dateOfBirth}</span> : null}
            {player.strongFoot ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><Footprints className="h-3.5 w-3.5" />{player.strongFoot}</span> : null}
            {player.club ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><UserRound className="h-3.5 w-3.5" />{player.club}</span> : null}
          </div>
        </div>
        {player.archivedAt ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Archived</span> : null}
      </div>

      <div className="mt-4 space-y-1 text-sm text-slate-600">
        {player.playerPhone ? <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{player.playerPhone}</p> : null}
        {player.parentEmail ? <p className="flex items-center gap-2"><Mail className="h-4 w-4" />{player.parentEmail}</p> : null}
        {!player.playerPhone && !player.parentEmail ? <p className="text-slate-500">No contact details yet.</p> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href={`/squad/players/${player.id}`} variant="secondary" className="h-9 px-3">
          View
        </ButtonLink>
        {view === "active" ? (
          <ButtonLink href={`/squad/players/${player.id}/edit`} variant="secondary" className="h-9 px-3">
            Edit
          </ButtonLink>
        ) : null}
        <PlayerActions playerId={player.id} archived={view === "archived"} />
      </div>
    </article>
  );
}
