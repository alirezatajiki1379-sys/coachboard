import Link from "next/link";
import { BarChart3, Bell, CalendarDays, ClipboardList, Dumbbell, LayoutDashboard, Settings, Shield, UsersRound } from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import { en } from "@/lib/i18n/en";
import type { Squad } from "@/types/domain";

const navItems = [
  { href: "/dashboard", label: en.nav.dashboard, icon: LayoutDashboard },
  { href: "/teams", label: "Teams", icon: Shield },
  { href: "/trainings", label: en.nav.trainings, icon: CalendarDays },
  { href: "/sessions", label: en.nav.trainingPlans, icon: ClipboardList },
  { href: "/drills", label: en.nav.drills, icon: Dumbbell },
  { href: "/squad", label: en.nav.squad, icon: UsersRound },
  { href: "/actions", label: "Action Center", icon: Bell },
  { href: "/squad/analysis", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: en.nav.settings, icon: Settings }
];

type AppShellProps = {
  children: React.ReactNode;
  coachName?: string | null;
  teams?: Squad[];
};

export function AppShell({ children, coachName, teams = [] }: AppShellProps) {
  return (
    <div className="min-h-screen bg-board-paper [--app-mobile-header-height:7.25rem] [--app-sidebar-width:18rem] [--page-section-gap:1.5rem]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden border-r border-board-line bg-board-navy text-white lg:flex lg:w-72 lg:flex-col">
        <div className="flex h-20 items-center gap-3 px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-board-green">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-bold">{en.appName}</p>
            <p className="text-xs text-slate-300">Training planner</p>
          </div>
        </div>
        <div className="px-3 pb-4">
          <TeamSwitcher teams={teams} />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="px-3 text-xs uppercase text-slate-400">Signed in as</p>
          <p className="mb-3 truncate px-3 text-sm font-semibold text-white">{coachName ?? "Coach"}</p>
          <LogoutButton />
        </div>
      </aside>

      <div className="min-w-0 lg:pl-72">
        <header className="sticky top-0 z-10 min-h-[var(--app-mobile-header-height)] border-b border-board-line bg-white/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-board-navy">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-board-green text-white">
                <BarChart3 className="h-5 w-5" />
              </span>
              {en.appName}
            </Link>
            <LogoutButton />
          </div>
          <div className="px-3 pb-3">
            <div className="rounded-lg bg-board-navy p-2">
              <TeamSwitcher teams={teams} />
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="app-main mx-auto w-full min-w-0 px-3 py-5 sm:px-5 lg:px-6 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
