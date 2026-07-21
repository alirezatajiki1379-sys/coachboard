import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Plus, UsersRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  addExistingDrillsToSessionPlan,
  createBlankSessionPlan,
  moveSessionPlanDrill,
  removeSessionPlanDrill,
  updateSessionPlanDrill
} from "@/lib/squad/training-plan-actions";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { attendanceDisplayName, finalStatusLabel, plannedStatusLabel } from "@/lib/squad/attendance-format";
import { createClient } from "@/lib/supabase/server";
import { formatDateLabel, trainingTimeRange } from "@/lib/trainings/utils";
import type { SquadAttendanceEntry } from "@/types/domain";

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
  const [plan, planDrills, libraryDrills] = await Promise.all([
    loadPlanInstance(supabase, user.id, event.id),
    loadPlanDrills(supabase, user.id, event.id),
    loadLibraryDrills(supabase, user.id, drillSearch)
  ]);
  const expected = event.attendance.length;
  const presentLate = event.attendance.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z").length;
  const absent = event.attendance.filter((entry) => entry.finalStatus && entry.finalStatus !== "present" && entry.finalStatus !== "Z").length;
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
                        <PlanDrillCard key={drill.id} eventId={event.id} drill={drill} index={index} isFirst={index === 0} isLast={index === drills.length - 1} />
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
                      <PlanDrillCard key={drill.id} eventId={event.id} drill={drill} index={index} isFirst={index === 0} isLast={index === planDrills.length - 1} />
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
                      <span className="mt-1 block text-xs font-semibold text-slate-500">{drill.durationMinutes} min · {drill.minPlayers}-{drill.maxPlayers} Players</span>
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

          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Session Players</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="Expected" value={String(expected)} />
              <Metric label="Present + late" value={String(presentLate)} />
              <Metric label="Absent" value={String(absent)} />
              <Metric label="Trial" value={String(event.attendance.filter((entry) => entry.player?.playerType === "trial").length)} />
            </div>
            {expected ? (
              <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {event.attendance.map((entry) => (
                  <ParticipantRow key={entry.id} entry={entry} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-board-line p-4">
                <p className="text-sm font-semibold text-slate-600">0 expected Players.</p>
                <ButtonLink href={`/trainings/${event.id}/edit`} variant="secondary" className="mt-3 h-9 px-3">Edit Training participants</ButtonLink>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Groups</h2>
            <p className="mt-1 text-sm text-slate-600">Groups belong to this Training and stay available across the Session Plan.</p>
            <ButtonLink href={`/trainings/${event.id}#training-groups`} variant="secondary" className="mt-3 justify-center">Manage Training groups</ButtonLink>
          </section>
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
};

type LibraryDrill = {
  id: string;
  title: string;
  durationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
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
    .select("id,title,block,order_index,planned_duration_minutes,source_drill_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; title: string; block: string | null; order_index: number; planned_duration_minutes: number | null; source_drill_id: string | null }>).map((row) => ({
    id: row.id,
    title: row.title,
    phase: row.block ?? "Main Part",
    orderIndex: row.order_index,
    plannedDurationMinutes: row.planned_duration_minutes ?? undefined,
    sourceDrillId: row.source_drill_id ?? undefined
  }));
}

async function loadLibraryDrills(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, search: string): Promise<LibraryDrill[]> {
  let query = supabase
    .from("drills")
    .select("id,title,duration_minutes,min_players,max_players,updated_at")
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
  return ((data ?? []) as Array<{ id: string; title: string; duration_minutes: number; min_players: number; max_players: number }>).map((row) => ({
    id: row.id,
    title: row.title,
    durationMinutes: row.duration_minutes,
    minPlayers: row.min_players,
    maxPlayers: row.max_players
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

function PlanDrillCard({ eventId, drill, index, isFirst, isLast }: { eventId: string; drill: PlanDrill; index: number; isFirst: boolean; isLast: boolean }) {
  return (
    <article className="rounded-md border border-board-line bg-white p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">#{index + 1}</p>
          <h4 className="font-bold text-board-navy">{drill.title}</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {drill.plannedDurationMinutes ?? 0} min · Assigned: all expected Players
          </p>
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
          {drill.sourceDrillId ? <ButtonLink href={`/drills/${drill.sourceDrillId}`} variant="ghost" className="h-8 px-2 text-xs">Open source</ButtonLink> : null}
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

function ParticipantRow({ entry }: { entry: SquadAttendanceEntry }) {
  return (
    <div className="rounded-md border border-board-line bg-board-paper p-3">
      <p className="font-bold text-board-navy">{attendanceDisplayName(entry)}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        {entry.player?.position ?? "Position open"} · {entry.player?.playerType === "trial" ? "Trial Player" : "Roster Player"}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Planned: {entry.plannedStatus ? plannedStatusLabel(entry.plannedStatus) : "Expected"} · Actual: {entry.finalStatus ? finalStatusLabel(entry.finalStatus) : "Open"}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-board-line bg-board-paper p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-board-navy">{value}</p>
    </div>
  );
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
