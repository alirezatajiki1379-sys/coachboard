import { PageContainer, PageHeader } from "@/components/layout/page";
import { ScoutingPlayerForm } from "@/components/scouting/forms";
import { createScoutingPlayer } from "@/lib/scouting/actions";
import { scoutingCopy } from "@/lib/scouting/copy";
import { scoutingContext } from "@/lib/scouting/server";

export default async function NewScoutingPlayerPage() {
  const { locale } = await scoutingContext();
  const c = scoutingCopy(locale);
  return <PageContainer width="standard">
    <PageHeader eyebrow={c.scouting} title={c.addPlayer} description={c.noPlayers} />
    <ScoutingPlayerForm action={createScoutingPlayer} locale={locale} />
  </PageContainer>;
}
