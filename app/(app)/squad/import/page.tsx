import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { PlayerImportWorkflow } from "@/components/squad/player-import-workflow";
import { SquadNav } from "@/components/squad/squad-nav";
import { listPlayerImportBatches } from "@/lib/squad/import-actions";
import type { DuplicatePlayerContext } from "@/lib/squad/importer";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { createClient } from "@/lib/supabase/server";

export default async function PlayerImportPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const activeSquad = await ensureActiveSquad(supabase, user.id);
  const [{ data: playerData }, history] = await Promise.all([
    supabase.from("squad_players").select("*").eq("user_id", user.id),
    listPlayerImportBatches()
  ]);

  const players = ((playerData ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);
  const duplicateContext: DuplicatePlayerContext = {
    activeTeamPlayers: players.filter((player) => player.squadId === activeSquad.id && !player.archivedAt && !player.deletedAt),
    archivedTeamPlayers: players.filter((player) => player.squadId === activeSquad.id && Boolean(player.archivedAt) && !player.deletedAt),
    trashedTeamPlayers: players.filter((player) => player.squadId === activeSquad.id && Boolean(player.deletedAt)),
    legacyPlayers: players.filter((player) => !player.squadId),
    otherTeamPlayers: players.filter((player) => player.squadId && player.squadId !== activeSquad.id)
  };

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Squad"
        title="Import players"
        description="Upload Excel or CSV, paste a table, review every mapping and confirm the import only after duplicate checks."
        breadcrumb={(
          <Link href="/squad" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-green">
            <ArrowLeft className="h-4 w-4" />
            Back to Coach Workspace
          </Link>
        )}
      />
      <SquadNav />
      <PlayerImportWorkflow existingPlayers={duplicateContext} history={history} />
    </PageContainer>
  );
}
