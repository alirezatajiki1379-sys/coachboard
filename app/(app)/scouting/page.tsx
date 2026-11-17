import Link from "next/link";
import { ArrowRight, Plus, UserRoundSearch } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingNav } from "@/components/scouting/scouting-nav";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { scoutingCopy } from "@/lib/scouting/copy";
import { getScoutingListData } from "@/lib/scouting/queries";
import { scoutingContext } from "@/lib/scouting/server";
import { trainingNowParts } from "@/lib/trainings/utils";
import { scoutingAttention } from "@/lib/scouting/workflow";
import { ObservationLink, ProspectContext, ScoutingFact } from "@/components/scouting/evidence";

export default async function ScoutingOverviewPage() {
  const { db, userId, locale } = await scoutingContext();
  const copy = scoutingCopy(locale);
  const data = await getScoutingListData(db, userId);
  const today = trainingNowParts().date;
  const activePlayers = data.players.filter((player) => player.status !== "archived" && player.status !== "added_to_squad");
  const followUps = activePlayers.filter((player) => data.followUpDates[player.id] && data.followUpDates[player.id]! <= today)
    .sort((a, b) => data.followUpDates[a.id]!.localeCompare(data.followUpDates[b.id]!));
  const dueTargets = data.targets.filter((target) => target.status === "active" && target.deadline && target.deadline <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const tasks = activePlayers.filter((player) => scoutingAttention(player, data.latestObservations[player.id], today).length)
    .sort((a, b) => {
      const aDue = Boolean(data.followUpDates[a.id] && data.followUpDates[a.id]! <= today);
      const bDue = Boolean(data.followUpDates[b.id] && data.followUpDates[b.id]! <= today);
      return Number(bDue) - Number(aDue) || (data.followUpDates[a.id] ?? "9999").localeCompare(data.followUpDates[b.id] ?? "9999");
    });
  const stats = [
    { label: copy.activeProspects, value: activePlayers.length, href: "/scouting/players" },
    { label: copy.shortlisted, value: activePlayers.filter((player) => player.status === "shortlist").length, href: "/scouting/players?status=shortlist" },
    { label: copy.observedRecently, value: data.recentlyObservedIds.filter((id) => activePlayers.some((player) => player.id === id)).length, href: "/scouting/players?sort=recent" },
    { label: copy.openTargets, value: data.targets.filter((target) => target.status === "active").length, href: "/scouting/targets?status=active" },
    { label: copy.followUpsDue, value: followUps.length, href: "/scouting/players?due=1" }
  ];
  return (
    <PageContainer width="wide">
      <PageHeader eyebrow={copy.scouting} title={copy.overview} description={copy.overviewHint}
        actions={<div className="flex flex-wrap gap-2">
          <ButtonLink href="/scouting/players/new"><Plus className="h-4 w-4" />{copy.addPlayer}</ButtonLink>
          <ButtonLink href="/scouting/targets/new" variant="secondary"><UserRoundSearch className="h-4 w-4" />{copy.createTarget}</ButtonLink>
        </div>} />
      <ScoutingNav locale={locale} active="overview" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-bold text-board-navy">{copy.nextTasks} ({tasks.length})</h2>
          {tasks.length ? <div className="divide-y divide-board-line border-y border-board-line">
            {tasks.map((player) => {
              const latest = data.latestObservations[player.id];
              return <article key={player.id} className="min-w-0 space-y-3 py-4 [overflow-wrap:anywhere]">
                <Link href={`/scouting/players/${player.id}`} className="inline-flex min-h-11 items-center font-bold text-board-green hover:underline">{player.first_name} {player.last_name}</Link>
                <ProspectContext player={player} latest={latest} locale={locale} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {latest?.next_focus ? <ScoutingFact label={copy.nextFocus} value={latest.next_focus} /> : null}
                  {latest?.open_questions ? <ScoutingFact label={copy.openQuestions} value={latest.open_questions} /> : null}
                </div>
                {latest?.next_action ? <ScoutingFact label={copy.nextAction} value={latest.next_action} /> : null}
                {player.next_action && player.next_action !== "none" ? <ScoutingFact label={copy.nextAction} value={copy[player.next_action]} /> : null}
                <div className="flex flex-wrap gap-x-5 gap-y-1"><ObservationLink id={player.id} locale={locale} /><Link href={`/scouting/players/${player.id}/edit`} className="inline-flex min-h-11 items-center text-sm text-slate-600 hover:underline">{copy.editPlayer}</Link></div>
              </article>;
            })}
          </div> : <p className="text-sm text-slate-600">{copy.noTasks}</p>}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold text-board-navy">{copy.dueSoon}</h2>
          {dueTargets.length ? <div className="divide-y divide-board-line border-y border-board-line">
            {dueTargets.slice(0, 8).map((target) => <Link key={target.id} href={`/scouting/targets/${target.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-board-green">
              <span className="min-w-0 font-semibold">{target.title}</span>
              <span className="shrink-0 text-slate-600">{formatDate(target.deadline, locale)}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>)}
          </div> : <p className="text-sm text-slate-600">{copy.none}</p>}
        </section>
      </div>
      <section className="flex flex-wrap gap-x-6 gap-y-2 border-b border-board-line pb-3" aria-label={copy.overview}>
        {stats.map((stat) => <Link key={stat.label} href={stat.href} className="inline-flex min-h-11 items-center gap-2 text-sm hover:text-board-green">
          <span className="text-slate-600">{stat.label}</span>
          <strong className="tabular-nums text-board-navy">{stat.value}</strong>
        </Link>)}
      </section>
    </PageContainer>
  );
}
