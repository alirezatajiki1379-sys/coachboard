import { ChevronDown, Plus, Settings } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { switchTeam } from "@/lib/squad/team-actions";
import type { Squad } from "@/types/domain";

type TeamSwitcherProps = {
  teams: Squad[];
  returnTo?: string;
};

export function TeamSwitcher({ teams, returnTo = "/dashboard" }: TeamSwitcherProps) {
  const activeTeam = teams.find((team) => team.isActive) ?? teams[0];

  if (!activeTeam) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-xs font-semibold uppercase text-slate-300">Team</p>
        <ButtonLink href="/teams" className="mt-2 h-9 w-full justify-center px-3 text-xs">
          <Plus className="h-4 w-4" />
          Create first team
        </ButtonLink>
      </div>
    );
  }

  return (
    <details className="group rounded-lg border border-white/10 bg-white/5 p-3 text-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-board-green/40">
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase text-slate-300">Active team</span>
          <span className="block truncate text-sm font-bold text-white" title={activeTeam.name}>{activeTeam.name}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-300 transition group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-2">
        {teams.map((team) => (
          <form key={team.id} action={switchTeam}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button
              type="submit"
              variant={team.id === activeTeam.id ? "primary" : "ghost"}
              className={`h-9 w-full justify-start px-3 text-xs ${team.id === activeTeam.id ? "" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}
              disabled={team.id === activeTeam.id}
            >
              {team.id === activeTeam.id ? "✓" : ""}
              <span className="truncate">{team.name}</span>
            </Button>
          </form>
        ))}
        <div className="border-t border-white/10 pt-2">
          <ButtonLink href="/teams" variant="ghost" className="h-9 w-full justify-start px-3 text-xs text-slate-200 hover:bg-white/10 hover:text-white">
            <Settings className="h-4 w-4" />
            Manage teams
          </ButtonLink>
        </div>
      </div>
    </details>
  );
}
