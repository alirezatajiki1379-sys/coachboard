import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingObservationForm } from "@/components/scouting/forms";
import { createScoutingObservation } from "@/lib/scouting/actions";
import { scoutingCopy } from "@/lib/scouting/copy";
import { asScoutingDb } from "@/lib/scouting/db";
import { scoutingContext } from "@/lib/scouting/server";
import { trainingNowParts } from "@/lib/trainings/utils";

export default async function NewScoutingObservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId, locale } = await scoutingContext();
  const scoutingDb = asScoutingDb(db);
  const [{ data: player, error }, previous] = await Promise.all([
    scoutingDb.from("scouting_players").select("first_name,last_name,current_team,current_club,primary_position").eq("id", id).eq("user_id", userId).maybeSingle(),
    scoutingDb.from("scouting_observations").select("next_focus").eq("player_id", id).eq("user_id", userId).order("observed_on", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle()
  ]);
  if (error) throw new Error(error.message);
  if (previous.error) throw new Error(previous.error.message);
  if (!player) notFound();
  const c = scoutingCopy(locale);
  return <PageContainer width="standard">
    <PageHeader eyebrow={c.scouting} title={c.addObservation} description={`${player.first_name} ${player.last_name ?? ""}`} />
    <ScoutingObservationForm action={createScoutingObservation.bind(null, id)} playerId={id} locale={locale} previousFocus={previous.data?.next_focus} playerTeam={player.current_team || player.current_club} observedPosition={player.primary_position} today={trainingNowParts().date} />
  </PageContainer>;
}
