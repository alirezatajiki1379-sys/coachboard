import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate, type Locale } from "@/lib/i18n";
import { scoutingCopy } from "@/lib/scouting/copy";
import { reviewableRecommendation, scoutingFollowUpDate, type ObservationContext } from "@/lib/scouting/workflow";
import type { ScoutingObservationRow, ScoutingPlayerRow } from "@/types/database";

export function ScoutingFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 [overflow-wrap:anywhere]"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm text-board-navy">{value}</p></div>;
}

export function Recommendation({ value, locale }: { value: ScoutingObservationRow["recommendation"]; locale: Locale }) {
  const c = scoutingCopy(locale);
  return <>{value === "archived" ? c.stopFollowing : value === "identified" ? c.internalStep : value === "monitoring" ? c.continueObserving : value ? c[value] : c.unknown}</>;
}

export function ProspectContext({ player, latest, locale }: { player: ScoutingPlayerRow; latest?: ObservationContext; locale: Locale }) {
  const c = scoutingCopy(locale);
  const date = scoutingFollowUpDate(player, latest);
  return <div className="min-w-0 space-y-2 text-sm [overflow-wrap:anywhere]">
    <p className="text-slate-600">{[player.current_club, player.current_team, player.primary_position, player.date_of_birth?.slice(0, 4) ?? player.birth_year].filter(Boolean).join(" · ") || c.unknown}</p>
    <p><span className="font-semibold">{c[player.status]}</span> · {c.priority}: {c[player.priority]}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      <span>{c.lastObserved}: {latest ? formatDate(latest.observed_on, locale) : c.unknown}</span>
      {date ? <span>{c.followUp}: {formatDate(date, locale)}</span> : null}
    </div>
    {latest?.recommendation ? <p className="text-xs">{c.lastRecommendation}: <Recommendation value={latest.recommendation} locale={locale} /></p> : null}
  </div>;
}

export function ObservationLink({ id, locale }: { id: string; locale: Locale }) {
  return <Link href={`/scouting/players/${id}/observations/new`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-board-green hover:underline"><Plus className="h-4 w-4 shrink-0" />{scoutingCopy(locale).addObservation}</Link>;
}

export function CurrentCase({ player, latest, locale }: { player: ScoutingPlayerRow; latest?: ScoutingObservationRow; locale: Locale }) {
  const c = scoutingCopy(locale);
  const proposed = reviewableRecommendation(player, latest?.recommendation);
  return <section className="min-w-0 space-y-4 border-y border-board-line py-4 [overflow-wrap:anywhere]">
    <h2 className="text-lg font-bold text-board-navy">{c.currentCase}</h2>
    {latest ? <>
      <ScoutingFact label={`${c.lastObserved} · ${formatDate(latest.observed_on, locale)}`} value={latest.summary} />
      <div className="grid gap-3 sm:grid-cols-2">
        <ScoutingFact label={c.currentStatus} value={c[player.status]} />
        <div className="text-sm"><p className="text-xs font-semibold text-slate-500">{c.lastRecommendation}</p><p className="mt-1"><Recommendation value={latest.recommendation} locale={locale} /></p></div>
        {latest.open_questions ? <ScoutingFact label={c.openQuestions} value={latest.open_questions} /> : null}
        {latest.next_focus ? <ScoutingFact label={c.nextFocus} value={latest.next_focus} /> : null}
      </div>
      {latest.next_action ? <ScoutingFact label={c.nextAction} value={latest.next_action} /> : null}
      {latest.follow_up_date ? <ScoutingFact label={c.followUp} value={formatDate(latest.follow_up_date, locale)} /> : null}
    </> : <p className="text-sm text-slate-600">{c.noObservations}</p>}
    {player.next_action && player.next_action !== "none" ? <ScoutingFact label={c.nextAction} value={[c[player.next_action], player.next_action_date ? formatDate(player.next_action_date, locale) : null].filter(Boolean).join(" · ")} /> : null}
    {proposed ? <Link href={`/scouting/players/${player.id}/edit?recommendation=${proposed}`} className="inline-flex min-h-11 items-center text-sm font-bold text-board-green hover:underline">{c.reviewRecommendation}: {c[proposed]}</Link> : null}
  </section>;
}

export function ObservationEvidence({ observations, playerId, locale }: { observations: ScoutingObservationRow[]; playerId: string; locale: Locale }) {
  const c = scoutingCopy(locale);
  const ratings = [["rating_technical", c.technical], ["rating_tactical", c.tactical], ["rating_physical", c.physical], ["rating_mental", c.mental]] as const;
  const rated = observations.filter((o) => ratings.some(([key]) => o[key] != null));
  return <>
    {rated.length > 1 ? <section className="min-w-0 border-b border-board-line pb-4" aria-label={c.ratingHistory}>
      <h3 className="mb-3 font-bold text-board-navy">{c.ratingHistory}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...rated].reverse().map((o) => <div key={o.id} className="min-w-0 rounded-md border border-board-line p-3 text-sm">
          <Link href={`#observation-${o.id}`} className="inline-flex min-h-11 items-center font-bold text-board-green">{formatDate(o.observed_on, locale)} · {c[o.context]}</Link>
          <p className="mb-2 text-xs text-slate-600 [overflow-wrap:anywhere]">{[o.opponent, o.observed_position].filter(Boolean).join(" · ")}</p>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">{ratings.map(([key, label]) => <div key={key} className="contents"><dt className="[overflow-wrap:anywhere]">{label}</dt><dd className="font-semibold tabular-nums">{o[key] == null ? "–" : `${o[key]}/5`}</dd></div>)}</dl>
        </div>)}
      </div>
    </section> : null}
    {observations.length ? <ol className="divide-y divide-board-line border-y border-board-line">
      {observations.map((o) => <li id={`observation-${o.id}`} key={o.id} className="min-w-0 scroll-mt-24 py-4 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-board-navy">{formatDate(o.observed_on, locale)} · {c[o.context]}</strong>
          <Link href={`/scouting/players/${playerId}/observations/${o.id}/edit`} className="inline-flex min-h-11 items-center text-sm font-bold text-board-green hover:underline">{c.editObservation}</Link>
        </div>
        <p className="text-sm text-slate-600">{[o.player_team, o.opponent, o.event_label, o.observed_position].filter(Boolean).join(" · ")}</p>
        {o.recommendation ? <p className="mt-2 text-sm"><strong>{c.recommendation}:</strong> <Recommendation value={o.recommendation} locale={locale} /></p> : null}
        <p className="mt-2 whitespace-pre-wrap text-sm">{o.summary}</p>
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-board-green">{c.observationDetails}</summary>
          <div className="grid gap-4 sm:grid-cols-2">
            {([[c.situations, o.situations], [c.strengths, o.strengths], [c.development, o.development_considerations], [c.openQuestions, o.open_questions], [c.nextFocus, o.next_focus], [c.nextAction, o.next_action], [c.competition, o.competition], [c.observer, o.observer], [c.minutes, o.minutes_observed?.toString()], [c.followUp, o.follow_up_date ? formatDate(o.follow_up_date, locale) : null]] as const).filter(([, value]) => value).map(([label, value]) => <ScoutingFact key={label} label={label} value={value!} />)}
            {ratings.filter(([key]) => o[key] != null).map(([key, label]) => <ScoutingFact key={key} label={label} value={`${o[key]}/5`} />)}
          </div>
        </details>
      </li>)}
    </ol> : <p className="text-sm text-slate-600">{c.noObservations}</p>}
  </>;
}
