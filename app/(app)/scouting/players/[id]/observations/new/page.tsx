import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingObservationForm } from "@/components/scouting/forms";
import { createScoutingObservation } from "@/lib/scouting/actions";
import { scoutingCopy } from "@/lib/scouting/copy";
import { asScoutingDb } from "@/lib/scouting/db";
import { scoutingContext } from "@/lib/scouting/server";

export default async function NewScoutingObservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId, locale } = await scoutingContext();
  const { data: player, error } = await asScoutingDb(db).from("scouting_players").select("first_name,last_name").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!player) notFound();
  const c = scoutingCopy(locale);
  return <PageContainer width="standard">
    <PageHeader eyebrow={c.scouting} title={c.addObservation} description={`${player.first_name} ${player.last_name ?? ""}`} />
    <ScoutingObservationForm action={createScoutingObservation.bind(null, id)} playerId={id} locale={locale} />
  </PageContainer>;
}
