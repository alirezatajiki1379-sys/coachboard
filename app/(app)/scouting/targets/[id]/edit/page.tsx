import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingTargetForm } from "@/components/scouting/forms";
import { updateScoutingTarget } from "@/lib/scouting/actions";
import { scoutingCopy } from "@/lib/scouting/copy";
import { asScoutingDb } from "@/lib/scouting/db";
import { scoutingContext } from "@/lib/scouting/server";
import { listSquads } from "@/lib/squad/squads";

export default async function EditScoutingTargetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId, locale } = await scoutingContext();
  const [targetResult, teams] = await Promise.all([
    asScoutingDb(db).from("scouting_targets").select("*").eq("id", id).eq("user_id", userId).maybeSingle(),
    listSquads(db, userId)
  ]);
  if (targetResult.error) throw new Error(targetResult.error.message);
  if (!targetResult.data) notFound();
  const c = scoutingCopy(locale);
  return <PageContainer width="standard">
    <PageHeader eyebrow={c.scouting} title={c.editTarget} description={targetResult.data.title} />
    <ScoutingTargetForm action={updateScoutingTarget.bind(null, id)} teams={teams} initial={targetResult.data} locale={locale} />
  </PageContainer>;
}
