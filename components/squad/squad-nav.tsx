import Link from "next/link";
import { cn } from "@/lib/utils";

const items = [
  { href: "/squad", label: "Players" },
  { href: "/squad/attendance", label: "Attendance" },
  { href: "/squad/ratings", label: "Ratings" },
  { href: "/squad/development", label: "Development" },
  { href: "/squad/analysis", label: "Analytics" }
];

export function SquadNav() {
  return (
    <nav className="flex flex-wrap gap-2 rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label="Squad sections">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn("rounded-md px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-board-navy")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
