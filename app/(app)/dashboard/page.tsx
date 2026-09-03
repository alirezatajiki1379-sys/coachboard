import { Bell, CalendarDays, CalendarPlus, ClipboardList, Dumbbell, LibraryBig, Target, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMessage, getMessages } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";
import { attentionPriorityLabels, attentionTone } from "@/lib/squad/attention";
import { getDashboardAttentionData } from "@/lib/squad/attention-queries";
import { getDevelopmentDashboardSummary } from "@/lib/squad/development";
import { ensureActiveSquad, getActiveSquadPlayerCounts } from "@/lib/squad/squads";
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

  const activeTeam = await ensureActiveSquad(supabase, user.id);
  const locale = await getUserLocale(supabase, user.id);
  const messages = getMessages(locale);
  const [planCount, playerCounts, recentDrills, recentSessions] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null)
      .is("deleted_at", null),
    getActiveSquadPlayerCounts(supabase, user.id, activeTeam.id),
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
    getDevelopmentDashboardSummary(supabase, user.id, activeTeam.id),
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
    ? nextTraining.linkedTrainingSessionId ? messages.dashboard.actions.reviewTrainingPlan : messages.dashboard.actions.planNextTraining
    : messages.dashboard.actions.createTraining;

  const drills = (recentDrills.data ?? []) as RecentDrill[];
  const sessions = (recentSessions.data ?? []) as RecentSession[];
  return (
    <PageContainer width="wide" className="space-y-8">
      <PageHeader
        eyebrow={messages.dashboard.eyebrow}
        title={messages.dashboard.title}
        description={messages.dashboard.description}
        actions={(
          <>
          <ButtonLink href={planNextHref}>
            <ClipboardList className="h-4 w-4" />
            {planNextLabel}
          </ButtonLink>
          <ButtonLink href="/trainings/new" variant="secondary">
            <CalendarPlus className="h-4 w-4" />
            {messages.dashboard.actions.createTraining}
          </ButtonLink>
          <ButtonLink href="/squad/import" variant="secondary">
            <UsersRound className="h-4 w-4" />
            {messages.dashboard.actions.addOrImportPlayers}
          </ButtonLink>
          <ButtonLink href="/drills/new" variant="secondary">
            <Dumbbell className="h-4 w-4" />
            {messages.dashboard.actions.createDrill}
          </ButtonLink>
          <ButtonLink href="/drills" variant="secondary">
            <LibraryBig className="h-4 w-4" />
            {messages.dashboard.actions.drillLibrary}
          </ButtonLink>
          </>
        )}
      />

      {nextTraining ? (
        <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold uppercase text-board-green">{messages.dashboard.nextTraining}</p>
                <Link href="/trainings" className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-board-green hover:underline">
                  {messages.dashboard.actions.viewAllTrainings}
                </Link>
              </div>
              <h2 className="mt-1 text-2xl font-bold text-board-navy">{trainingDisplayTitle(nextTraining)}</h2>
              <p className="mt-2 text-sm text-slate-600">{formatDate(nextTraining.date, locale)} · {trainingTimeRange(nextTraining)}{nextTraining.location ? ` · ${nextTraining.location}` : ""}</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {trainingSummaryCounts(nextTraining).attendance.confirmedTotal} {messages.dashboard.expected} · {trainingSummaryCounts(nextTraining).attendance.goalkeepers} {messages.dashboard.goalkeepers} · {trainingSummaryCounts(nextTraining).attendance.fieldPlayers} {messages.dashboard.fieldPlayers}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {trainingSummaryCounts(nextTraining).attendance.defensive} {messages.dashboard.defensive} · {trainingSummaryCounts(nextTraining).attendance.midfield} {messages.dashboard.midfield} · {trainingSummaryCounts(nextTraining).attendance.attacking} {messages.dashboard.attacking} · {trainingSummaryCounts(nextTraining).attendance.unassigned} {messages.dashboard.positionMissing} · {nextTraining.linkedTrainingSessionId ? messages.dashboard.planAvailable : messages.dashboard.noPlan}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/trainings/${nextTraining.id}`} variant="secondary" className="justify-center">{messages.common.actions.open}</ButtonLink>
              <ButtonLink href={`/trainings/${nextTraining.id}/check-in`} className="justify-center">{messages.dashboard.actions.checkIn}</ButtonLink>
              <ButtonLink href={planNextHref} variant="secondary" className="justify-center">{nextTraining.linkedTrainingSessionId ? messages.dashboard.actions.reviewPlan : messages.dashboard.actions.planTraining}</ButtonLink>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={messages.dashboard.nextTraining}
          value={nextTraining ? trainingTimeRange(nextTraining) : messages.common.empty.none}
          detail={nextTraining ? `${formatDate(nextTraining.date, locale)} · ${nextTraining.squadName ?? messages.dashboard.currentTeam}` : messages.dashboard.actions.createTraining}
          icon={<CalendarDays className="h-5 w-5" />}
          href={nextTraining ? `/trainings/${nextTraining.id}` : "/trainings/new"}
        />
        <StatCard
          label={messages.dashboard.trainingSessions}
          value={trainingEvents.length}
          detail={`${completedTrainings} ${messages.dashboard.completed} · ${upcomingTrainings} ${messages.dashboard.upcoming}`}
          icon={<CalendarDays className="h-5 w-5" />}
          href="/trainings"
        />
        <StatCard
          label={messages.dashboard.trainingPlans}
          value={createdPlans}
          detail={`${assignedPlans} ${messages.dashboard.assigned} · ${draftPlans} ${messages.dashboard.draftsUnassigned}`}
          icon={<ClipboardList className="h-5 w-5" />}
          href="/sessions"
        />
        <StatCard
          label={messages.dashboard.squad}
          value={playerCounts.active}
          detail={`${playerCounts.trial} ${messages.dashboard.trialPlayers} · ${activeTeam.name}`}
          icon={<UsersRound className="h-5 w-5" />}
          href="/squad"
        />
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Bell className="h-5 w-5" />{messages.dashboard.coachActions}</h2>
            <p className="mt-1 text-sm text-slate-600">{formatMessage(messages.dashboard.highPriorityOpen, { count: attentionData.summary.critical + attentionData.summary.high, open: attentionData.summary.open })}</p>
          </div>
          <ButtonLink href="/actions" variant="ghost" className="h-9 px-3">{formatMessage(messages.dashboard.viewAllOpenActions, { count: attentionData.summary.open })}</ButtonLink>
        </div>
        {attentionData.items.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {attentionData.items.map((item) => (
              <Link key={item.key} href={item.suggestedActions[0]?.href ?? "/actions"} className="rounded-md border border-board-line bg-slate-50 p-4 transition hover:border-board-green/40 hover:bg-green-50">
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${attentionTone(item.priority) === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{attentionPriorityLabels[item.priority].toUpperCase()}</span>
                <h3 className="mt-3 font-bold text-board-navy">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.playerName} · {item.playerPosition ?? messages.dashboard.currentTeam}</p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{item.explanation}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-board-line p-5 text-sm text-slate-500">{messages.dashboard.noHighPriorityActions}</p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Target className="h-5 w-5" />{messages.dashboard.development}</h2>
            <ButtonLink href="/squad?view=reviews-due" variant="ghost" className="h-9 px-3">
              {messages.dashboard.actions.openReviews}
            </ButtonLink>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/squad?view=reviews-due" className="rounded-md bg-slate-50 p-3 transition hover:bg-green-50">
              <p className="text-xs font-bold uppercase text-slate-500">{messages.dashboard.review}</p>
              <p className="mt-1 text-xl font-bold text-board-navy">{developmentSummary.goalsDueForReview}</p>
              <p className="mt-1 text-xs text-slate-500">{messages.dashboard.goalsNeedReview}</p>
            </Link>
            <Link href="/squad?view=development&developmentStatus=high-priority" className="rounded-md bg-slate-50 p-3 transition hover:bg-green-50">
              <p className="text-xs font-bold uppercase text-slate-500">{messages.dashboard.highPriority}</p>
              <p className="mt-1 text-xl font-bold text-board-navy">{developmentSummary.activeHighPriorityGoals}</p>
              <p className="mt-1 text-xs text-slate-500">{messages.dashboard.activeGoals}</p>
            </Link>
            <Link href="/squad?view=development&sort=lastObservation&direction=asc" className="rounded-md bg-slate-50 p-3 transition hover:bg-green-50">
              <p className="text-xs font-bold uppercase text-slate-500">{messages.dashboard.thisWeek}</p>
              <p className="mt-1 text-xl font-bold text-board-navy">{developmentSummary.observationsThisWeek}</p>
              <p className="mt-1 text-xs text-slate-500">{messages.dashboard.observations}</p>
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-board-navy">{messages.dashboard.recentDrills}</h2>
            <ButtonLink href="/drills" variant="ghost" className="h-9 px-3">
              {messages.dashboard.actions.openLibrary}
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
                  {messages.dashboard.emptyDrills}
                </p>
                <ButtonLink href="/drills/new" className="mt-4 h-9 justify-center px-3">
                  <Dumbbell className="h-4 w-4" />
                  {messages.dashboard.createDrillShort}
                </ButtonLink>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-board-navy">{messages.dashboard.recentTrainingPlans}</h2>
            <ButtonLink href="/sessions" variant="ghost" className="h-9 px-3">
              {messages.dashboard.actions.viewPlans}
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
                        {session.main_focus ?? messages.common.empty.noFocus} · {formatDate(session.session_date, locale) || messages.common.empty.noDate}
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
                  {messages.dashboard.emptyPlans}
                </p>
                <ButtonLink href="/sessions/new" variant="secondary" className="mt-4 h-9 justify-center px-3">
                  <CalendarPlus className="h-4 w-4" />
                  {messages.dashboard.createPlan}
                </ButtonLink>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-board-navy">{messages.dashboard.openRatingWork}</h2>
            <ButtonLink href="/trainings?view=rating_open" variant="ghost" className="h-9 px-3">
              {messages.dashboard.actions.view}
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
                    <p className="mt-1 text-sm text-slate-500">{formatDate(event.date, locale)} · {formatMessage(messages.dashboard.ratedCount, { rated: summary.ratings.rated, rateable: summary.ratings.rateable })}</p>
                  </div>
                );
              })
            ) : (
              <p className="rounded-md border border-dashed border-board-line p-5 text-sm text-slate-500">{messages.dashboard.noOpenRatingWork}</p>
            )}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
