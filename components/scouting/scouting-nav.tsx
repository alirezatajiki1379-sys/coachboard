import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { scoutingCopy } from "@/lib/scouting/copy";
import { cn } from "@/lib/utils";

export function ScoutingNav({ locale, active }: { locale: Locale; active: "overview" | "players" | "targets" }) {
  const copy = scoutingCopy(locale);
  const items = [
    { id: "overview", label: copy.overview, href: "/scouting" },
    { id: "players", label: copy.players, href: "/scouting/players" },
    { id: "targets", label: copy.targets, href: "/scouting/targets" }
  ] as const;
  return (
    <nav aria-label={copy.scouting} className="flex flex-wrap gap-1 border-b border-board-line">
      {items.map((item) => (
        <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined}
          className={cn("border-b-2 px-3 py-3 text-sm font-bold", active === item.id ? "border-board-green text-board-navy" : "border-transparent text-slate-600 hover:text-board-navy")}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
