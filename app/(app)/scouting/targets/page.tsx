import Link from "next/link";
import { Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingNav } from "@/components/scouting/scouting-nav";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { scoutingCopy, scoutingTargetStatuses } from "@/lib/scouting/copy";
import { getScoutingListData } from "@/lib/scouting/queries";
import { scoutingContext } from "@/lib/scouting/server";
import { listSquads } from "@/lib/squad/squads";

export default async function ScoutingTargetsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { db, userId, locale } = await scoutingContext();
  const c = scoutingCopy(locale);
  const { status = "active" } = await searchParams;
  const [data, teams] = await Promise.all([getScoutingListData(db, userId), listSquads(db, userId)]);
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const targets = data.targets.filter((target) => status === "all" || target.status === status);
  return <PageContainer width="wide">
    <PageHeader eyebrow={c.scouting} title={c.targets} description={c.targetSummary}
      actions={<ButtonLink href="/scouting/targets/new"><Plus className="h-4 w-4" />{c.createTarget}</ButtonLink>} />
    <ScoutingNav locale={locale} active="targets" />
    <div className="flex flex-wrap gap-2" aria-label={c.status}>
      {([...scoutingTargetStatuses, "all"] as const).map((value) => <Link key={value} href={`/scouting/targets?status=${value}`} aria-current={status === value ? "page" : undefined}
        className={`rounded-md border px-3 py-2 text-sm font-bold ${status === value ? "border-board-green bg-green-50 text-board-green" : "border-board-line text-slate-600"}`}>
        {value === "all" ? c.allStatuses : c[value]}
      </Link>)}
    </div>
    {!targets.length ? <p className="border-y border-board-line py-8 text-sm text-slate-600">{c.noTargets}</p> :
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {targets.map((target) => <Link key={target.id} href={`/scouting/targets/${target.id}`} className="rounded-md border border-board-line bg-white p-4 hover:border-board-green">
          <div className="flex items-start justify-between gap-2">
            <strong className="break-words text-board-navy">{target.title}</strong>
            <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-bold">{c[target.priority]}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{target.squad_id ? teamNames.get(target.squad_id) : c.none} · {target.positions.join(", ") || c.unknown}</p>
          <p className="mt-2 text-xs text-slate-600">{c.targetProspects}: {data.links.filter((link) => link.target_id === target.id).length}</p>
          {target.deadline ? <p className="mt-1 text-xs text-slate-600">{c.deadline}: {formatDate(target.deadline, locale)}</p> : null}
        </Link>)}
      </div>}
  </PageContainer>;
}
