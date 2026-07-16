import type { ReactNode } from "react";
import Link from "next/link";

type StatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
  href?: string;
};

export function StatCard({ label, value, detail, icon, href }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{value}</p>
        </div>
        {icon ? <div className="rounded-md bg-green-50 p-2 text-board-green">{icon}</div> : null}
      </div>
      {detail ? <p className="mt-3 text-sm text-slate-500">{detail}</p> : null}
    </>
  );

  const className =
    "block rounded-lg border border-board-line bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-board-green/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-board-green/30";

  if (href) {
    return (
      <Link href={href} className={className} aria-label={`Open ${label}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      {content}
    </div>
  );
}
