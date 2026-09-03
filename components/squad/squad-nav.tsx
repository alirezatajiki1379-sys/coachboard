"use client";

import Link from "next/link";
import { PageTabs } from "@/components/layout/page";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SquadNavProps = {
  locale?: Locale;
};

export function SquadNav({ locale }: SquadNavProps) {
  const context = useOptionalI18n();
  const messages = context?.messages ?? getMessages(locale ?? "en");
  const items = [
    { href: "/squad", label: messages.squad.nav.players },
    { href: "/squad/planner", label: messages.squad.nav.planner },
    { href: "/squad/attendance", label: messages.squad.nav.attendance },
    { href: "/squad/ratings", label: messages.squad.nav.ratings },
    { href: "/squad/development", label: messages.squad.nav.development },
    { href: "/squad/analysis", label: messages.squad.nav.analytics }
  ];
  return (
    <PageTabs label={messages.squad.nav.label} className="flex-wrap">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn("rounded-md px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-board-navy")}
        >
          {item.label}
        </Link>
      ))}
    </PageTabs>
  );
}
