import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PlayerImportWorkflow } from "@/components/squad/player-import-workflow";
import { SquadNav } from "@/components/squad/squad-nav";
import { listPlayerImportBatches } from "@/lib/squad/import-actions";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import { createClient } from "@/lib/supabase/server";

export default async function PlayerImportPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: playerData }, history] = await Promise.all([
    supabase.from("squad_players").select("*").eq("user_id", user.id),
    listPlayerImportBatches()
  ]);

  const players = ((playerData ?? []) as SquadPlayerRow[]).map(mapSquadPlayerRow);

  return (
    <div className="space-y-6">
      <SquadNav />
      <Link href="/squad" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-green">
        <ArrowLeft className="h-4 w-4" />
        Back to Coach Workspace
      </Link>
      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Import players</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Upload Excel or CSV, paste a table, review every mapping and confirm the import only after duplicate checks.
        </p>
      </section>
      <PlayerImportWorkflow existingPlayers={players} history={history} />
    </div>
  );
}
