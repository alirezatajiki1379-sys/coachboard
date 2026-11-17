import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { TrialInviteForm } from "@/components/scouting/forms";
import { ScoutingNav } from "@/components/scouting/scouting-nav";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { inviteScoutingPlayerToTrial, linkScoutingTarget, unlinkScoutingTarget } from "@/lib/scouting/actions";
import { scoutingCopy, scoutingStatuses } from "@/lib/scouting/copy";
import { asScoutingDb } from "@/lib/scouting/db";
import { getScoutingPlayer } from "@/lib/scouting/queries";
import { scoutingContext } from "@/lib/scouting/server";
import { calculateAge } from "@/lib/squad/format";
import { listSquads } from "@/lib/squad/squads";
import { CurrentCase, ObservationEvidence, ProspectContext } from "@/components/scouting/evidence";
import { readPipelineHistory } from "@/lib/scouting/workflow";

type Tab = "overview" | "observations" | "targets" | "history";

export default async function ScoutingPlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: requestedTab } = await searchParams;
  const tab: Tab = requestedTab === "observations" || requestedTab === "targets" || requestedTab === "history" ? requestedTab : "overview";
  const { db, userId, locale } = await scoutingContext();
  const [detail, teams] = await Promise.all([getScoutingPlayer(db, userId, id), listSquads(db, userId)]);
  if (!detail) notFound();
  const { player, observations, links, history, targets } = detail;
  const c = scoutingCopy(locale);
  const linkedIds = new Set(links.map((link) => link.target_id));
  const linkedTargets = targets.filter((target) => linkedIds.has(target.id));
  const availableTargets = targets.filter((target) => !linkedIds.has(target.id));
  const linkedSquadResult = player.linked_squad_player_id
    ? await asScoutingDb(db).from("squad_players").select("id,player_type").eq("user_id", userId).eq("id", player.linked_squad_player_id).maybeSingle()
    : null;
  if (linkedSquadResult?.error) throw new Error(linkedSquadResult.error.message);
  const linkedSquadPlayer = linkedSquadResult?.data;
  const name = [player.first_name, player.last_name].filter(Boolean).join(" ");
  const latest = observations[0];
  const nav = [
    { id: "overview", label: c.profileOverview },
    { id: "observations", label: c.observations },
    { id: "targets", label: c.targets },
    { id: "history", label: c.history }
  ] as const;
  return <PageContainer width="wide">
    <Link href="/scouting/players" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-green"><ArrowLeft className="h-4 w-4" />{c.players}</Link>
    <PageHeader eyebrow={c.scouting} title={name}
      actions={<div className="flex flex-wrap gap-2">
        <ButtonLink href={`/scouting/players/${id}/observations/new`}><Plus className="h-4 w-4" />{c.addObservation}</ButtonLink>
        <ButtonLink href={`/scouting/players/${id}/edit`} variant="secondary"><Pencil className="h-4 w-4" />{c.editPlayer}</ButtonLink>
      </div>} />
    <ProspectContext player={player} latest={latest} locale={locale} />
    <ScoutingNav locale={locale} active="players" />
    <nav className="flex flex-wrap gap-1 border-b border-board-line" aria-label={c.profileOverview}>
      {nav.map((item) => <Link key={item.id} href={`/scouting/players/${id}?tab=${item.id}`} aria-current={tab === item.id ? "page" : undefined}
        className={`border-b-2 px-3 py-3 text-sm font-bold ${tab === item.id ? "border-board-green text-board-navy" : "border-transparent text-slate-600"}`}>{item.label}</Link>)}
    </nav>
    {tab === "overview" ? <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <section className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
        <CurrentCase player={player} latest={latest} locale={locale} />
        <details><summary className="min-h-11 cursor-pointer py-3 font-bold text-board-navy">{c.facts}</summary>
        <div className="grid gap-3 border-y border-board-line py-4 sm:grid-cols-2">
          <Fact label={c.birthDate} value={formatDate(player.date_of_birth, locale) || c.unknown} />
          <Fact label={c.birthYear} value={player.birth_year?.toString() ?? player.date_of_birth?.slice(0, 4) ?? c.unknown} />
          <Fact label={c.shirtNumber} value={player.shirt_number || c.unknown} />
          <Fact label={c.age} value={calculateAge(player.date_of_birth ?? undefined)?.toString() ?? c.unknown} />
          <Fact label={c.position} value={player.primary_position ?? c.unknown} />
          <Fact label={c.secondaryPositions} value={player.secondary_positions.join(", ") || c.unknown} />
          <Fact label={c.foot} value={player.strong_foot ? c[player.strong_foot] : c.unknown} />
          <Fact label={c.club} value={player.current_club || c.unknown} />
          <Fact label={c.team} value={player.current_team || c.unknown} />
          <Fact label={c.source} value={player.source || c.unknown} />
          <Fact label={c.height} value={player.height_cm === null ? c.unknown : `${player.height_cm} cm`} />
          <Fact label={c.weight} value={player.weight_kg === null ? c.unknown : `${player.weight_kg} kg`} />
        </div>
        </details>
        {player.notes ? <div><h2 className="text-lg font-bold text-board-navy">{c.notes}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{player.notes}</p></div> : null}
      </section>
      <aside className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
        <div className="border-t border-board-line pt-4">
          <h2 className="font-bold text-board-navy">{c.linkedTargets}</h2>
          {linkedTargets.length ? <ul className="mt-2 space-y-2">{linkedTargets.map((target) => <li key={target.id}><Link href={`/scouting/targets/${target.id}`} className="text-sm font-semibold text-board-green hover:underline">{target.title}</Link></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{c.noLinkedPlayers}</p>}
        </div>
        {linkedSquadPlayer ? <div className="border-t border-board-line pt-4">
          <p className="text-sm font-semibold text-board-navy">{linkedSquadPlayer.player_type === "roster" ? c.added_to_squad : c.trial}</p>
          <Link href={`/squad/players/${linkedSquadPlayer.id}`} className="mt-2 inline-flex text-sm font-bold text-board-green underline">{c.squadProfile}</Link>
        </div> : <div className="border-t border-board-line pt-4">
          <h2 className="mb-3 font-bold text-board-navy">{c.inviteTrial}</h2>
          <TrialInviteForm action={inviteScoutingPlayerToTrial.bind(null, id)} teams={teams} locale={locale} />
        </div>}
      </aside>
    </div> : null}
    {tab === "observations" ? <section className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-board-navy">{c.observations} ({observations.length})</h2><ButtonLink href={`/scouting/players/${id}/observations/new`}><Plus className="h-4 w-4" />{c.addObservation}</ButtonLink></div>
      <ObservationEvidence observations={observations} playerId={id} locale={locale} />
    </section> : null}
    {tab === "targets" ? <section className="space-y-4">
      <h2 className="text-lg font-bold text-board-navy">{c.linkedTargets}</h2>
      {linkedTargets.length ? <div className="divide-y divide-board-line border-y border-board-line">
        {linkedTargets.map((target) => <div key={target.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <Link href={`/scouting/targets/${target.id}`} className="font-bold text-board-green hover:underline">{target.title}</Link>
          <form action={unlinkScoutingTarget}><input type="hidden" name="playerId" value={id} /><input type="hidden" name="targetId" value={target.id} />
            <button type="submit" className="min-h-10 rounded border border-board-line px-3 text-xs font-bold">{c.unlink}</button>
          </form>
        </div>)}
      </div> : <p className="text-sm text-slate-600">{c.noLinkedPlayers}</p>}
      {availableTargets.length ? <form action={linkScoutingTarget} className="flex flex-wrap gap-2">
        <input type="hidden" name="playerId" value={id} />
        <select name="targetId" required aria-label={c.target} defaultValue="" className="min-h-11 min-w-0 flex-1 rounded-md border border-board-line px-3 text-sm">
          <option value="">{c.target}</option>{availableTargets.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}
        </select>
        <button type="submit" className="min-h-11 rounded-md bg-board-navy px-4 text-sm font-bold text-white">{c.linkTarget}</button>
      </form> : null}
    </section> : null}
    {tab === "history" ? <section className="min-w-0 [overflow-wrap:anywhere]">
      <h2 className="text-lg font-bold text-board-navy">{c.scoutingHistory}</h2>
      {history.length ? <ol className="mt-3 divide-y divide-board-line border-y border-board-line">
        {history.map((entry) => {
          const transition = ["status_changed", "archived", "added_to_squad"].includes(entry.event_type) ? readPipelineHistory(entry.detail) : null;
          return <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
          <span className="min-w-0 font-semibold text-board-navy">{c[entry.event_type]}{transition ? <><span> · {c[transition.from]} → {c[transition.to]}</span>{transition.note ? <span className="mt-1 block whitespace-pre-wrap font-normal">{c.statusReason}: {transition.note}</span> : null}</> : entry.detail ? ` · ${["status_changed", "archived", "added_to_squad"].includes(entry.event_type) && scoutingStatuses.some((status) => status === entry.detail) ? c[entry.detail as keyof typeof c] : entry.detail}` : ""}</span>
          <time className="text-slate-600">{new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}</time>
        </li>;
        })}
      </ol> : <p className="mt-3 text-sm text-slate-600">{c.noHistory}</p>}
    </section> : null}
  </PageContainer>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs font-bold text-slate-600">{label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-board-navy">{value}</p></div>;
}
