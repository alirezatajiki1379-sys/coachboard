import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingPlayerForm } from "@/components/scouting/forms";
import { updateScoutingPlayer } from "@/lib/scouting/actions";
import { scoutingCopy } from "@/lib/scouting/copy";
import { asScoutingDb } from "@/lib/scouting/db";
import { scoutingContext } from "@/lib/scouting/server";

export default async function EditScoutingPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId, locale } = await scoutingContext();
  const { data: player, error } = await asScoutingDb(db).from("scouting_players").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!player) notFound();
  const c = scoutingCopy(locale);
  return <PageContainer width="standard">
    <PageHeader eyebrow={c.scouting} title={c.editPlayer} description={`${player.first_name} ${player.last_name ?? ""}`} />
    <ScoutingPlayerForm action={updateScoutingPlayer.bind(null, id)} initial={player} locale={locale} />
  </PageContainer>;
}
