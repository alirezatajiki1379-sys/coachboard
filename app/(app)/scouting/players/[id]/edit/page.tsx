import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingPlayerForm } from "@/components/scouting/forms";
import { updateScoutingPlayer } from "@/lib/scouting/actions";
import { scoutingCopy } from "@/lib/scouting/copy";
import { asScoutingDb } from "@/lib/scouting/db";
import { scoutingContext } from "@/lib/scouting/server";
import { reviewableRecommendation } from "@/lib/scouting/workflow";

export default async function EditScoutingPlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ recommendation?: string }> }) {
  const { id } = await params;
  const { db, userId, locale } = await scoutingContext();
  const { data: player, error } = await asScoutingDb(db).from("scouting_players").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!player) notFound();
  const requested = (await searchParams).recommendation;
  let proposedStatus = null;
  if (requested) {
    const latest = await asScoutingDb(db).from("scouting_observations").select("recommendation").eq("user_id", userId).eq("player_id", id)
      .order("observed_on", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw new Error(latest.error.message);
    if (latest.data?.recommendation === requested) proposedStatus = reviewableRecommendation(player, latest.data.recommendation);
  }
  const c = scoutingCopy(locale);
  return <PageContainer width="standard">
    <PageHeader eyebrow={c.scouting} title={c.editPlayer} description={`${player.first_name} ${player.last_name ?? ""}`} />
    <ScoutingPlayerForm action={updateScoutingPlayer.bind(null, id)} initial={player} locale={locale} proposedStatus={proposedStatus} />
  </PageContainer>;
}
