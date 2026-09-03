"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, CalendarDays, ClipboardList, Dumbbell, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Settings, UserCircle, UsersRound, X } from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Squad } from "@/types/domain";

type AppShellProps = {
  children: React.ReactNode;
  coachName?: string | null;
  teams?: Squad[];
  locale: Locale;
};

type SidebarMode = "expanded" | "collapsed";

const sidebarPreferenceKey = "coachboard:ui:sidebar-mode";

export function AppShell({ children, coachName, teams = [], locale }: AppShellProps) {
  const pathname = usePathname();
  const messages = getMessages(locale);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const collapsed = sidebarMode === "collapsed";

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(sidebarPreferenceKey);
      if (stored === "expanded" || stored === "collapsed") {
        setSidebarMode(stored);
      } else if (window.matchMedia("(max-width: 1279px)").matches) {
        setSidebarMode("collapsed");
      }
    } catch {
      // Keep the default expanded mode if local storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const trigger = menuButtonRef.current;
    const focusable = drawerRef.current?.querySelector<HTMLElement>("a,button,summary,input,select,textarea,[tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      trigger?.focus();
    };
  }, [drawerOpen]);

  const toggleDesktopSidebar = () => {
    setSidebarMode((current) => {
      const next = current === "collapsed" ? "expanded" : "collapsed";
      try {
        window.localStorage.setItem(sidebarPreferenceKey, next);
      } catch {
        // Preference persistence is non-critical.
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-board-paper [--app-mobile-header-height:4rem] [--page-section-gap:1.5rem]",
        collapsed ? "[--app-sidebar-width:4.5rem]" : "[--app-sidebar-width:18rem]"
      )}
    >
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[70] hidden border-r border-board-line bg-board-navy text-white transition-[width] duration-200 motion-reduce:transition-none lg:flex lg:flex-col",
          collapsed ? "lg:w-[4.5rem]" : "lg:w-72"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          coachName={coachName}
          teams={teams}
          pathname={pathname}
          onToggle={toggleDesktopSidebar}
          locale={locale}
        />
      </aside>

      <div className="min-w-0 transition-[padding] duration-200 motion-reduce:transition-none lg:pl-[var(--app-sidebar-width)]">
        <header className="sticky top-0 z-50 min-h-[var(--app-mobile-header-height)] border-b border-board-line bg-white/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-board-navy outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-board-green"
              aria-label={messages.accessibility.openNavigationMenu}
              aria-expanded={drawerOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-board-navy">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-board-green text-white">
                <BarChart3 className="h-5 w-5" />
              </span>
              {messages.app.name}
            </Link>
            <LogoutButton locale={locale} />
          </div>
        </header>
        <main className="app-main mx-auto w-full min-w-0 px-3 py-5 sm:px-5 lg:px-6 lg:py-6">{children}</main>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label={messages.accessibility.navigationMenu}>
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50"
            aria-label={messages.accessibility.closeNavigationMenu}
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            className="relative flex h-full w-[min(22rem,88vw)] flex-col bg-board-navy text-white shadow-2xl"
            onKeyDown={trapDrawerFocus}
          >
            <div className="flex h-16 items-center justify-between px-4">
              <Link href="/dashboard" className="flex items-center gap-3 font-bold text-white" onClick={() => setDrawerOpen(false)}>
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-board-green">
                  <BarChart3 className="h-5 w-5" />
                </span>
                {messages.app.name}
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-md text-slate-200 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-board-green"
                aria-label={messages.accessibility.closeNavigationMenu}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-3 pb-4">
              <TeamSwitcher teams={teams} locale={locale} />
            </div>
            <SidebarNav collapsed={false} pathname={pathname} onNavigate={() => setDrawerOpen(false)} locale={locale} />
            <SidebarAccount collapsed={false} coachName={coachName} locale={locale} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  collapsed,
  coachName,
  teams,
  pathname,
  onToggle,
  locale
}: {
  collapsed: boolean;
  coachName?: string | null;
  teams: Squad[];
  pathname: string;
  onToggle: () => void;
  locale: Locale;
}) {
  const messages = getMessages(locale);
  return (
    <>
      <div className={cn("flex h-20 items-center gap-3 px-4", collapsed ? "justify-center" : "justify-between")}>
        <Link href="/dashboard" className={cn("flex min-w-0 items-center gap-3 text-white", collapsed && "justify-center")} title={collapsed ? messages.app.name : undefined}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-board-green">
            <BarChart3 className="h-6 w-6" />
          </span>
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block text-lg font-bold">{messages.app.name}</span>
              <span className="block text-xs text-slate-300">{messages.app.subtitle}</span>
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-200 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-board-green",
            collapsed && "absolute left-full top-5 ml-2 bg-board-navy shadow-lg"
          )}
          aria-label={collapsed ? messages.accessibility.expandSidebar : messages.accessibility.collapseSidebar}
          aria-expanded={!collapsed}
          title={collapsed ? messages.accessibility.expandSidebar : messages.accessibility.collapseSidebar}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      <div className={cn("pb-4", collapsed ? "flex justify-center px-0" : "px-3")}>
        <TeamSwitcher teams={teams} compact={collapsed} locale={locale} />
      </div>
      <SidebarNav collapsed={collapsed} pathname={pathname} locale={locale} />
      <SidebarAccount collapsed={collapsed} coachName={coachName} locale={locale} />
    </>
  );
}

function SidebarNav({ collapsed, pathname, locale, onNavigate }: { collapsed: boolean; pathname: string; locale: Locale; onNavigate?: () => void }) {
  const messages = getMessages(locale);
  const navItems = [
    { href: "/dashboard", label: messages.navigation.dashboard, icon: LayoutDashboard },
    { href: "/trainings", label: messages.navigation.trainings, icon: CalendarDays },
    { href: "/sessions", label: messages.navigation.trainingPlans, icon: ClipboardList },
    { href: "/drills", label: messages.navigation.drills, icon: Dumbbell },
    { href: "/squad", label: messages.navigation.squad, icon: UsersRound },
    { href: "/actions", label: messages.navigation.actionCenter, icon: Bell },
    { href: "/squad/analysis", label: messages.navigation.analytics, icon: BarChart3 },
    { href: "/settings", label: messages.navigation.settings, icon: Settings }
  ];
  return (
    <nav className={cn("flex-1 space-y-1", collapsed ? "px-2" : "px-3")} aria-label={messages.accessibility.mainNavigation}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md text-sm font-medium transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-board-green",
              collapsed ? "h-10 justify-center px-0" : "px-3 py-2.5",
              active ? "bg-white/15 text-white shadow-[inset_3px_0_0_#37a96b]" : "text-slate-200"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarAccount({ collapsed, coachName, locale }: { collapsed: boolean; coachName?: string | null; locale: Locale }) {
  const messages = getMessages(locale);
  const fallbackName = coachName ?? messages.account.coachFallback;
  return (
    <div className={cn("border-t border-white/10", collapsed ? "flex flex-col items-center gap-2 p-3" : "p-4")}>
      {collapsed ? (
        <>
          <span
            className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-slate-200"
            title={formatMessage(messages.accessibility.signedInAs, { name: fallbackName })}
            aria-label={formatMessage(messages.accessibility.signedInAs, { name: fallbackName })}
          >
            <UserCircle className="h-5 w-5" />
          </span>
          <LogoutButton compact locale={locale} />
        </>
      ) : (
        <>
          <p className="px-3 text-xs uppercase text-slate-400">{messages.account.signedInAs}</p>
          <p className="mb-3 truncate px-3 text-sm font-semibold text-white">{fallbackName}</p>
          <LogoutButton locale={locale} />
        </>
      )}
    </div>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/squad") {
    if (pathname.startsWith("/squad/analysis")) return false;
    return pathname === "/squad" || pathname.startsWith("/squad/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function trapDrawerFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),summary,input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1'])")
  ).filter((element) => element.offsetParent !== null);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
