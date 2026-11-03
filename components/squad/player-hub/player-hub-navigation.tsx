"use client";

import Link from "next/link";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AnalyticsPeriod } from "@/lib/squad/analytics";
import type { PlayerHubTab } from "@/lib/squad/player-hub";
import { cn } from "@/lib/utils";

type NavigationItem = { id: PlayerHubTab; en: string; de: string };

const primaryItems: NavigationItem[] = [
  { id: "overview", en: "Overview", de: "Übersicht" },
  { id: "development", en: "Development", de: "Entwicklung" },
  { id: "analytics", en: "Analytics", de: "Analyse" },
  { id: "medical", en: "Availability", de: "Verfügbarkeit" },
  { id: "history", en: "History", de: "Verlauf" }
];

const secondaryItems: NavigationItem[] = [
  { id: "reviews", en: "Player conversations", de: "Spielergespräche" },
  { id: "attendance", en: "Attendance details", de: "Anwesenheitsdetails" },
  { id: "notes", en: "Notes", de: "Notizen" },
  { id: "details", en: "Details", de: "Stammdaten" }
];

export function PlayerHubNavigation({ playerId, activeTab, period, customFrom, customTo, locale }: {
  playerId: string;
  activeTab: PlayerHubTab;
  period: AnalyticsPeriod;
  customFrom?: string;
  customTo?: string;
  locale: "en" | "de";
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeSecondary = secondaryItems.find((item) => item.id === activeTab);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return (
    <nav aria-label={locale === "de" ? "Spielerprofil" : "Player profile"} className="rounded-lg border border-board-line bg-white p-2 shadow-soft">
      <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {primaryItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <Link
              key={item.id}
              aria-current={active ? "page" : undefined}
              href={playerTabHref(playerId, item.id, period, customFrom, customTo)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-md px-3 py-2 text-sm font-bold transition-colors",
                active ? "bg-board-green text-white" : "text-slate-600 hover:bg-green-50 hover:text-board-green"
              )}
            >
              {item[locale]}
            </Link>
          );
        })}
        <div ref={menuRef} className="relative ml-auto shrink-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition-colors",
              activeSecondary ? "bg-board-green text-white" : "text-slate-600 hover:bg-green-50 hover:text-board-green"
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span>{locale === "de" ? "Mehr" : "More"}{activeSecondary ? ` · ${activeSecondary[locale]}` : ""}</span>
            <ChevronDown className="h-4 w-4" />
          </button>
          {open ? (
            <div role="menu" className="fixed left-3 right-3 z-40 mt-2 rounded-lg border border-board-line bg-white p-2 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:w-64">
              {secondaryItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <Link
                    key={item.id}
                    role="menuitem"
                    aria-current={active ? "page" : undefined}
                    href={playerTabHref(playerId, item.id, period, customFrom, customTo)}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-bold",
                      active ? "bg-green-50 text-board-green" : "text-board-navy hover:bg-slate-50"
                    )}
                  >
                    {item[locale]}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

function playerTabHref(playerId: string, tab: PlayerHubTab, period: AnalyticsPeriod, customFrom?: string, customTo?: string) {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (period !== "season") params.set("period", period);
  if (period === "custom") {
    if (customFrom) params.set("from", customFrom);
    if (customTo) params.set("to", customTo);
  }
  const query = params.toString();
  return `/squad/players/${playerId}${query ? `?${query}` : ""}`;
}
