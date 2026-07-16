import { CalendarDays, CalendarPlus, ClipboardList, Dumbbell, LibraryBig, Shapes } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { createClient } from "@/lib/supabase/server";
import { en } from "@/lib/i18n/en";

type RecentDrill = {
  id: string;
  title: string;
  main_focus: string;
  duration_minutes: number;
  updated_at: string;
};

type RecentSession = {
  id: string;
  title: string;
  session_date: string | null;
  main_focus: string | null;
  duration_target_minutes: number | null;
  updated_at: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [drillCount, sessionCount, templateCount, recentDrills, recentSessions] = await Promise.all([
    supabase.from("drills").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("training_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("drill_graphic_templates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("drills")
      .select("id,title,main_focus,duration_minutes,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("training_sessions")
      .select("id,title,session_date,main_focus,duration_target_minutes,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(5)
  ]);

  const drills = (recentDrills.data ?? []) as RecentDrill[];
  const sessions = (recentSessions.data ?? []) as RecentSession[];
  const focusCounts =
    drills.reduce<Record<string, number>>((acc, drill) => {
      acc[drill.main_focus] = (acc[drill.main_focus] ?? 0) + 1;
      return acc;
    }, {});
  const topFocus = Object.entries(focusCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Add drills to learn";

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy sm:text-4xl">
            Welcome back, Coach
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Build reusable drills, assemble training sessions, and keep material planning under control.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/drills/new">
            <Dumbbell className="h-4 w-4" />
            {en.actions.createDrill}
          </ButtonLink>
          <ButtonLink href="/sessions/new" variant="secondary">
            <CalendarPlus className="h-4 w-4" />
            {en.actions.createSession}
          </ButtonLink>
          <ButtonLink href="/drills" variant="secondary">
            <LibraryBig className="h-4 w-4" />
            Drill library
          </ButtonLink>
          <ButtonLink href="/sessions" variant="secondary">
            <CalendarDays className="h-4 w-4" />
            Sessions
          </ButtonLink>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total drills"
          value={drillCount.count ?? 0}
          detail="Private drills in your library"
          icon={<Dumbbell className="h-5 w-5" />}
          href="/drills"
        />
        <StatCard
          label="Total sessions"
          value={sessionCount.count ?? 0}
          detail="Training plans created"
          icon={<ClipboardList className="h-5 w-5" />}
          href="/sessions"
        />
        <StatCard
          label="Saved templates"
          value={templateCount.count ?? 0}
          detail="Reusable graphic setups"
          icon={<Shapes className="h-5 w-5" />}
          href="/drills/new"
        />
        <StatCard
          label="Most used focus"
          value={topFocus}
          detail="Based on recent drills for now"
          icon={<LibraryBig className="h-5 w-5" />}
          href="/drills"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-board-navy">Recent drills</h2>
            <ButtonLink href="/drills" variant="ghost" className="h-9 px-3">
              Open library
            </ButtonLink>
          </div>
          <div className="space-y-3">
            {drills.length ? (
              drills.map((drill) => (
                <div key={drill.id} className="rounded-md border border-board-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/drills/${drill.id}`} className="font-semibold text-board-navy hover:text-board-green">
                        {drill.title}
                      </Link>
                      <p className="mt-1 text-sm text-slate-500">{drill.main_focus}</p>
                    </div>
                    <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-board-green">
                      {drill.duration_minutes} min
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-board-line p-5 text-sm text-slate-500">
                No drills yet. Create your first drill, draw the setup, and the library will become your reusable coaching base.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-board-navy">Recent training sessions</h2>
            <ButtonLink href="/sessions" variant="ghost" className="h-9 px-3">
              View sessions
            </ButtonLink>
          </div>
          <div className="space-y-3">
            {sessions.length ? (
              sessions.map((session) => (
                <div key={session.id} className="rounded-md border border-board-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/sessions/${session.id}`} className="font-semibold text-board-navy hover:text-board-green">
                        {session.title}
                      </Link>
                      <p className="mt-1 text-sm text-slate-500">
                        {session.main_focus ?? "No focus set"} · {session.session_date ?? "No date"}
                      </p>
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      {session.duration_target_minutes ?? 0} min
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-board-line p-5 text-sm text-slate-500">
                No sessions yet. Add a few drills, then create a session to build the training timeline and material list.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
