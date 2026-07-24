import { Bell, CalendarDays, CalendarPlus, ClipboardList, Dumbbell, LibraryBig, Target, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { createClient } from "@/lib/supabase/server";
import { en } from "@/lib/i18n/en";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";
import { attentionPriorityLabels, attentionTone } from "@/lib/squad/attention";
import { getDashboardAttentionData } from "@/lib/squad/attention-queries";
import { getDevelopmentDashboardSummary } from "@/lib/squad/development";
import { sortTrainings, trainingDisplayTitle, trainingSummaryCounts, trainingTimeRange } from "@/lib/trainings/utils";

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

  const [planCount, playerCount, trialCount, recentDrills, recentSessions] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null)
      .is("deleted_at", null),
    supabase
      .from("squad_players")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null)
      .is("deleted_at", null),
    supabase
      .from("squad_players")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("player_type", "trial")
      .is("archived_at", null)
      .is("deleted_at", null),
    supabase
      .from("drills")
      .select("id,title,main_focus,duration_minutes,updated_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("training_sessions")
      .select("id,title,session_date,main_focus,duration_target_minutes,updated_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5)
  ]);
  const [developmentSummary, attentionData] = await Promise.all([
    getDevelopmentDashboardSummary(supabase, user.id),
    getDashboardAttentionData(supabase, user.id)
  ]);
  const trainingEvents = sortTrainings(await listTrainingEventDetails(supabase, user.id));
  const today = new Date().toISOString().slice(0, 10);
  const nextTraining = trainingEvents.find((event) => event.date >= today);
  const completedTrainings = trainingEvents.filter((event) => event.status === "completed").length;
  const upcomingTrainings = trainingEvents.filter((event) => event.date >= today && event.status !== "completed").length;
  const assignedPlanIds = new Set(trainingEvents.map((event) => event.linkedTrainingSessionId).filter((id): id is string => Boolean(id)));
  const createdPlans = planCount.count ?? 0;
  const assignedPlans = Math.min(createdPlans, assignedPlanIds.size);
  const draftPlans = Math.max(0, createdPlans - assignedPlans);
  const openRatings = trainingEvents.filter((event) => event.status === "rating_open");
  const planNextHref = nextTraining
    ? nextTraining.linkedTrainingSessionId ? `/sessions/${nextTraining.linkedTrainingSessionId}` : `/trainings/${nextTraining.id}/plan`
    : "/trainings/new";
  const planNextLabel = nextTraining
    ? nextTraining.linkedTrainingSessionId ? "Review Training Plan" : "Plan Next Training"
    : "Create Training";

  const drills = (recentDrills.data ?? []) as RecentDrill[];
  const sessions = (recentSessions.data ?? []) as RecentSession[];
  return (
    <PageContainer width="wide" className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Welcome back, Coach"
        description="Plan concrete trainings, prepare attendance, rate players, and build reusable training plans."
        actions={(
          <>
          <ButtonLink href={planNextHref}>
            <ClipboardList className="h-4 w-4" />
            {planNextLabel}
          </ButtonLink>
          <ButtonLink href="/trainings/new" variant="secondary">
            <CalendarPlus className="h-4 w-4" />
            Create training
          </ButtonLink>
          <ButtonLink href="/squad/import" variant="secondary">
            <UsersRound className="h-4 w-4" />
            Add or import players
          </ButtonLink>
          <ButtonLink href="/drills/new" variant="secondary">
            <Dumbbell className="h-4 w-4" />
            {en.actions.createDrill}
          </ButtonLink>
          <ButtonLink href="/drills" variant="secondary">
            <LibraryBig className="h-4 w-4" />
            Drill library
          </ButtonLink>
          </>
        )}
      />

      {nextTraining ? (
        <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold uppercase text-board-green">Next training</p>
                <Link href="/trainings" className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-board-green hover:underline">
                  View all trainings
                </Link>
              </div>
              <h2 className="mt-1 text-2xl font-bold text-board-navy">{trainingDisplayTitle(nextTraining)}</h2>
              <p className="mt-2 text-sm text-slate-600">{nextTraining.date} · {trainingTimeRange(nextTraining)}{nextTraining.location ? ` · ${nextTraining.location}` : ""}</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {trainingSummaryCounts(nextTraining).attendance.confirmedTotal} expected · {trainingSummaryCounts(nextTraining).attendance.unavailable} unavailable · {trainingSummaryCounts(nextTraining).attendance.goalkeepers} GK · {trainingSummaryCounts(nextTraining).attendance.trialPlayers} trial · {nextTraining.linkedTrainingSessionId ? "Plan available" : "No plan"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/trainings/${nextTraining.id}`} variant="secondary" className="justify-center">Open</ButtonLink>
              <ButtonLink href={`/trainings/${nextTraining.id}/check-in`} className="justify-center">Check-in</ButtonLink>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Next training"
          value={nextTraining ? trainingTimeRange(nextTraining) : "None"}
          detail={nextTraining ? `${nextTraining.date} · ${nextTraining.squadName ?? "Current team"}` : "Create the next scheduled training"}
          icon={<CalendarDays className="h-5 w-5" />}
          href={nextTraining ? `/trainings/${nextTraining.id}` : "/trainings/new"}
        />
        <StatCard
          label="Training Sessions"
          value={trainingEvents.length}
          detail={`${completedTrainings} completed · ${upcomingTrainings} upcoming`}
          icon={<CalendarDays className="h-5 w-5" />}
          href="/trainings"
        />
        <StatCard
          label="Training Plans"
          value={createdPlans}
          detail={`${assignedPlans} assigned · ${draftPlans} drafts/unassigned`}
          icon={<ClipboardList className="h-5 w-5" />}
          href="/sessions"
        />
        <StatCard
          label="Squad"
          value={playerCount.count ?? 0}
          detail={`${trialCount.count ?? 0} Trial Players · active team scope`}
          icon={<UsersRound className="h-5 w-5" />}
          href="/squad"
        />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Bell className="h-5 w-5" />Coach Actions</h2>
            <p className="mt-1 text-sm text-slate-600">{attentionData.summary.critical + attentionData.summary.high} high priority · {attentionData.summary.open} open</p>
          </div>
          <ButtonLink href="/actions" variant="ghost" className="h-9 px-3">View all {attentionData.summary.open} open actions</ButtonLink>
        </div>
        {attentionData.items.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {attentionData.items.map((item) => (
              <Link key={item.key} href={item.suggestedActions[0]?.href ?? "/actions"} className="rounded-md border border-board-line bg-slate-50 p-4 transition hover:border-board-green/40 hover:bg-green-50">
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${attentionTone(item.priority) === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{attentionPriorityLabels[item.priority].toUpperCase()}</span>
                <h3 className="mt-3 font-bold text-board-navy">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.playerName} · {item.playerPosition ?? "Current"}</p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{item.explanation}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-board-line p-5 text-sm text-slate-500">No high-priority Coach Actions. Open items are still available in the Action Center when needed.</p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Target className="h-5 w-5" />Development</h2>
            <ButtonLink href="/squad?view=reviews-due" variant="ghost" className="h-9 px-3">
              Open reviews
            </ButtonLink>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/squad?view=reviews-due" className="rounded-md bg-slate-50 p-3 transition hover:bg-green-50">
              <p className="text-xs font-bold uppercase text-slate-500">Review</p>
              <p className="mt-1 text-xl font-bold text-board-navy">{developmentSummary.playersNeedingReview}</p>
              <p className="mt-1 text-xs text-slate-500">players need review</p>
            </Link>
            <Link href="/squad?view=development&developmentStatus=high-priority" className="rounded-md bg-slate-50 p-3 transition hover:bg-green-50">
              <p className="text-xs font-bold uppercase text-slate-500">High priority</p>
              <p className="mt-1 text-xl font-bold text-board-navy">{developmentSummary.activeHighPriorityGoals}</p>
              <p className="mt-1 text-xs text-slate-500">active goals</p>
            </Link>
            <Link href="/squad?view=development&sort=lastObservation&direction=asc" className="rounded-md bg-slate-50 p-3 transition hover:bg-green-50">
              <p className="text-xs font-bold uppercase text-slate-500">This week</p>
              <p className="mt-1 text-xl font-bold text-board-navy">{developmentSummary.observationsThisWeek}</p>
              <p className="mt-1 text-xs text-slate-500">observations</p>
            </Link>
          </div>
        </div>

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
              <div className="rounded-md border border-dashed border-board-line p-5">
                <p className="text-sm text-slate-500">
                  No drills yet. Create your first drill, draw the setup, and the library will become your reusable coaching base.
                </p>
                <ButtonLink href="/drills/new" className="mt-4 h-9 justify-center px-3">
                  <Dumbbell className="h-4 w-4" />
                  Create drill
                </ButtonLink>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-board-navy">Recent training plans</h2>
            <ButtonLink href="/sessions" variant="ghost" className="h-9 px-3">
              View plans
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
              <div className="rounded-md border border-dashed border-board-line p-5">
                <p className="text-sm text-slate-500">
                  No training plans yet. Add a few drills, then create a plan to build the timeline and material list.
                </p>
                <ButtonLink href="/sessions/new" variant="secondary" className="mt-4 h-9 justify-center px-3">
                  <CalendarPlus className="h-4 w-4" />
                  Create plan
                </ButtonLink>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-board-navy">Open rating work</h2>
            <ButtonLink href="/trainings?view=rating_open" variant="ghost" className="h-9 px-3">
              View
            </ButtonLink>
          </div>
          <div className="space-y-3">
            {openRatings.length ? (
              openRatings.slice(0, 4).map((event) => {
                const summary = trainingSummaryCounts(event);
                return (
                  <div key={event.id} className="rounded-md border border-board-line p-4">
                    <Link href={`/trainings/${event.id}`} className="font-semibold text-board-navy hover:text-board-green">
                      {trainingDisplayTitle(event)}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500">{event.date} · {summary.ratings.rated} of {summary.ratings.rateable} rated</p>
                  </div>
                );
              })
            ) : (
              <p className="rounded-md border border-dashed border-board-line p-5 text-sm text-slate-500">No open rating work right now.</p>
            )}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
