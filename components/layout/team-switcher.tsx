"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Plus, Settings } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createTeam, switchTeam } from "@/lib/squad/team-actions";
import type { Squad } from "@/types/domain";

type TeamSwitcherProps = {
  teams: Squad[];
  returnTo?: string;
};

export function TeamSwitcher({ teams, returnTo = "/dashboard" }: TeamSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTeam = teams.find((team) => team.isActive) ?? teams[0];
  const switchReturnTo = teamSwitchReturnTo(pathname, searchParams, returnTo);

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
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Switch team</p>
        {teams.map((team) => (
          <form key={team.id} action={switchTeam}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="returnTo" value={switchReturnTo} />
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
        <div className="space-y-2 border-t border-white/10 pt-2">
          <details>
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-xs font-bold text-slate-200 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-board-green/40">
              <Plus className="h-4 w-4" />
              Create new team
            </summary>
            <form action={createTeam} className="mt-2 space-y-2 rounded-md bg-black/15 p-2">
              <input type="hidden" name="returnTo" value="/squad" />
              <label className="block">
                <span className="sr-only">Team name</span>
                <input
                  name="name"
                  required
                  placeholder="Team name"
                  className="h-9 w-full rounded-md border border-white/10 bg-white px-3 text-xs font-semibold text-board-navy outline-none focus:border-board-green focus:ring-2 focus:ring-board-green/30"
                />
              </label>
              <Button type="submit" className="h-9 w-full justify-center px-3 text-xs">
                Create and switch
              </Button>
            </form>
          </details>
          <ButtonLink href="/teams" variant="ghost" className="h-9 w-full justify-start px-3 text-xs text-slate-200 hover:bg-white/10 hover:text-white">
            <Settings className="h-4 w-4" />
            Manage teams
          </ButtonLink>
        </div>
      </div>
    </details>
  );
}

function teamSwitchReturnTo(pathname: string, searchParams: ReturnType<typeof useSearchParams>, fallback: string) {
  if (pathname.startsWith("/squad/players/")) return "/squad";
  if (pathname.startsWith("/squad/attendance/")) return "/squad/attendance";
  if (pathname.startsWith("/trainings/")) return "/trainings";
  if (pathname.startsWith("/actions")) return "/actions";
  if (pathname.startsWith("/squad")) return pathname;
  const query = searchParams.toString();
  if (pathname) return `${pathname}${query ? `?${query}` : ""}`;
  return fallback;
}
