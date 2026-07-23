import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Plus, UsersRound } from "lucide-react";
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
import { getPositionFamily } from "@/lib/squad/positions";
import { formatDateLabel, trainingTimeRange } from "@/lib/trainings/utils";

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
  const boardPlayers = toBoardPlayers(event.attendance);
  const expected = event.attendance.length;
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
              {plan?.sourceTrainingSessionId ? <span className="rounded-md bg-green-50 px-2 py-1 text-green-800">Template copy</span> : <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-800">Session-only plan</span>}
            </div>
          </div>
          <form action={createBlankSessionPlan}>
            <input type="hidden" name="eventId" value={event.id} />
            <Button type="submit" variant="secondary" className="justify-center">Ensure Plan exists</Button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
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
                      <span className="block font-bold text-board-navy">{drill.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500">
                        <span>{drill.durationMinutes} min · {drill.minPlayers}-{drill.maxPlayers} Players</span>
                        {drill.status === "draft" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Draft</span> : null}
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
    .select("id,title,duration_minutes,min_players,max_players,status,updated_at")
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
  return ((data ?? []) as Array<{ id: string; title: string; duration_minutes: number; min_players: number; max_players: number; status: "draft" | "published" | null }>).map((row) => ({
    id: row.id,
    title: row.title,
    durationMinutes: row.duration_minutes,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    status: row.status ?? "published"
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
    goalkeeper: players.filter((player) => getPositionFamily(player.position) === "goalkeeper").length,
    defensive: players.filter((player) => getPositionFamily(player.position) === "defensive").length,
    midfield: players.filter((player) => getPositionFamily(player.position) === "midfield").length,
    attacking: players.filter((player) => getPositionFamily(player.position) === "attacking").length,
    unassigned: players.filter((player) => getPositionFamily(player.position) === "unassigned").length
  };
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
