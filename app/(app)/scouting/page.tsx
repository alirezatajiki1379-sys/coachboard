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

export default async function ScoutingOverviewPage() {
  const { db, userId, locale } = await scoutingContext();
  const copy = scoutingCopy(locale);
  const data = await getScoutingListData(db, userId);
  const today = trainingNowParts().date;
  const activePlayers = data.players.filter((player) => player.status !== "archived" && player.status !== "added_to_squad");
  const followUps = activePlayers.filter((player) => player.next_action_date && player.next_action_date <= today && player.next_action && player.next_action !== "none");
  const dueTargets = data.targets.filter((target) => target.status === "active" && target.deadline && target.deadline <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
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
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label={copy.overview}>
        {stats.map((stat) => <Link key={stat.label} href={stat.href} className="rounded-md border border-board-line bg-white p-4 hover:border-board-green">
          <span className="block text-xs font-semibold text-slate-600">{stat.label}</span>
          <strong className="mt-2 block text-2xl text-board-navy">{stat.value}</strong>
        </Link>)}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold text-board-navy">{copy.followUpsDue}</h2>
          {followUps.length ? <div className="divide-y divide-board-line border-y border-board-line">
            {followUps.slice(0, 8).map((player) => <Link key={player.id} href={`/scouting/players/${player.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-board-green">
              <span className="min-w-0 font-semibold">{player.first_name} {player.last_name}</span>
              <span className="shrink-0 text-slate-600">{formatDate(player.next_action_date, locale)}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>)}
          </div> : <p className="text-sm text-slate-600">{copy.none}</p>}
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
    </PageContainer>
  );
}
