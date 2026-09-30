import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingObservationForm } from "@/components/scouting/forms";
import { updateScoutingObservation } from "@/lib/scouting/actions";
import { scoutingCopy } from "@/lib/scouting/copy";
import { asScoutingDb } from "@/lib/scouting/db";
import { scoutingContext } from "@/lib/scouting/server";

export default async function EditScoutingObservationPage({ params }: { params: Promise<{ id: string; observationId: string }> }) {
  const { id, observationId } = await params;
  const { db, userId, locale } = await scoutingContext();
  const { data: observation, error } = await asScoutingDb(db).from("scouting_observations").select("*").eq("id", observationId).eq("player_id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!observation) notFound();
  const c = scoutingCopy(locale);
  return <PageContainer width="standard">
    <PageHeader eyebrow={c.scouting} title={c.editObservation} />
    <ScoutingObservationForm action={updateScoutingObservation.bind(null, id, observationId)} playerId={id} initial={observation} locale={locale} />
  </PageContainer>;
}
