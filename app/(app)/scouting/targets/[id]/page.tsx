import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingNav } from "@/components/scouting/scouting-nav";
import { ButtonLink } from "@/components/ui/button";
import { linkScoutingTarget, unlinkScoutingTarget } from "@/lib/scouting/actions";
import { formatDate } from "@/lib/i18n";
import { scoutingCopy } from "@/lib/scouting/copy";
import { getScoutingTarget } from "@/lib/scouting/queries";
import { scoutingContext } from "@/lib/scouting/server";
import { listSquads } from "@/lib/squad/squads";

export default async function ScoutingTargetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId, locale } = await scoutingContext();
  const [detail, teams] = await Promise.all([getScoutingTarget(db, userId, id), listSquads(db, userId)]);
  if (!detail) notFound();
  const { target, links, players } = detail;
  const c = scoutingCopy(locale);
  const linkedIds = new Set(links.map((link) => link.player_id));
  const linkedPlayers = players.filter((player) => linkedIds.has(player.id));
  const availablePlayers = players.filter((player) => !linkedIds.has(player.id));
  return <PageContainer width="wide">
    <PageHeader eyebrow={c.scouting} title={target.title} description={`${c[target.status]} · ${c[target.priority]}`}
      actions={<ButtonLink href={`/scouting/targets/${target.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" />{c.editTarget}</ButtonLink>} />
    <ScoutingNav locale={locale} active="targets" />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-board-navy">{c.targetProspects} ({linkedPlayers.length})</h2>
        {linkedPlayers.length ? <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-700">
          {(["identified", "monitoring", "shortlist", "trial"] as const).map((status) => <span key={status} className="rounded bg-slate-100 px-2 py-1">
            {c[status]}: {linkedPlayers.filter((player) => player.status === status).length}
          </span>)}
        </div> : null}
        {linkedPlayers.length ? <div className="divide-y divide-board-line border-y border-board-line">
          {linkedPlayers.map((player) => <div key={player.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <Link href={`/scouting/players/${player.id}`} className="font-bold text-board-green hover:underline">{player.first_name} {player.last_name}</Link>
              <p className="text-xs text-slate-600">{player.primary_position ?? c.unknown} · {c[player.status]}</p>
            </div>
            <form action={unlinkScoutingTarget}><input type="hidden" name="playerId" value={player.id} /><input type="hidden" name="targetId" value={target.id} />
              <button type="submit" className="min-h-10 rounded border border-board-line px-3 text-xs font-bold">{c.unlink}</button>
            </form>
          </div>)}
        </div> : <p className="text-sm text-slate-600">{c.noLinkedPlayers}</p>}
        {availablePlayers.length ? <form action={linkScoutingTarget} className="flex flex-wrap gap-2">
          <input type="hidden" name="targetId" value={target.id} />
          <select name="playerId" required aria-label={c.player} defaultValue="" className="min-h-11 min-w-0 flex-1 rounded-md border border-board-line px-3 text-sm">
            <option value="">{c.player}</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{player.first_name} {player.last_name}</option>)}
          </select>
          <button type="submit" className="min-h-11 rounded-md bg-board-navy px-4 text-sm font-bold text-white">{c.addToTarget}</button>
        </form> : null}
      </section>
      <aside className="space-y-3 border-t border-board-line pt-4 text-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <p><strong>{c.targetTeam}:</strong> {teams.find((team) => team.id === target.squad_id)?.name ?? c.none}</p>
        <p><strong>{c.positions}:</strong> {target.positions.join(", ") || c.unknown}</p>
        <p><strong>{c.fromYear} / {c.toYear}:</strong> {target.birth_year_from ?? "–"} / {target.birth_year_to ?? "–"}</p>
        <p><strong>{c.foot}:</strong> {target.preferred_foot ? c[target.preferred_foot] : c.none}</p>
        <p><strong>{c.targetNumber}:</strong> {target.target_number ?? c.unknown}</p>
        <p><strong>{c.deadline}:</strong> {formatDate(target.deadline, locale) || c.none}</p>
        {target.desired_profile ? <div><h3 className="font-bold">{c.desiredProfile}</h3><p className="mt-1 whitespace-pre-wrap text-slate-700">{target.desired_profile}</p></div> : null}
        {target.notes ? <div><h3 className="font-bold">{c.notes}</h3><p className="mt-1 whitespace-pre-wrap text-slate-700">{target.notes}</p></div> : null}
      </aside>
    </div>
  </PageContainer>;
}
