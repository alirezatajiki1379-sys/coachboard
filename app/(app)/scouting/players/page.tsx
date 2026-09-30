import Link from "next/link";
import { Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingNav } from "@/components/scouting/scouting-nav";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { scoutingCopy, scoutingPriorities, scoutingStatuses } from "@/lib/scouting/copy";
import { getScoutingListData } from "@/lib/scouting/queries";
import { scoutingContext } from "@/lib/scouting/server";
import { calculateAge } from "@/lib/squad/format";
import { canonicalPositionLabels } from "@/lib/squad/positions";
import { trainingNowParts } from "@/lib/trainings/utils";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function param(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }
const priorityOrder = { high: 0, medium: 1, low: 2 };

export default async function ScoutingPlayersPage({ searchParams }: Props) {
  const { db, userId, locale } = await scoutingContext();
  const copy = scoutingCopy(locale);
  const params = await searchParams;
  const data = await getScoutingListData(db, userId);
  const query = param(params.q).trim().toLocaleLowerCase(locale);
  const status = param(params.status);
  const position = param(params.position);
  const age = Number(param(params.age));
  const foot = param(params.foot);
  const club = param(params.club);
  const priority = param(params.priority);
  const targetId = param(params.target);
  const sort = param(params.sort);
  const due = param(params.due) === "1";
  const today = trainingNowParts().date;
  const linkedIds = new Set(data.links.filter((link) => link.target_id === targetId).map((link) => link.player_id));
  const clubs = [...new Set(data.players.map((player) => player.current_club).filter((value): value is string => Boolean(value)))].sort();
  const positions = [...new Set(data.players.flatMap((player) => [player.primary_position, ...player.secondary_positions]).filter((value): value is string => Boolean(value)))].sort();
  const players = data.players.filter((player) => {
    const playerAge = calculateAge(player.date_of_birth ?? undefined);
    return (!query || `${player.first_name} ${player.last_name ?? ""} ${player.current_club ?? ""}`.toLocaleLowerCase(locale).includes(query))
      && (!status ? player.status !== "archived" : status === "all" || player.status === status)
      && (!position || player.primary_position === position || player.secondary_positions.includes(position))
      && (!param(params.age) || playerAge === age)
      && (!foot || player.strong_foot === foot)
      && (!club || player.current_club === club)
      && (!priority || player.priority === priority)
      && (!targetId || linkedIds.has(player.id))
      && (!due || Boolean(player.next_action_date && player.next_action_date <= today && player.next_action !== "none"));
  }).sort((a, b) => {
    if (sort === "age") return (calculateAge(a.date_of_birth ?? undefined) ?? 999) - (calculateAge(b.date_of_birth ?? undefined) ?? 999);
    if (sort === "recent") return (data.lastObserved[b.id] ?? "").localeCompare(data.lastObserved[a.id] ?? "");
    if (sort === "priority") return priorityOrder[a.priority] - priorityOrder[b.priority];
    return `${a.last_name ?? ""} ${a.first_name}`.localeCompare(`${b.last_name ?? ""} ${b.first_name}`, locale);
  });
  const targetById = new Map(data.targets.map((target) => [target.id, target]));
  const playerTarget = (id: string) => data.links.filter((link) => link.player_id === id).map((link) => targetById.get(link.target_id)?.title).filter(Boolean).join(", ");
  const input = "min-h-10 min-w-0 rounded-md border border-board-line bg-white px-2 text-sm";
  return <PageContainer width="wide">
    <PageHeader eyebrow={copy.scouting} title={copy.players} description={`${players.length} / ${data.players.length}`}
      actions={<ButtonLink href="/scouting/players/new"><Plus className="h-4 w-4" />{copy.addPlayer}</ButtonLink>} />
    <ScoutingNav locale={locale} active="players" />
    <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" aria-label={copy.search}>
      <input name="q" type="search" placeholder={copy.search} aria-label={copy.search} defaultValue={param(params.q)} className={input} />
      <select name="status" aria-label={copy.status} defaultValue={status} className={input}>
        <option value="">{copy.allStatuses}</option>
        <option value="all">{copy.allStatuses} + {copy.archived}</option>
        {scoutingStatuses.map((value) => <option key={value} value={value}>{copy[value]}</option>)}
      </select>
      <select name="position" aria-label={copy.position} defaultValue={position} className={input}>
        <option value="">{copy.allPositions}</option>
        {positions.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select name="age" aria-label={copy.age} defaultValue={param(params.age)} className={input}>
        <option value="">{copy.allAges}</option>
        {Array.from({ length: 19 }, (_, index) => index + 8).map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select name="foot" aria-label={copy.foot} defaultValue={foot} className={input}>
        <option value="">{copy.allFeet}</option>
        {(["left", "right", "both"] as const).map((value) => <option key={value} value={value}>{copy[value]}</option>)}
      </select>
      <select name="club" aria-label={copy.club} defaultValue={club} className={input}>
        <option value="">{copy.allClubs}</option>
        {clubs.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select name="priority" aria-label={copy.priority} defaultValue={priority} className={input}>
        <option value="">{copy.allPriorities}</option>
        {scoutingPriorities.map((value) => <option key={value} value={value}>{copy[value]}</option>)}
      </select>
      <select name="target" aria-label={copy.target} defaultValue={targetId} className={input}>
        <option value="">{copy.allTargets}</option>
        {data.targets.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}
      </select>
      <select name="sort" aria-label={copy.sort} defaultValue={sort} className={input}>
        <option value="name">{copy.sortName}</option>
        <option value="age">{copy.sortAge}</option>
        <option value="recent">{copy.sortRecent}</option>
        <option value="priority">{copy.sortPriority}</option>
      </select>
      <button type="submit" className="min-h-10 rounded-md bg-board-navy px-4 text-sm font-bold text-white">{copy.search}</button>
    </form>
    {!players.length ? <div className="border-y border-board-line py-8 text-sm text-slate-600">{copy.noPlayers}</div> : <>
      <div className="space-y-3 lg:hidden">
        {players.map((player) => <Link key={player.id} href={`/scouting/players/${player.id}`} className="block rounded-md border border-board-line bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <strong className="min-w-0 break-words text-board-navy">{player.first_name} {player.last_name}</strong>
            <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-bold">{copy[player.status]}</span>
          </div>
          <p className="mt-2 text-sm text-slate-700">{[player.primary_position, ...player.secondary_positions].filter(Boolean).join(" / ") || copy.unknown} · {calculateAge(player.date_of_birth ?? undefined) ?? "?"} {copy.days}</p>
          <p className="mt-1 break-words text-sm text-slate-600">{player.current_club || copy.unknown}</p>
          <p className="mt-2 text-xs text-slate-600">{copy.lastObserved}: {data.lastObserved[player.id] ? formatDate(data.lastObserved[player.id], locale) : copy.unknown}</p>
          {playerTarget(player.id) ? <p className="mt-1 break-words text-xs text-slate-600">{copy.target}: {playerTarget(player.id)}</p> : null}
        </Link>)}
      </div>
      <div className="hidden overflow-x-auto rounded-md border border-board-line bg-white lg:block">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr>
            {[copy.player, copy.age, copy.position, copy.secondaryPositions, copy.foot, copy.club, copy.status, copy.priority, copy.lastObserved, copy.target, copy.nextAction].map((label) => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-board-line">
            {players.map((player) => <tr key={player.id} className="hover:bg-slate-50">
              <td className="px-3 py-3 font-bold"><Link href={`/scouting/players/${player.id}`} className="text-board-green hover:underline">{player.first_name} {player.last_name}</Link></td>
              <td className="px-3 py-3">{calculateAge(player.date_of_birth ?? undefined) ?? "–"}</td>
              <td className="px-3 py-3">{player.primary_position ? canonicalPositionLabels[player.primary_position] ?? player.primary_position : "–"}</td>
              <td className="px-3 py-3">{player.secondary_positions.join(", ") || "–"}</td>
              <td className="px-3 py-3">{player.strong_foot ? copy[player.strong_foot] : "–"}</td>
              <td className="max-w-36 truncate px-3 py-3">{player.current_club || "–"}</td>
              <td className="px-3 py-3">{copy[player.status]}</td>
              <td className="px-3 py-3">{copy[player.priority]}</td>
              <td className="px-3 py-3">{formatDate(data.lastObserved[player.id], locale) || "–"}</td>
              <td className="max-w-36 truncate px-3 py-3">{playerTarget(player.id) || "–"}</td>
              <td className="px-3 py-3">{player.next_action ? copy[player.next_action === "none" ? "no_action" : player.next_action] : "–"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </>}
  </PageContainer>;
}
