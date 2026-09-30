import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingTargetForm } from "@/components/scouting/forms";
import { createScoutingTarget } from "@/lib/scouting/actions";
import { scoutingCopy } from "@/lib/scouting/copy";
import { scoutingContext } from "@/lib/scouting/server";
import { listSquads } from "@/lib/squad/squads";

export default async function NewScoutingTargetPage() {
  const { db, userId, locale } = await scoutingContext();
  const teams = await listSquads(db, userId);
  const c = scoutingCopy(locale);
  return <PageContainer width="standard">
    <PageHeader eyebrow={c.scouting} title={c.createTarget} description={c.targetSummary} />
    <ScoutingTargetForm action={createScoutingTarget} teams={teams} locale={locale} />
  </PageContainer>;
}
