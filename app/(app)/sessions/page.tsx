import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { SessionCard } from "@/components/sessions/session-card";
import { createClient } from "@/lib/supabase/server";
import { listUserSessions, parseSessionListView } from "@/lib/sessions/queries";
import { cn } from "@/lib/utils";

type SessionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const view = parseSessionListView(await searchParams);
  const sessions = await listUserSessions(supabase, user.id, view);
  const viewLabels = { active: "Active", archived: "Archived", trash: "Trash" } as const;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Training plans</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Training plan library</h1>
          <p className="mt-2 text-slate-600">Build ordered timelines, calculate materials, and prepare complete training plans.</p>
        </div>
        <ButtonLink href="/sessions/new">
          <CalendarPlus className="h-4 w-4" />
          Create training plan
        </ButtonLink>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label="Training plan views">
        {(["active", "archived", "trash"] as const).map((item) => (
          <Link
            key={item}
            href={item === "active" ? "/sessions" : `/sessions?view=${item}`}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-semibold transition",
              view === item ? "bg-board-green text-white" : "text-slate-600 hover:bg-slate-100 hover:text-board-navy"
            )}
          >
            {viewLabels[item]}
          </Link>
        ))}
      </nav>

      <section className="space-y-4">
        {sessions.length ? (
          sessions.map((session) => <SessionCard key={session.id} session={session} view={view} />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No {viewLabels[view].toLowerCase()} training plans found.</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Training plans combine saved drills into blocks, station sets, player groups, timelines, and a printable material list.
            </p>
            <ButtonLink href="/sessions/new" className="mt-5">
              <CalendarPlus className="h-4 w-4" />
              Create training plan
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  );
}
