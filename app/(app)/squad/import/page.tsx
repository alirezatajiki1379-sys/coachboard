import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { PlayerImportWorkflow } from "@/components/squad/player-import-workflow";
import { SquadNav } from "@/components/squad/squad-nav";
import { Button } from "@/components/ui/button";
import { getActiveSquadPositionConsistencyReport, listPlayerImportBatches, repairActiveSquadPlayerPositions } from "@/lib/squad/import-actions";
import type { DuplicatePlayerContext } from "@/lib/squad/importer";
import { mapSquadPlayerRow, type SquadPlayerRow } from "@/lib/squad/mappers";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { createClient } from "@/lib/supabase/server";

type PlayerImportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlayerImportPage({ searchParams }: PlayerImportPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const activeSquad = await ensureActiveSquad(supabase, user.id);
  const [{ data: playerData }, history, positionReport] = await Promise.all([
    supabase.from("squad_players").select("*").eq("user_id", user.id),
    listPlayerImportBatches(),
    getActiveSquadPositionConsistencyReport()
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
      <PositionConsistencyPanel report={positionReport} repairState={single(params.positionRepair)} />
      <PlayerImportWorkflow existingPlayers={duplicateContext} history={history} />
    </PageContainer>
  );
}

function PositionConsistencyPanel({ report, repairState }: { report: Awaited<ReturnType<typeof getActiveSquadPositionConsistencyReport>>; repairState?: string }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-board-green">Position data consistency</p>
          <h2 className="mt-1 text-xl font-bold text-board-navy">Canonical position repair</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Checks whether active Squad players have canonical profile positions that Player Profiles, Trainings and Plan Builder all read.
          </p>
          {repairState ? <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm font-bold text-green-800">Repair finished: {formatRepairState(repairState)}</p> : null}
        </div>
        <form action={repairActiveSquadPlayerPositions}>
          <Button type="submit" disabled={!report.deterministicRepairs.length} className="h-10 px-3">
            Repair deterministic positions
          </Button>
        </form>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <RepairMetric label="Players in active Squad" value={report.totalPlayers} />
        <RepairMetric label="Squad shows source" value={report.squadDisplayedPositions} />
        <RepairMetric label="Canonical primary" value={report.canonicalPrimaryPositions} />
        <RepairMetric label="Secondary stored" value={report.secondaryPositions} />
        <RepairMetric label="Profile missing" value={report.profileMissingPositions} warning={report.profileMissingPositions > 0} />
        <RepairMetric label="Planning unassigned risk" value={report.sessionPlanningUnassignedRisk} warning={report.sessionPlanningUnassignedRisk > 0} />
      </div>
      <details className="mt-4 rounded-md bg-board-paper p-3">
        <summary className="cursor-pointer text-sm font-bold text-board-navy">
          Repair preview: {report.deterministicRepairs.length} deterministic · {report.manualReview.length} manual review
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-500">Deterministic repairs</h3>
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
              {report.deterministicRepairs.length ? report.deterministicRepairs.slice(0, 40).map((item) => (
                <div key={item.playerId} className="rounded-md border border-board-line bg-white px-3 py-2 text-xs">
                  <p className="font-bold text-board-navy">{item.playerId}</p>
                  <p className="mt-1 text-slate-600">{item.sourceField}: {item.rawValue} → {item.targetPosition}{item.targetSecondaryPositions.length ? ` · secondary ${item.targetSecondaryPositions.join(", ")}` : ""}</p>
                </div>
              )) : <p className="text-sm text-slate-600">No deterministic repair needed.</p>}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-black uppercase text-slate-500">Manual review</h3>
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
              {report.manualReview.length ? report.manualReview.slice(0, 40).map((item) => (
                <div key={item.playerId} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                  <p className="font-bold text-board-navy">{item.playerId}</p>
                  <p className="mt-1 text-amber-800">{item.reason}</p>
                </div>
              )) : <p className="text-sm text-slate-600">No ambiguous position sources found.</p>}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

function RepairMetric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={warning ? "rounded-md border border-amber-200 bg-amber-50 px-3 py-2" : "rounded-md border border-board-line bg-board-paper px-3 py-2"}>
      <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-board-navy">{value}</p>
    </div>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatRepairState(state: string) {
  if (state === "error") return "the repair query failed.";
  const match = state.match(/^repaired-(\d+)-review-(\d+)$/);
  return match ? `${match[1]} repaired, ${match[2]} need review.` : state;
}
