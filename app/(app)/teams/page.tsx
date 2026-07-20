import { redirect } from "next/navigation";
import { Archive, Plus, RotateCcw, Save, UsersRound } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { archiveTeam, createTeam, renameTeam, restoreTeam, switchTeam } from "@/lib/squad/team-actions";
import { listAllTeams, listSquads } from "@/lib/squad/squads";
import { createClient } from "@/lib/supabase/server";

type TeamsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [activeTeams, allTeams] = await Promise.all([
    listSquads(supabase, user.id),
    listAllTeams(supabase, user.id)
  ]);
  const activeTeam = activeTeams.find((team) => team.isActive) ?? activeTeams[0];

  return (
    <PageContainer width="standard">
      <PageHeader
        eyebrow="Teams"
        title="Team workspaces"
        description="Each Team has exactly one Squad/Roster. Switch Team here, then CoachBoard shows only that Team's players, trainings and planning context."
      />

      {params.error === "name" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Add a Team name first.</p>
      ) : null}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Plus className="h-5 w-5" />Create new team</h2>
        <p className="mt-1 text-sm text-slate-500">Create a separate workspace for another team. CoachBoard creates the roster context automatically.</p>
        <form action={createTeam} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="returnTo" value="/dashboard" />
          <label className="min-w-0 flex-1">
            <span className="text-sm font-medium text-slate-700">Team name</span>
            <input name="name" required placeholder="e.g. U14 Solingen" className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <Button type="submit" className="self-end">
            <Plus className="h-4 w-4" />
            Create team
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        {allTeams.length ? (
          allTeams.map((team) => {
            const isCurrent = team.id === activeTeam?.id;
            const isArchived = Boolean(team.archivedAt);
            return (
              <article key={team.id} className={`rounded-lg border bg-white p-4 shadow-soft ${isCurrent ? "border-board-green/50" : "border-board-line"}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-board-green">{isCurrent ? "Active team" : isArchived ? "Archived" : "Team"}</p>
                    <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-board-navy">
                      <UsersRound className="h-5 w-5" />
                      <span className="truncate">{team.name}</span>
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">One Team workspace with one Squad/Roster.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    {!isArchived ? (
                      <form action={switchTeam}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="returnTo" value="/dashboard" />
                        <Button type="submit" variant={isCurrent ? "secondary" : "primary"} disabled={isCurrent} className="w-full sm:w-auto">
                          {isCurrent ? "Selected" : "Switch"}
                        </Button>
                      </form>
                    ) : null}
                    <form action={renameTeam} className="flex min-w-0 gap-2">
                      <input type="hidden" name="teamId" value={team.id} />
                      <input name="name" defaultValue={team.name} className="h-10 min-w-0 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                      <Button type="submit" variant="secondary" className="px-3">
                        <Save className="h-4 w-4" />
                        Rename
                      </Button>
                    </form>
                    {isArchived ? (
                      <form action={restoreTeam}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                          <RotateCcw className="h-4 w-4" />
                          Restore
                        </Button>
                      </form>
                    ) : (
                      <form action={archiveTeam}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <Button type="submit" variant="danger" className="w-full sm:w-auto">
                          <Archive className="h-4 w-4" />
                          Archive
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Create your first team</h2>
            <p className="mt-2 text-sm text-slate-600">Add a Team name above to create the first Squad/Roster workspace.</p>
          </div>
        )}
      </section>
    </PageContainer>
  );
}
