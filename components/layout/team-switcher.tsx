"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Plus, Settings, UsersRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createTeam, switchTeam } from "@/lib/squad/team-actions";
import { germanFederalStates } from "@/lib/squad/regional-calendar";
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
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-white">
      <span className="block text-xs font-semibold uppercase text-slate-300">Active team</span>
      <div className="mt-1 flex items-center gap-2">
        <details className="group min-w-0 flex-1">
          <summary className="flex h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-board-green/40">
            <span className="min-w-0 truncate text-sm font-bold text-white" title={activeTeam.name}>{activeTeam.name}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-300 transition group-open:rotate-180" />
          </summary>
          <div className="mt-3 space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Switch team</p>
            {teams.map((team) => (
              <form key={team.id} action={switchTeam}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value={switchReturnTo.replace("__TEAM_ID__", team.id)} />
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
                  <input type="hidden" name="countryCode" value="DE" />
                  <label className="block">
                    <span className="sr-only">Team name</span>
                    <input
                      name="name"
                      required
                      placeholder="Team name"
                      className="h-9 w-full rounded-md border border-white/10 bg-white px-3 text-xs font-semibold text-board-navy outline-none focus:border-board-green focus:ring-2 focus:ring-board-green/30"
                    />
                  </label>
                  <label className="block">
                    <span className="sr-only">Bundesland</span>
                    <select
                      name="federalStateCode"
                      required
                      defaultValue=""
                      className="h-9 w-full rounded-md border border-white/10 bg-white px-3 text-xs font-semibold text-board-navy outline-none focus:border-board-green focus:ring-2 focus:ring-board-green/30"
                    >
                      <option value="" disabled>Bundesland</option>
                      {germanFederalStates.map((state) => (
                        <option key={state.code} value={state.code}>{state.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="sr-only">City</span>
                    <input
                      name="city"
                      placeholder="City (optional)"
                      className="h-9 w-full rounded-md border border-white/10 bg-white px-3 text-xs font-semibold text-board-navy outline-none focus:border-board-green focus:ring-2 focus:ring-board-green/30"
                    />
                  </label>
                  <Button type="submit" className="h-9 w-full justify-center px-3 text-xs">
                    Create and switch
                  </Button>
                </form>
              </details>
              <ButtonLink href="/teams" variant="ghost" className="h-9 w-full justify-start px-3 text-xs text-slate-200 hover:bg-white/10 hover:text-white">
                <UsersRound className="h-4 w-4" />
                All teams
              </ButtonLink>
            </div>
          </div>
        </details>
        <ButtonLink
          href={`/teams/${activeTeam.id}/settings`}
          variant="ghost"
          className="h-9 w-9 shrink-0 px-0 text-slate-200 hover:bg-white/10 hover:text-white"
          aria-label={`Open settings for ${activeTeam.name}`}
          title="Team settings"
        >
          <Settings className="h-4 w-4" />
        </ButtonLink>
      </div>
    </div>
  );
}

function teamSwitchReturnTo(pathname: string, searchParams: ReturnType<typeof useSearchParams>, fallback: string) {
  if (/^\/teams\/[^/]+\/settings/.test(pathname)) {
    const query = searchParams.toString();
    return `/teams/__TEAM_ID__/settings${query ? `?${query}` : ""}`;
  }
  if (pathname.startsWith("/squad/players/")) return "/squad";
  if (pathname.startsWith("/squad/attendance/")) return "/squad/attendance";
  if (pathname.startsWith("/trainings/")) return "/trainings";
  if (pathname.startsWith("/actions")) return "/actions";
  if (pathname.startsWith("/squad")) return pathname;
  const query = searchParams.toString();
  if (pathname) return `${pathname}${query ? `?${query}` : ""}`;
  return fallback;
}
