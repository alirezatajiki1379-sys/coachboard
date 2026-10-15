import { Bell, CalendarDays, CalendarPlus, ChevronRight, ClipboardList, Dumbbell, LibraryBig, Target, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { TrainingWorkflowPanel } from "@/components/squad/training-workflow-panel";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMessage, getMessages, type Locale } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";
import { getDashboardAttentionData } from "@/lib/squad/attention-queries";
import { getDevelopmentDashboardSummary } from "@/lib/squad/development";
import { listTrainingSessionReviewSummaries } from "@/lib/squad/session-review";
import { listConcreteTrainingPlanEventIds } from "@/lib/squad/training-plan-queries";
import { ensureActiveSquad } from "@/lib/squad/squads";
import {
  dashboardTrainingsForNextDays,
  dashboardTrainingsForToday,
  isTrainingUpcoming,
  sortTrainings,
  trainingDisplayTitle,
  trainingNowParts,
  trainingTimeRange
} from "@/lib/trainings/utils";
import { getTrainingWorkflowState } from "@/lib/trainings/workflow";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [activeTeam, locale] = await Promise.all([
    ensureActiveSquad(supabase, user.id),
    getUserLocale(supabase, user.id)
  ]);
  const messages = getMessages(locale);
  const [developmentSummary, attentionData, trainingEventsRaw] = await Promise.all([
    getDevelopmentDashboardSummary(supabase, user.id, activeTeam.id),
    getDashboardAttentionData(supabase, user.id, locale),
    listTrainingEventDetails(supabase, user.id, { squadId: activeTeam.id })
  ]);
  const now = trainingNowParts();
  const ui = createSystemTranslator(locale);
  const trainingEvents = sortTrainings(trainingEventsRaw, now);
  const todayTrainings = dashboardTrainingsForToday(trainingEvents, now);
  const nextTraining = trainingEvents.find((event) => isTrainingUpcoming(event, now));
  const weekTrainings = dashboardTrainingsForNextDays(trainingEvents, 7, now)
    .filter((event) => todayTrainings.length > 0 || event.id !== nextTraining?.id);
  const workflowEvents = Array.from(new Map([...todayTrainings, ...(nextTraining ? [nextTraining] : []), ...weekTrainings].map((event) => [event.id, event])).values());
  const [workflowReviews, concretePlanEventIds] = await Promise.all([
    listTrainingSessionReviewSummaries(supabase, user.id, workflowEvents.map((event) => event.id)),
    listConcreteTrainingPlanEventIds(supabase, user.id, workflowEvents.map((event) => event.id))
  ]);
  const workflowByEventId = new Map(workflowEvents.map((event) => [event.id, getTrainingWorkflowState({
    event,
    hasPlan: concretePlanEventIds.has(event.id),
    hasReview: workflowReviews.has(event.id),
    now
  })]));
  const todayWorkflowEntries = todayTrainings.map((event) => ({ event, workflow: workflowByEventId.get(event.id)! }));
  const dashboardActionEntry = todayWorkflowEntries.find((entry) => entry.workflow.phase === "live" && entry.workflow.primaryAction)
    ?? todayWorkflowEntries.find((entry) => entry.workflow.phase === "follow_up" && entry.workflow.primaryAction)
    ?? todayWorkflowEntries.find((entry) => entry.workflow.phase === "preparation" && entry.workflow.primaryAction)
    ?? (nextTraining ? { event: nextTraining, workflow: workflowByEventId.get(nextTraining.id)! } : undefined);
  const dashboardPrimaryAction = dashboardActionEntry?.workflow.primaryAction;
  const planNextHref = dashboardPrimaryAction?.href ?? (dashboardActionEntry ? `/trainings/${dashboardActionEntry.event.id}` : "/trainings/new");
  const planNextLabel = dashboardPrimaryAction ? ui(dashboardPrimaryAction.label) : dashboardActionEntry ? ui("Open Training") : messages.dashboard.actions.createTraining;
  const showDevelopment = developmentSummary.goalsDueForReview > 0 || developmentSummary.activeHighPriorityGoals > 0;
  const isBrandNew = trainingEvents.length === 0;

  return (
    <PageContainer width="wide" className="space-y-8">
      <PageHeader
        eyebrow={messages.dashboard.eyebrow}
        title={messages.dashboard.title}
        description={messages.dashboard.description}
        metadata={<span translate="no">{activeTeam.name}</span>}
        actions={(
          <>
            <ButtonLink href={planNextHref} className="w-full justify-center sm:w-auto">
              <ClipboardList className="h-4 w-4" />
              {planNextLabel}
            </ButtonLink>
            {dashboardActionEntry ? (
              <ButtonLink href="/trainings/new" variant="secondary" className="w-full justify-center sm:w-auto">
                <CalendarPlus className="h-4 w-4" />
                {messages.dashboard.actions.createTraining}
              </ButtonLink>
            ) : null}
          </>
        )}
      />

      <section data-dashboard-operational className="rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy">
            <CalendarDays className="h-5 w-5" />
            {todayTrainings.length ? messages.dashboard.today : messages.dashboard.nextTraining}
          </h2>
          <Link href="/trainings" className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-board-green hover:underline">
            {messages.dashboard.actions.viewAllTrainings}
          </Link>
        </div>

        {todayTrainings.length ? (
          <div className="space-y-3">
            {todayTrainings.map((event) => {
              const workflow = workflowByEventId.get(event.id)!;

              return (
                <article key={event.id} className={`rounded-md border p-4 ${workflow.phase === "complete" ? "border-slate-200 bg-slate-50/70" : "border-board-line"}`}>
                  <div className="min-w-0">
                    <h3 translate="no" className="break-words text-lg font-bold text-board-navy [overflow-wrap:anywhere]">{trainingDisplayTitle(event)}</h3>
                    <p className="mt-1 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
                      {formatDate(event.date, locale)} · {trainingTimeRange(event)}{event.location ? <> · <span translate="no">{event.location}</span></> : null}
                    </p>
                  </div>
                  <TrainingWorkflowPanel workflow={workflow} compact openHref={`/trainings/${event.id}`} />
                </article>
              );
            })}
          </div>
        ) : (
          nextTraining ? (
            <article className="rounded-md border border-board-line p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">{formatDashboardDate(nextTraining.date, locale)} · {trainingTimeRange(nextTraining)}</p>
                <h3 translate="no" className="mt-1 break-words text-xl font-bold text-board-navy [overflow-wrap:anywhere]">{trainingDisplayTitle(nextTraining)}</h3>
                {nextTraining.location ? <p translate="no" className="mt-1 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{nextTraining.location}</p> : null}
              </div>
              <TrainingWorkflowPanel workflow={workflowByEventId.get(nextTraining.id)!} compact openHref={`/trainings/${nextTraining.id}`} />
            </article>
          ) : (
            <div className="rounded-md border border-dashed border-board-line p-5">
              <h3 className="font-bold text-board-navy">{isBrandNew ? messages.dashboard.startFirstTraining : messages.dashboard.noTrainingScheduled}</h3>
              <p className="mt-1 text-sm text-slate-600">{messages.dashboard.noTrainingScheduledDetail}</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <ButtonLink href="/trainings/new" className="w-full justify-center sm:w-auto">
                  <CalendarPlus className="h-4 w-4" />
                  {messages.dashboard.actions.createTraining}
                </ButtonLink>
                {isBrandNew ? (
                  <>
                    <ButtonLink href="/squad" variant="ghost" className="w-full justify-center sm:w-auto">{messages.dashboard.actions.addPlayer}</ButtonLink>
                    <ButtonLink href="/drills/new" variant="ghost" className="w-full justify-center sm:w-auto">{messages.dashboard.createDrillShort}</ButtonLink>
                  </>
                ) : null}
              </div>
            </div>
          )
        )}
      </section>

      <section data-dashboard-week aria-labelledby="dashboard-week" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="dashboard-week" className="text-lg font-bold text-board-navy">{messages.dashboard.thisWeek}</h2>
          <Link href="/trainings" className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-board-green hover:underline">{messages.dashboard.actions.viewAllTrainings}</Link>
        </div>
        {weekTrainings.length ? (
          <div className="overflow-hidden rounded-lg border border-board-line bg-white shadow-soft">
            {weekTrainings.slice(0, 4).map((event) => {
              const workflow = workflowByEventId.get(event.id)!;
              const planFact = workflow.facts.find((fact) => fact.label === "Plan");
              return (
                <Link key={event.id} href={`/trainings/${event.id}`} className="group flex min-w-0 flex-col gap-2 border-b border-board-line px-4 py-3 last:border-b-0 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-500">{formatDashboardDate(event.date, locale)} · {trainingTimeRange(event)}</p>
                    <p translate="no" className="mt-0.5 break-words font-bold text-board-navy [overflow-wrap:anywhere]">{trainingDisplayTitle(event)}</p>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">{ui(workflow.phaseLabel ?? "")}</span>
                    {planFact ? <span className="break-words [overflow-wrap:anywhere]">{ui(planFact.value, planFact.values)}</span> : null}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-board-green" />
                  </div>
                </Link>
              );
            })}
            {weekTrainings.length > 4 ? (
              <Link href="/trainings?view=upcoming" className="block border-t border-board-line px-4 py-3 text-sm font-semibold text-board-green hover:bg-slate-50">
                {formatMessage(messages.dashboard.moreTrainings, { count: weekTrainings.length - 4 })}
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{messages.dashboard.noOtherTrainingsThisWeek}</p>
        )}
      </section>

      <section data-dashboard-attention className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Bell className="h-5 w-5" />{messages.dashboard.needsAttention}</h2>
          </div>
          {attentionData.summary.open > 0 ? <ButtonLink href="/actions" variant="ghost" className="h-9 px-3">{formatMessage(messages.dashboard.viewAllOpenActions, { count: attentionData.summary.open })}</ButtonLink> : null}
        </div>
        {attentionData.items.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {attentionData.items.map((item) => (
              <Link key={item.key} href={item.suggestedActions[0]?.href ?? "/actions"} className="min-w-0 rounded-md border border-board-line bg-white p-4 shadow-soft transition-colors hover:border-board-green/40 hover:bg-green-50">
                <h3 className="break-words font-bold text-board-navy [overflow-wrap:anywhere]">{item.title}</h3>
                <p translate="no" className="mt-1 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{item.playerName} · {item.playerPosition ?? activeTeam.name}</p>
                <p className="mt-2 line-clamp-2 break-words text-sm text-slate-500 [overflow-wrap:anywhere]">{item.explanation}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{messages.dashboard.nothingUrgent}</p>
        )}
      </section>

      {showDevelopment ? (
        <section data-dashboard-development className="rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Target className="h-5 w-5" />{messages.dashboard.development}</h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {developmentSummary.goalsDueForReview > 0 ? (
              <Link href="/squad?view=reviews-due" className="min-w-0 rounded-md bg-slate-50 px-4 py-3 font-semibold text-board-navy hover:bg-green-50">
                {developmentSummary.goalsDueForReview === 1
                  ? messages.dashboard.developmentGoalDue
                  : formatMessage(messages.dashboard.developmentGoalsDue, { count: developmentSummary.goalsDueForReview })}
              </Link>
            ) : null}
            {developmentSummary.activeHighPriorityGoals > 0 ? (
              <Link href="/squad?view=development&developmentStatus=high-priority" className="min-w-0 rounded-md bg-slate-50 px-4 py-3 font-semibold text-board-navy hover:bg-green-50">
                {developmentSummary.activeHighPriorityGoals === 1
                  ? messages.dashboard.highDevelopmentFocusOne
                  : formatMessage(messages.dashboard.highDevelopmentFocus, { count: developmentSummary.activeHighPriorityGoals })}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section data-dashboard-quick-links aria-labelledby="dashboard-quick-links" className="min-w-0 border-t border-board-line pt-5">
        <h2 id="dashboard-quick-links" className="text-sm font-bold uppercase text-slate-500">{messages.dashboard.quickLinks}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ButtonLink href="/trainings" variant="ghost" className="w-full justify-start sm:w-auto"><CalendarDays className="h-4 w-4" />{messages.navigation.trainings}</ButtonLink>
          <ButtonLink href="/squad" variant="ghost" className="w-full justify-start sm:w-auto"><UsersRound className="h-4 w-4" />{messages.navigation.squad}</ButtonLink>
          <ButtonLink href="/drills" variant="ghost" className="w-full justify-start sm:w-auto"><LibraryBig className="h-4 w-4" />{messages.dashboard.actions.drillLibrary}</ButtonLink>
          <ButtonLink href="/sessions" variant="ghost" className="w-full justify-start sm:w-auto"><ClipboardList className="h-4 w-4" />{messages.navigation.trainingPlans}</ButtonLink>
          {showDevelopment ? <ButtonLink href="/squad?view=development" variant="ghost" className="w-full justify-start sm:w-auto"><Target className="h-4 w-4" />{messages.dashboard.development}</ButtonLink> : null}
          {isBrandNew ? <ButtonLink href="/drills/new" variant="ghost" className="w-full justify-start sm:w-auto"><Dumbbell className="h-4 w-4" />{messages.dashboard.createDrillShort}</ButtonLink> : null}
        </div>
      </section>
    </PageContainer>
  );
}

function formatDashboardDate(date: string, locale: Locale) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return formatDate(date, locale);
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
