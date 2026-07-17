import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PlayerCard } from "@/components/squad/player-card";
import { SquadNav } from "@/components/squad/squad-nav";
import { createClient } from "@/lib/supabase/server";
import { listSquadPlayers, parseSquadView } from "@/lib/squad/queries";

type SquadPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const viewLabels = {
  active: "Active players",
  archived: "Archived players"
};

export default async function SquadPage({ searchParams }: SquadPageProps) {
  const params = await searchParams;
  const view = parseSquadView(params);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const players = await listSquadPlayers(supabase, user.id, view);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Players</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Manage your roster foundation now. Attendance, ratings and analysis will build on these player profiles.
          </p>
        </div>
        <ButtonLink href="/squad/players/new" className="justify-center">
          <Plus className="h-4 w-4" />
          Add player
        </ButtonLink>
      </div>

      <SquadNav />

      <nav className="flex flex-wrap gap-2 rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label="Player views">
        {(["active", "archived"] as const).map((item) => (
          <ButtonLink
            key={item}
            href={item === "active" ? "/squad" : "/squad?view=archived"}
            variant={view === item ? "primary" : "ghost"}
            className="h-9 justify-center px-3"
          >
            {viewLabels[item]}
          </ButtonLink>
        ))}
      </nav>

      <section className={players.length ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : ""}>
        {players.length ? (
          players.map((player) => <PlayerCard key={player.id} player={player} view={view} />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No {viewLabels[view].toLowerCase()} yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              {view === "active"
                ? "Create your first player profile to start building attendance and development tracking."
                : "Archived players will appear here when you archive them."}
            </p>
            {view === "active" ? (
              <ButtonLink href="/squad/players/new" className="mt-5">
                Add first player
              </ButtonLink>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
