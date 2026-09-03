import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, CalendarDays, Dumbbell, Lightbulb, Plus, Star, Target, TrendingUp, UsersRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { SessionPlayerBoard, type SessionBoardGroup, type SessionBoardPlayer } from "@/components/squad/session-player-board";
import {
  addExistingDrillsToSessionPlan,
  createBlankSessionPlan,
  moveSessionPlanDrill,
  removeSessionPlanDrill,
  updateSessionPlanDrill
} from "@/lib/squad/training-plan-actions";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";
import { emptyDrillUsageStats, getDrillUsageStatsByDrillId, type DrillUsageStats } from "@/lib/drills/usage";
import { getPlanningContext, type PlanningContext, type PlanningSuggestedDrill } from "@/lib/squad/planning-intelligence";
import { getPositionFamily } from "@/lib/squad/positions";
import { formatDateLabel, trainingTimeRange } from "@/lib/trainings/utils";
import { cn } from "@/lib/utils";

const phaseOptions = ["Arrival / Activation", "Warm-up", "Main Part", "Game Form", "Cool-down"];

type TrainingPlanPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TrainingPlanPage({ params, searchParams }: TrainingPlanPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const drillSearch = typeof query.drillSearch === "string" ? query.drillSearch.trim() : "";
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event) notFound();
  const [plan, planDrills, libraryDrills, trainingGroups] = await Promise.all([
    loadPlanInstance(supabase, user.id, event.id),
    loadPlanDrills(supabase, user.id, event.id),
    loadLibraryDrills(supabase, user.id, drillSearch),
    loadTrainingGroups(supabase, user.id, event.id)
  ]);
  const planningContext = await getPlanningContext(supabase, user.id, event, planDrills);
  const boardPlayers = toBoardPlayers(event.attendance);
  const expectedEntries = event.attendance.filter((entry) => !entry.plannedStatus || entry.plannedStatus === "expected");
  const expected = expectedEntries.length;
  const composition = expectedEntries.reduce(
    (totals, entry) => {
      const family = getPositionFamily(entry.player?.position);
      if (family === "goalkeeper") totals.goalkeepers += 1;
      else if (family === "unassigned") totals.positionMissing += 1;
      else totals.fieldPlayers += 1;
      return totals;
    },
    { goalkeepers: 0, fieldPlayers: 0, positionMissing: 0 }
  );
  const plannedDuration = planDrills.reduce((sum, drill) => sum + (drill.plannedDurationMinutes ?? 0), 0);
  const scheduledDuration = scheduledDurationMinutes(event.startTime, event.endTime);
  const drillsByPhase = groupDrillsByPhase(planDrills);

  return (
    <div className="space-y-6">
      <Link href={`/trainings/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to training
      </Link>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-board-green">Session Plan Builder</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Build Training Plan</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <CalendarDays className="h-4 w-4" />
                {formatDateLabel(event.date)} · {trainingTimeRange(event)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <UsersRound className="h-4 w-4" />
                {event.squadName ?? "Active Team"}
              </span>
              <span className="rounded-md bg-green-50 px-2 py-1 text-green-800">
                {expected} expected
              </span>
              <span className={composition.goalkeepers === 0 ? "rounded-md bg-red-50 px-2 py-1 text-red-700" : "rounded-md bg-slate-100 px-2 py-1"}>
                {composition.goalkeepers} GK
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-1">
                {composition.fieldPlayers} field
              </span>
              {composition.positionMissing ? (
                <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">
                  {composition.positionMissing} position missing
                </span>
              ) : null}
              {plan?.sourceTrainingSessionId ? <span className="rounded-md bg-green-50 px-2 py-1 text-green-800">Template copy</span> : <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-800">Session-only plan</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/trainings/${event.id}`} variant="secondary" className="justify-center">Training Hub</ButtonLink>
            <ButtonLink href={`/trainings/${event.id}/check-in`} variant="secondary" className="justify-center">Quick Check-in</ButtonLink>
            {!plan ? (
              <form action={createBlankSessionPlan}>
                <input type="hidden" name="eventId" value={event.id} />
                <Button type="submit" className="justify-center">Create Plan</Button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <PlanningInsightsPanel eventId={event.id} context={planningContext} />

          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-board-navy">Training phases</h2>
                <p className="mt-1 text-sm text-slate-600">Add existing Drills, create a session-only Drill, then arrange the plan into phases.</p>
              </div>
              <ButtonLink href={`/trainings/${event.id}/drills/new?mode=session`} className="justify-center">
                <Plus className="h-4 w-4" />
                Create Drill inside Plan
              </ButtonLink>
            </div>

            <div className="mt-5 space-y-4">
              {phaseOptions.map((phase) => {
                const drills = drillsByPhase.get(phase) ?? [];
                if (!drills.length) return null;
                const phaseDuration = drills.reduce((sum, drill) => sum + (drill.plannedDurationMinutes ?? 0), 0);
                return (
                  <section key={phase} className="rounded-lg border border-board-line bg-board-paper p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-board-navy">{phase}</h3>
                      <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-600">{phaseDuration} min</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {drills.map((drill, index) => (
                        <PlanDrillCard key={drill.id} eventId={event.id} drill={drill} index={index} isFirst={index === 0} isLast={index === drills.length - 1} players={boardPlayers} />
                      ))}
                    </div>
                  </section>
                );
              })}
              {planDrills.filter((drill) => !phaseOptions.includes(drill.phase)).length ? (
                <section className="rounded-lg border border-board-line bg-board-paper p-4">
                  <h3 className="font-bold text-board-navy">Other phases</h3>
                  <div className="mt-3 space-y-3">
                    {planDrills.filter((drill) => !phaseOptions.includes(drill.phase)).map((drill, index) => (
                      <PlanDrillCard key={drill.id} eventId={event.id} drill={drill} index={index} isFirst={index === 0} isLast={index === planDrills.length - 1} players={boardPlayers} />
                    ))}
                  </div>
                </section>
              ) : null}
              {!planDrills.length ? (
                <div className="rounded-lg border border-dashed border-board-line bg-board-paper p-6 text-center">
                  <h3 className="text-lg font-bold text-board-navy">No Drills in this Session Plan yet</h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">Select Drills from the Library below or create a session-only Drill for this plan.</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Add existing Drills</h2>
            <p className="mt-1 text-sm text-slate-600">Choose several reusable Drills and add them as isolated Session Drill Instances.</p>
            <form className="mt-4 flex flex-col gap-2 sm:flex-row" action={`/trainings/${event.id}/plan`}>
              <input name="drillSearch" defaultValue={drillSearch} placeholder="Search Drill Library" className="h-10 min-w-0 flex-1 rounded-md border border-board-line px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
              <Button type="submit" variant="secondary" className="h-10 px-4">Search</Button>
            </form>
            <form action={addExistingDrillsToSessionPlan} className="mt-4 space-y-3">
              <input type="hidden" name="eventId" value={event.id} />
              <label className="block text-sm font-bold text-board-navy">
                Add to phase
                <select name="phase" defaultValue="Main Part" className="mt-1 h-10 w-full rounded-md border border-board-line px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                  {phaseOptions.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
                </select>
              </label>
              <div className="grid max-h-[32rem] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {libraryDrills.map((drill) => (
                  <label key={drill.id} className="flex items-start gap-3 rounded-md border border-board-line bg-board-paper p-3 text-sm">
                    <input name="drillIds" value={drill.id} type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 font-bold text-board-navy">
                        {drill.isFavorite ? <Star className="h-3.5 w-3.5 fill-board-green text-board-green" aria-label="Favorite" /> : null}
                        {drill.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500">
                        <span>{drill.durationMinutes} min · {drill.minPlayers}-{drill.maxPlayers} Players</span>
                        {drill.status === "draft" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Draft</span> : null}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">
                        {drill.usage.usageUnavailable
                          ? "Usage unavailable"
                          : drill.usage.historicalUseCount
                            ? `Used ${drill.usage.historicalUseCount} time${drill.usage.historicalUseCount === 1 ? "" : "s"} · Last ${formatPlanDrillUsageDate(drill.usage.lastUsedAt)}`
                            : "Never used"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {!libraryDrills.length ? <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No matching active Drills found.</p> : null}
              <Button type="submit" className="justify-center">Add selected Drills to Plan</Button>
            </form>
          </section>
        </div>

        <aside className="space-y-4">
          <PlanningContextSummary context={planningContext} event={event} scheduledDuration={scheduledDuration} />

          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Duration summary</h2>
            <div className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
              <p className="flex justify-between gap-3"><span>Planned content</span><span>{plannedDuration} min</span></p>
              {scheduledDuration !== null ? (
                <>
                  <p className="flex justify-between gap-3"><span>Scheduled Training</span><span>{scheduledDuration} min</span></p>
                  <p className={`rounded-md px-3 py-2 ${plannedDuration > scheduledDuration ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
                    {plannedDuration === scheduledDuration ? "Exact match" : plannedDuration > scheduledDuration ? `${plannedDuration - scheduledDuration} min over scheduled duration` : `${scheduledDuration - plannedDuration} min unplanned`}
                  </p>
                </>
              ) : null}
            </div>
          </section>

          <SessionPlayerBoard eventId={event.id} players={boardPlayers} groups={trainingGroups} />
          {!expected ? (
            <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
              <p className="text-sm font-semibold text-slate-600">0 expected Players.</p>
              <ButtonLink href={`/trainings/${event.id}/edit`} variant="secondary" className="mt-3 h-9 px-3">Edit Training participants</ButtonLink>
            </section>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

type PlanInstance = {
  id: string;
  title: string;
  sourceTrainingSessionId?: string;
};

type PlanDrill = {
  id: string;
  title: string;
  phase: string;
  orderIndex: number;
  plannedDurationMinutes?: number;
  sourceDrillId?: string;
  status: "draft" | "ready" | "removed";
};

type LibraryDrill = {
  id: string;
  title: string;
  durationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  status: "draft" | "published";
  isFavorite: boolean;
  usage: DrillUsageStats;
};

type TrainingGroupMemberRow = {
  id: string;
  group_id: string;
  player_id: string | null;
  custom_name: string | null;
};

async function loadPlanInstance(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, eventId: string): Promise<PlanInstance | null> {
  const { data, error } = await supabase
    .from("training_session_plan_instances")
    .select("id,title,source_training_session_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; title: string; source_training_session_id: string | null } | null;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    sourceTrainingSessionId: row.source_training_session_id ?? undefined
  };
}

async function loadPlanDrills(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, eventId: string): Promise<PlanDrill[]> {
  const { data, error } = await supabase
    .from("training_session_drill_instances")
    .select("id,title,block,order_index,planned_duration_minutes,source_drill_id,status")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .neq("status", "removed")
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; title: string; block: string | null; order_index: number; planned_duration_minutes: number | null; source_drill_id: string | null; status: "draft" | "ready" | "removed" | null }>).map((row) => ({
    id: row.id,
    title: row.title,
    phase: row.block ?? "Main Part",
    orderIndex: row.order_index,
    plannedDurationMinutes: row.planned_duration_minutes ?? undefined,
    sourceDrillId: row.source_drill_id ?? undefined,
    status: row.status ?? "ready"
  }));
}

async function loadLibraryDrills(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, search: string): Promise<LibraryDrill[]> {
  let query = supabase
    .from("drills")
    .select("id,title,duration_minutes,min_players,max_players,status,is_favorite,updated_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (search) {
    const safeSearch = search.replaceAll("%", "").replaceAll("_", "");
    query = query.or(`title.ilike.%${safeSearch}%,short_description.ilike.%${safeSearch}%,sub_focus.ilike.%${safeSearch}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; title: string; duration_minutes: number; min_players: number; max_players: number; status: "draft" | "published" | null; is_favorite: boolean | null }>;
  const usage = await getDrillUsageStatsByDrillId(supabase, userId, rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    durationMinutes: row.duration_minutes,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    status: row.status ?? "published",
    isFavorite: row.is_favorite ?? false,
    usage: usage.get(row.id) ?? emptyDrillUsageStats(row.id)
  }));
}

async function loadTrainingGroups(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, eventId: string): Promise<SessionBoardGroup[]> {
  const { data: groups, error: groupError } = await supabase
    .from("training_event_groups")
    .select("id,name,group_type,sort_order")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (groupError) throw new Error(groupError.message);
  const groupRows = (groups ?? []) as Array<{ id: string; name: string; group_type: "exclusive" | "label"; sort_order: number }>;
  if (!groupRows.length) return [];
  const { data: members, error: memberError } = await supabase
    .from("training_event_group_members")
    .select("id,group_id,player_id,custom_name,sort_order")
    .eq("user_id", userId)
    .in("group_id", groupRows.map((group) => group.id))
    .order("sort_order", { ascending: true });
  if (memberError) throw new Error(memberError.message);
  const membersByGroup = new Map<string, SessionBoardGroup["members"]>();
  for (const member of (members ?? []) as TrainingGroupMemberRow[]) {
    membersByGroup.set(member.group_id, [
      ...(membersByGroup.get(member.group_id) ?? []),
      { id: member.id, playerId: member.player_id ?? undefined, customName: member.custom_name ?? undefined }
    ]);
  }
  return groupRows.map((group) => ({
    id: group.id,
    name: group.name,
    groupType: group.group_type,
    members: membersByGroup.get(group.id) ?? []
  }));
}

function groupDrillsByPhase(drills: PlanDrill[]) {
  const map = new Map<string, PlanDrill[]>();
  for (const phase of phaseOptions) map.set(phase, []);
  for (const drill of drills) {
    map.set(drill.phase, [...(map.get(drill.phase) ?? []), drill]);
  }
  return map;
}

function PlanningInsightsPanel({ eventId, context }: { eventId: string; context: PlanningContext }) {
  const previous = context.previousSession;
  const development = context.development;
  const balance = context.trainingBalance;
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-board-green">Planning Insights</p>
          <h2 className="mt-1 text-lg font-bold text-board-navy">Evidence for this Session Plan</h2>
          <p className="mt-1 text-sm text-slate-600">Deterministic context from your team data. Nothing is added to the plan automatically.</p>
        </div>
        {context.errors.length ? <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Some insights unavailable</span> : null}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <InsightCard title="Last Session" icon={<Lightbulb className="h-4 w-4" />}>
          {previous ? (
            <div className="space-y-3 text-sm">
              <div>
                <Link href={`/trainings/${previous.event.id}`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
                  {previous.event.label}
                </Link>
                <p className="mt-1 text-xs font-semibold text-slate-500">{formatPlanDrillUsageDate(previous.event.date)}{previous.event.focus ? ` · ${previous.event.focus}` : ""}</p>
              </div>
              {previous.review?.nextTrainingNote ? (
                <div className="rounded-md bg-green-50 p-3 text-green-900">
                  <p className="text-xs font-bold uppercase tracking-wide text-green-700">From your last Session Review</p>
                  <p className="mt-1 font-semibold">{previous.review.nextTrainingNote}</p>
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-500">No “take into next Training” note recorded.</p>
              )}
              {previous.review ? (
                <p className="text-xs font-semibold text-slate-600">
                  Previous objective: <span className="font-bold text-board-navy">{objectiveLabel(previous.review.objectiveOutcome)}</span>
                </p>
              ) : (
                <p className="text-xs font-semibold text-slate-500">No Session Review recorded for the previous Training.</p>
              )}
              {previous.drillFeedback.length ? (
                <details>
                  <summary className="cursor-pointer text-xs font-bold text-board-green">View drill feedback</summary>
                  <div className="mt-2 space-y-2">
                    {previous.drillFeedback.slice(0, 3).map((feedback) => (
                      <div key={`${feedback.title}-${feedback.feedbackStatus}`} className="rounded-md border border-slate-100 p-2">
                        <p className="font-bold text-board-navy">{feedback.title}</p>
                        <p className="text-xs font-semibold text-slate-600">Last review: {feedbackLabel(feedback.feedbackStatus)}{feedback.effectivenessRating ? ` · ${feedback.effectivenessRating}/5` : ""}</p>
                        {feedback.note ? <p className="mt-1 text-xs text-slate-600">{feedback.note}</p> : null}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <EmptyInsight>No previous same-team Training context yet.</EmptyInsight>
          )}
        </InsightCard>

        <InsightCard title="Player Development" icon={<Target className="h-4 w-4" />}>
          {development.unavailable ? (
            <EmptyInsight>Development insights unavailable.</EmptyInsight>
          ) : development.activeGoals ? (
            <div className="space-y-3 text-sm">
              <p className="font-semibold text-board-navy">
                {development.expectedPlayersWithActiveGoals} expected Player{development.expectedPlayersWithActiveGoals === 1 ? "" : "s"} have {development.activeGoals} active Goal{development.activeGoals === 1 ? "" : "s"}.
              </p>
              <div className="flex flex-wrap gap-2">
                {development.categories.map((item) => (
                  <span key={item.category} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{developmentCategoryLabel(item.category)} {item.count}</span>
                ))}
                {development.highPriorityGoals ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">{development.highPriorityGoals} high priority</span> : null}
                {development.goalsDueForReview ? <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{development.goalsDueForReview} due for review</span> : null}
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-bold text-board-green">View Goals</summary>
                <div className="mt-2 space-y-2">
                  {development.examples.map((goal) => (
                    <div key={`${goal.playerName}-${goal.title}`} className="rounded-md border border-slate-100 p-2">
                      <p className="font-bold text-board-navy">{goal.playerName}</p>
                      <p className="text-xs font-semibold text-slate-600">{goal.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{developmentCategoryLabel(goal.category)} · {goal.priority} priority{goal.reviewDue ? " · review due" : ""}{goal.latestProgress ? ` · ${progressLabel(goal.latestProgress)}` : ""}</p>
                    </div>
                  ))}
                </div>
              </details>
              <ButtonLink href="/squad/development" variant="ghost" className="h-8 px-2 text-xs">Open Development</ButtonLink>
            </div>
          ) : (
            <EmptyInsight>No active Development Goals for expected Players.</EmptyInsight>
          )}
        </InsightCard>

        <InsightCard title="Training Balance" icon={<TrendingUp className="h-4 w-4" />}>
          {balance.unavailable ? (
            <EmptyInsight>Training balance unavailable.</EmptyInsight>
          ) : balance.lookbackCount ? (
            <div className="space-y-3 text-sm">
              <p className="font-semibold text-board-navy">Recent focus distribution from the last {balance.lookbackCount} same-team Training{balance.lookbackCount === 1 ? "" : "s"}.</p>
              {balance.focusDistribution.length ? (
                <div className="space-y-2">
                  {balance.focusDistribution.map((item) => (
                    <div key={item.focus} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                      <span className="font-semibold text-slate-700">{item.focus}</span>
                      <span className="font-bold text-board-navy">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-500">Focus recorded for 0 of {balance.lookbackCount} Trainings.</p>
              )}
              {balance.currentFocusCount !== undefined ? <p className="text-xs font-semibold text-slate-500">Current focus appeared in {balance.currentFocusCount} of those Trainings.</p> : null}
              <ButtonLink href="/squad/analysis?section=training&period=last5" variant="ghost" className="h-8 px-2 text-xs">View Analytics</ButtonLink>
            </div>
          ) : (
            <EmptyInsight>Planning insights will become richer as you complete more Trainings.</EmptyInsight>
          )}
        </InsightCard>

        <InsightCard title="Suggested Drills" icon={<Dumbbell className="h-4 w-4" />}>
          {context.suggestedDrills.length ? (
            <div className="space-y-3">
              {context.suggestedDrills.map((suggestion) => <SuggestedDrillCard key={suggestion.drill.id} eventId={eventId} suggestion={suggestion} />)}
            </div>
          ) : (
            <div className="space-y-3">
              <EmptyInsight>No strong Drill matches found for the current Session context.</EmptyInsight>
              <ButtonLink href="/drills" variant="secondary" className="h-9 px-3">Browse Drill Library</ButtonLink>
            </div>
          )}
        </InsightCard>
      </div>
    </section>
  );
}

function PlanningContextSummary({ context, event, scheduledDuration }: { context: PlanningContext; event: { focus?: string }; scheduledDuration: number | null }) {
  const composition = context.participantComposition;
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-board-green">Session Context</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <ContextMetric label="Expected" value={`${composition.expectedPlayers} Players`} />
        <ContextMetric label="Positions" value={`${composition.goalkeepers} GK · ${composition.fieldPlayers} field`} />
        <ContextMetric label="Duration" value={scheduledDuration !== null ? `${scheduledDuration} min` : "Not set"} />
        <ContextMetric label="Age" value={composition.ageContext ? `U${composition.ageContext}` : "Unknown"} />
      </div>
      {event.focus ? <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">Focus: {event.focus}</p> : null}
    </section>
  );
}

function InsightCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <article className="rounded-lg border border-board-line bg-board-paper p-4">
      <h3 className="flex items-center gap-2 font-bold text-board-navy">
        <span className="text-board-green">{icon}</span>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function SuggestedDrillCard({ eventId, suggestion }: { eventId: string; suggestion: PlanningSuggestedDrill }) {
  const negativeFeedback = suggestion.latestFeedback?.feedbackStatus === "needs_adjustment" || suggestion.latestFeedback?.feedbackStatus === "not_effective";
  return (
    <div className="rounded-md border border-board-line bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={`/drills/${suggestion.drill.id}`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
            {suggestion.drill.title}
          </Link>
          <p className="mt-1 text-xs font-semibold text-slate-500">{suggestion.phase} · {suggestion.drill.durationMinutes} min</p>
        </div>
        <form action={addExistingDrillsToSessionPlan}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="phase" value={suggestion.phase} />
          <input type="hidden" name="drillIds" value={suggestion.drill.id} />
          <Button type="submit" className="h-9 w-full justify-center px-3 sm:w-auto">Add to Plan</Button>
        </form>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {suggestion.reasons.slice(0, 4).map((reason) => (
          <span key={reason} className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-green-700">{reason}</span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestion.context.slice(0, 3).map((item) => (
          <span key={item} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{item}</span>
        ))}
      </div>
      {suggestion.latestFeedback ? (
        <div className={cn("mt-3 rounded-md px-3 py-2 text-xs font-semibold", negativeFeedback ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600")}>
          Last review: {feedbackLabel(suggestion.latestFeedback.feedbackStatus)}{suggestion.latestFeedback.effectivenessRating ? ` · ${suggestion.latestFeedback.effectivenessRating}/5` : ""}
          {suggestion.latestFeedback.note ? <span className="mt-1 block">{suggestion.latestFeedback.note}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ContextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-board-navy">{value}</p>
    </div>
  );
}

function EmptyInsight({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500">{children}</p>;
}

function PlanDrillCard({ eventId, drill, index, isFirst, isLast, players }: { eventId: string; drill: PlanDrill; index: number; isFirst: boolean; isLast: boolean; players: SessionBoardPlayer[] }) {
  const composition = getPlayerComposition(players);
  return (
    <article className="rounded-md border border-board-line bg-white p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">#{index + 1}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-board-navy">{drill.title || "Untitled Drill"}</h4>
            {drill.status === "draft" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Draft</span> : null}
            {drill.status === "draft" && drill.sourceDrillId ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Reusable Draft</span> : null}
            {drill.status === "draft" && !drill.sourceDrillId ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Session Draft</span> : null}
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {drill.plannedDurationMinutes ?? "Duration missing"}{drill.plannedDurationMinutes ? " min" : ""} · All expected Players · {players.length} assigned
          </p>
          {drill.status === "draft" ? (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Draft can stay in the plan. Missing information is non-blocking.
            </p>
          ) : null}
          {players.length ? (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {composition.goalkeeper} GK · {composition.defensive} DEF · {composition.midfield} MID · {composition.attacking} ATT
            </p>
          ) : null}
          {drill.sourceDrillId ? (
            <p className="mt-1 text-xs font-semibold text-slate-500">Recommended: source Drill range stays separate from assigned Session Players.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={moveSessionPlanDrill}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="drillInstanceId" value={drill.id} />
            <input type="hidden" name="direction" value="up" />
            <Button type="submit" variant="ghost" disabled={isFirst} className="h-8 px-2 text-xs">Up</Button>
          </form>
          <form action={moveSessionPlanDrill}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="drillInstanceId" value={drill.id} />
            <input type="hidden" name="direction" value="down" />
            <Button type="submit" variant="ghost" disabled={isLast} className="h-8 px-2 text-xs">Down</Button>
          </form>
          {drill.sourceDrillId ? <ButtonLink href={`/drills/${drill.sourceDrillId}`} variant="ghost" className="h-8 px-2 text-xs">Preview</ButtonLink> : null}
          {drill.sourceDrillId ? <ButtonLink href={`/drills/${drill.sourceDrillId}/edit?returnTo=/trainings/${eventId}/plan`} variant="ghost" className="h-8 px-2 text-xs">{drill.status === "draft" ? "Continue editing" : "Edit source"}</ButtonLink> : null}
        </div>
      </div>
      <form action={updateSessionPlanDrill} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="drillInstanceId" value={drill.id} />
        <label className="text-xs font-bold uppercase text-slate-500">
          Phase
          <select name="phase" defaultValue={drill.phase} className="mt-1 h-9 w-full rounded-md border border-board-line px-2 text-sm normal-case text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
            {phaseOptions.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold uppercase text-slate-500">
          Duration
          <input name="plannedDurationMinutes" type="number" min="0" defaultValue={drill.plannedDurationMinutes ?? 0} className="mt-1 h-9 w-full rounded-md border border-board-line px-2 text-sm normal-case text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
        </label>
        <Button type="submit" variant="secondary" className="h-9 self-end px-3">Update</Button>
      </form>
      <form action={removeSessionPlanDrill} className="mt-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="drillInstanceId" value={drill.id} />
        <Button type="submit" variant="ghost" className="h-8 px-2 text-xs text-red-700 hover:bg-red-50">Remove from Plan</Button>
      </form>
    </article>
  );
}

function toBoardPlayers(entries: Array<{ player?: SessionBoardPlayerSource; plannedStatus?: SessionBoardPlayer["plannedStatus"]; finalStatus?: SessionBoardPlayer["finalStatus"] }>): SessionBoardPlayer[] {
  return entries.filter((entry) => entry.player).map((entry) => ({
    id: entry.player?.id ?? "",
    name: [entry.player?.firstName, entry.player?.lastName].filter(Boolean).join(" "),
    position: entry.player?.position,
    secondaryPositions: entry.player?.secondaryPositions ?? [],
    playerType: entry.player?.playerType ?? "roster",
    plannedStatus: entry.plannedStatus,
    finalStatus: entry.finalStatus
  }));
}

type SessionBoardPlayerSource = {
  id: string;
  firstName: string;
  lastName?: string;
  position?: string;
  secondaryPositions: string[];
  playerType: "roster" | "trial";
};

function getPlayerComposition(players: SessionBoardPlayer[]) {
  return {
    goalkeeper: players.filter((player) => boardPositionFamily(player) === "goalkeeper").length,
    defensive: players.filter((player) => boardPositionFamily(player) === "defensive").length,
    midfield: players.filter((player) => boardPositionFamily(player) === "midfield").length,
    attacking: players.filter((player) => boardPositionFamily(player) === "attacking").length,
    unassigned: players.filter((player) => boardPositionFamily(player) === "unassigned").length
  };
}

function boardPositionFamily(player: SessionBoardPlayer) {
  if (player.position && getPositionFamily(player.position) !== "unassigned") return getPositionFamily(player.position);
  const secondary = player.secondaryPositions.find((position) => getPositionFamily(position) !== "unassigned");
  return getPositionFamily(secondary);
}

function scheduledDurationMinutes(startTime: string, endTime?: string) {
  if (!endTime) return null;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return null;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return end > start ? end - start : null;
}

function objectiveLabel(value: "achieved" | "partly_achieved" | "not_achieved") {
  const labels = {
    achieved: "Achieved",
    partly_achieved: "Partly achieved",
    not_achieved: "Not achieved"
  };
  return labels[value];
}

function feedbackLabel(value: "worked_well" | "needs_adjustment" | "not_effective") {
  const labels = {
    worked_well: "Worked well",
    needs_adjustment: "Needs adjustment",
    not_effective: "Not effective"
  };
  return labels[value];
}

function developmentCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    technical: "Technical",
    tactical: "Tactical",
    physical: "Physical",
    mental: "Mental",
    other: "Other"
  };
  return labels[category] ?? category;
}

function progressLabel(progress: string) {
  const labels: Record<string, string> = {
    needs_attention: "Needs attention",
    developing: "Developing",
    consistent: "Consistent",
    achieved: "Achieved"
  };
  return labels[progress] ?? progress;
}

function formatPlanDrillUsageDate(date?: string) {
  if (!date) return "historical training";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(parsed);
}
