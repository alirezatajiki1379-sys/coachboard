import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, MapPin, Plus, Star, Trash2, UsersRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { CompleteEventButton, MissingStatusesNotice } from "@/components/squad/attendance-controls";
import { TrainingEventActions } from "@/components/squad/training-event-actions";
import { addCustomNameToTrainingGroup, addPlayersToTrainingGroup, createTrainingGroup, deleteTrainingGroup, removeTrainingGroupMember } from "@/lib/squad/training-group-actions";
import { applyTrainingPlanTemplate, createBlankSessionPlan } from "@/lib/squad/training-plan-actions";
import { attendanceDisplayName, finalStatusLabel, plannedReasonLabel, plannedStatusLabel, reliabilityMalus } from "@/lib/squad/attendance-format";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";
import { seasonLabelForDate, trainingDisplayTitle, trainingPlanStatus, trainingRatingStats, trainingSummaryCounts, trainingTimeRange } from "@/lib/trainings/utils";
import type { SquadAttendanceEntry } from "@/types/domain";

type TrainingPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrainingPage({ params }: TrainingPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event) notFound();
  const [planInstance, planDrills, planTemplates, trainingGroups] = await Promise.all([
    loadPlanInstance(supabase, user.id, event.id),
    loadTrainingDrillInstances(supabase, user.id, event.id),
    loadPlanTemplates(supabase, user.id),
    loadTrainingGroups(supabase, user.id, event.id)
  ]);
  const { plannedAttendance, finalAttendance } = trainingSummaryCounts(event);
  const ratings = trainingRatingStats(event);

  return (
    <div className="space-y-6">
      <Link href="/trainings" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to trainings
      </Link>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-board-green">{event.status.replaceAll("_", " ")} · Season {event.seasonLabel || seasonLabelForDate(event.date)}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{trainingDisplayTitle(event)}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-4 w-4" />{event.date} · {trainingTimeRange(event)}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><UsersRound className="h-4 w-4" />Team: {event.squadName ?? "Active Team"}</span>
              {event.recurrenceSeriesId ? <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">Recurring Training</span> : null}
              {event.isSeriesException ? <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">Series exception</span> : null}
              {event.deletedAt ? <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">In Trash</span> : null}
              {event.location ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><MapPin className="h-4 w-4" />{event.location}</span> : null}
              {event.focus ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><Star className="h-4 w-4" />{event.focus}</span> : null}
            </div>
            {event.generalNotes ? <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{event.generalNotes}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {!event.deletedAt ? <ButtonLink href={`/trainings/${event.id}/check-in`} className="justify-center">Quick check-in</ButtonLink> : null}
            {!event.deletedAt ? <ButtonLink href={`/trainings/${event.id}/ratings`} variant="secondary" className="justify-center">Ratings</ButtonLink> : null}
            <TrainingEventActions eventId={event.id} attendanceCount={event.attendance.length} isTrash={Boolean(event.deletedAt)} isRecurring={Boolean(event.recurrenceSeriesId)} />
            {!event.deletedAt ? <CompleteEventButton eventId={event.id} /> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Metric label="Expected" value={String(plannedAttendance.expected)} />
        <Metric label="Unavailable" value={String(plannedAttendance.unavailable)} />
        <Metric label="Unclear" value={String(plannedAttendance.unclear)} />
        <Metric label="Field players" value={String(plannedAttendance.fieldPlayers)} />
        <Metric label="Goalkeepers" value={String(plannedAttendance.goalkeepers)} tone={plannedAttendance.goalkeepers === 0 ? "warning" : "normal"} />
        <Metric label="Trial players" value={String(plannedAttendance.trialPlayers)} />
      </section>
      {plannedAttendance.goalkeepers === 0 ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">No goalkeeper expected.</p> : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Actual attendance" icon={<UsersRound className="h-5 w-5" />}>
          <MissingStatusesNotice entries={event.attendance} />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Metric label="Present" value={String(finalAttendance.present)} />
            <Metric label="Late" value={String(finalAttendance.late)} />
            <Metric label="Absent" value={String(finalAttendance.absent)} />
          </div>
          <ButtonLink href={`/trainings/${event.id}/check-in`} className="mt-4 justify-center">Open quick check-in</ButtonLink>
        </Panel>

        <Panel title="Ratings" icon={<Star className="h-5 w-5" />}>
          <p className="text-sm font-semibold text-slate-700">{ratings.rated} of {ratings.rateable} present players rated</p>
          <p className="mt-2 text-sm text-slate-500">Unrated players stay unrated. CoachBoard never creates automatic 3 ratings.</p>
          <ButtonLink href={`/trainings/${event.id}/ratings`} variant="secondary" className="mt-4 justify-center">Open ratings</ButtonLink>
        </Panel>
      </section>

      <Panel title="Training plan" icon={<ClipboardList className="h-5 w-5" />}>
        <p className="text-sm font-semibold text-board-navy">{trainingPlanStatus(event)}</p>
        {event.linkedTrainingSessionId ? (
          <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
            Based on template. This training uses a session snapshot, so session edits do not overwrite the original plan.
          </p>
        ) : null}
        {planInstance ? (
          <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
            Session Plan: {planInstance.title}
          </div>
        ) : null}
        {planDrills.length ? (
          <div className="mt-4 space-y-2">
            {planDrills.map((drill) => (
              <article key={drill.id} className="rounded-md border border-board-line bg-board-paper p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-board-navy">{drill.title}</p>
                    <p className="text-xs font-semibold text-slate-500">
                      {drill.block ?? "Training block"} · {drill.plannedDurationMinutes ? `${drill.plannedDurationMinutes} min` : "Duration open"}
                      {drill.sourceDrillId ? " · reusable Drill copy" : " · session-only Drill"}
                    </p>
                  </div>
                  {drill.sourceDrillId ? <ButtonLink href={`/drills/${drill.sourceDrillId}`} variant="ghost" className="h-8 px-2 text-xs">Open template</ButtonLink> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-board-line bg-board-paper p-5">
            <h3 className="text-lg font-bold text-board-navy">No Training Plan added yet</h3>
            <p className="mt-1 text-sm text-slate-600">Choose an existing Template or build a Plan for this Session.</p>
            <form action={createBlankSessionPlan} className="mt-4 inline-flex">
              <input type="hidden" name="eventId" value={event.id} />
              <Button type="submit" className="h-9 px-3">Create Plan for this Session</Button>
            </form>
            <details className="mt-3 rounded-md border border-board-line bg-white p-3">
              <summary className="cursor-pointer list-none text-sm font-bold text-board-navy">Choose Training Plan Template</summary>
              {planTemplates.length ? (
                <form action={applyTrainingPlanTemplate} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="eventId" value={event.id} />
                  <select name="templateId" required className="h-10 min-w-0 flex-1 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                    {planTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title} · {template.durationTargetMinutes ?? template.drillDurationMinutes} min · {template.drillCount} Drills
                      </option>
                    ))}
                  </select>
                  <Button type="submit" variant="secondary" className="h-10 px-3">Use Template</Button>
                </form>
              ) : (
                <p className="mt-3 text-sm text-slate-600">No reusable Training Plan Templates yet. Create one in Training Plans first.</p>
              )}
            </details>
          </div>
        )}
        {planDrills.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`/trainings/${event.id}/plan`} className="h-9 px-3">Edit Session Plan</ButtonLink>
            <details className="rounded-md border border-board-line bg-white px-3 py-2 text-sm font-bold text-board-navy">
              <summary className="cursor-pointer list-none">Change Training Plan Template</summary>
              {planTemplates.length ? (
                <form action={applyTrainingPlanTemplate} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="eventId" value={event.id} />
                  <select name="templateId" required className="h-10 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                    {planTemplates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
                  </select>
                  <Button type="submit" variant="secondary" className="h-10 px-3">Replace current Plan</Button>
                </form>
              ) : <p className="mt-2 text-xs font-semibold text-slate-500">No templates available.</p>}
            </details>
          </div>
        ) : null}
        {event.linkedTrainingSessionId ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/sessions/${event.linkedTrainingSessionId}`} variant="secondary" className="h-9 px-3">Open plan</ButtonLink>
            <ButtonLink href={`/sessions/${event.linkedTrainingSessionId}/edit`} variant="ghost" className="h-9 px-3">Edit plan</ButtonLink>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/sessions" variant="secondary" className="h-9 px-3">Choose existing plan</ButtonLink>
            <ButtonLink href="/sessions/new" className="h-9 px-3">Create training plan</ButtonLink>
          </div>
        )}
      </Panel>

      <div id="training-groups">
        <Panel title="Training groups" icon={<UsersRound className="h-5 w-5" />}>
          <TrainingGroupsPanel eventId={event.id} attendance={event.attendance} groups={trainingGroups} />
        </Panel>
      </div>

      <Panel title="Player records">
        <div className="space-y-3">
          {event.attendance.length ? (
            event.attendance.map((entry) => (
              <article key={entry.id} className="rounded-md border border-board-line bg-board-paper p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-board-navy">
                      {attendanceDisplayName(entry)}
                      {entry.player?.playerType === "trial" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Trial</span> : null}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Planned: {plannedStatusLabel(entry.plannedStatus)} · Actual: {finalStatusLabel(entry.finalStatus)}
                      {entry.plannedReason ? ` · Reason: ${plannedReasonLabel(entry.plannedReason)}` : ""}
                      {entry.overallRating ? ` · Rating: ${entry.overallRating}` : ""}
                      {` · Malus: ${reliabilityMalus(entry)}`}
                    </p>
                  </div>
                  {entry.player ? <ButtonLink href={`/squad/players/${entry.player.id}`} variant="ghost" className="h-8 px-2 text-xs">Profile</ButtonLink> : null}
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No players added yet. Open the attendance preparation page to add squad players or trial players.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

type TrainingDrillInstance = {
  id: string;
  sourceDrillId?: string;
  title: string;
  block?: string;
  orderIndex: number;
  plannedDurationMinutes?: number;
};

type TrainingPlanInstance = {
  id: string;
  title: string;
  sourceTrainingSessionId?: string;
};

type TrainingPlanTemplate = {
  id: string;
  title: string;
  durationTargetMinutes?: number;
  drillDurationMinutes: number;
  drillCount: number;
  updatedAt: string;
};

type TrainingGroupMember = {
  id: string;
  playerId?: string;
  customName?: string;
};

type TrainingGroup = {
  id: string;
  name: string;
  groupType: "exclusive" | "label";
  members: TrainingGroupMember[];
};

async function loadPlanInstance(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, eventId: string): Promise<TrainingPlanInstance | null> {
  const { data, error } = await supabase
    .from("training_session_plan_instances")
    .select("id,title,source_training_session_id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
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

async function loadTrainingDrillInstances(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, eventId: string): Promise<TrainingDrillInstance[]> {
  const { data, error } = await supabase
    .from("training_session_drill_instances")
    .select("id,source_drill_id,title,block,order_index,planned_duration_minutes")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    id: string;
    source_drill_id: string | null;
    title: string;
    block: string | null;
    order_index: number;
    planned_duration_minutes: number | null;
  }>).map((row) => ({
    id: row.id,
    sourceDrillId: row.source_drill_id ?? undefined,
    title: row.title,
    block: row.block ?? undefined,
    orderIndex: row.order_index,
    plannedDurationMinutes: row.planned_duration_minutes ?? undefined
  }));
}

async function loadPlanTemplates(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<TrainingPlanTemplate[]> {
  const { data, error } = await supabase
    .from("training_sessions")
    .select("id,title,duration_target_minutes,updated_at,training_session_drills(id,planned_duration_minutes)")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    id: string;
    title: string;
    duration_target_minutes: number | null;
    updated_at: string;
    training_session_drills?: Array<{ id: string; planned_duration_minutes: number | null }> | null;
  }>).map((row) => ({
    id: row.id,
    title: row.title,
    durationTargetMinutes: row.duration_target_minutes ?? undefined,
    drillDurationMinutes: (row.training_session_drills ?? []).reduce((sum, drill) => sum + (drill.planned_duration_minutes ?? 0), 0),
    drillCount: row.training_session_drills?.length ?? 0,
    updatedAt: row.updated_at
  }));
}

async function loadTrainingGroups(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, eventId: string): Promise<TrainingGroup[]> {
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
  const membersByGroup = new Map<string, TrainingGroupMember[]>();
  for (const member of (members ?? []) as Array<{ id: string; group_id: string; player_id: string | null; custom_name: string | null }>) {
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

function TrainingGroupsPanel({ eventId, attendance, groups }: { eventId: string; attendance: SquadAttendanceEntry[]; groups: TrainingGroup[] }) {
  const assignedPlayerIds = new Set(groups.flatMap((group) => group.members.map((member) => member.playerId).filter(Boolean) as string[]));
  const availablePlayers = attendance.filter((entry) => entry.player);
  const presentLate = availablePlayers.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z");
  const primaryPlayers = presentLate.length ? presentLate : availablePlayers.filter((entry) => entry.plannedStatus === "expected");
  const shownPlayers = primaryPlayers.length ? primaryPlayers : availablePlayers;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-board-line bg-board-paper p-4">
        <h3 className="font-bold text-board-navy">Create Training group</h3>
        <p className="mt-1 text-sm text-slate-600">Use real Players from this Training or keep the fast custom-name workflow for guests, jokers and temporary labels.</p>
        <form action={createTrainingGroup} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
          <input type="hidden" name="eventId" value={eventId} />
          <input name="name" required placeholder="Group A" className="h-10 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          <select name="groupType" defaultValue="exclusive" className="h-10 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
            <option value="exclusive">Exclusive playing group</option>
            <option value="label">Additional label group</option>
          </select>
          <Button type="submit" className="h-10 px-3"><Plus className="h-4 w-4" />Create</Button>
        </form>
      </div>

      {!groups.length ? (
        <div className="rounded-lg border border-dashed border-board-line bg-board-paper p-5">
          <h3 className="font-bold text-board-navy">No Training groups created yet</h3>
          <p className="mt-1 text-sm text-slate-600">Create groups using Training participants or custom names.</p>
          {!attendance.length ? <p className="mt-2 text-sm font-semibold text-amber-700">No Players are connected to this Training yet. Add participants to the Training or continue with custom names.</p> : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const memberPlayerIds = new Set(group.members.map((member) => member.playerId).filter(Boolean));
          const unassignedCount = availablePlayers.filter((entry) => entry.player && !assignedPlayerIds.has(entry.player.id)).length;
          return (
            <section key={group.id} className="rounded-lg border border-board-line bg-board-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-board-navy">{group.name}</h3>
                  <p className="text-xs font-semibold text-slate-500">
                    {group.members.length} member{group.members.length === 1 ? "" : "s"} · {group.groupType === "label" ? "Additional label group" : "Exclusive playing group"}
                  </p>
                </div>
                <form action={deleteTrainingGroup}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="groupId" value={group.id} />
                  <Button type="submit" variant="ghost" className="h-8 px-2 text-xs text-red-700 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </form>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {group.members.length ? (
                  group.members.map((member) => {
                    const entry = member.playerId ? attendance.find((item) => item.playerId === member.playerId) : undefined;
                    return (
                      <span key={member.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-board-navy ring-1 ring-board-line">
                        {entry ? attendanceDisplayName(entry) : member.customName}
                        <span className="text-slate-400">{entry ? statusLabel(entry) : "Custom"}</span>
                        <form action={removeTrainingGroupMember}>
                          <input type="hidden" name="eventId" value={eventId} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <button type="submit" className="text-red-600" aria-label="Remove member">x</button>
                        </form>
                      </span>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">No members yet.</p>
                )}
              </div>

              <details className="mt-4 rounded-md border border-board-line bg-white p-3">
                <summary className="cursor-pointer list-none text-sm font-bold text-board-navy">Add Players from this Training</summary>
                {shownPlayers.length ? (
                  <form action={addPlayersToTrainingGroup} className="mt-3 space-y-3">
                    <input type="hidden" name="eventId" value={eventId} />
                    <input type="hidden" name="groupId" value={group.id} />
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {shownPlayers.map((entry) => {
                        const player = entry.player;
                        if (!player) return null;
                        const alreadyInGroup = memberPlayerIds.has(player.id);
                        const assignedElsewhere = assignedPlayerIds.has(player.id) && !alreadyInGroup;
                        return (
                          <label key={entry.id} className="flex items-center gap-3 rounded-md border border-board-line px-3 py-2 text-sm font-semibold text-board-navy">
                            <input name="playerIds" value={player.id} type="checkbox" disabled={alreadyInGroup} className="h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{attendanceDisplayName(entry)}</span>
                              <span className="text-xs font-medium text-slate-500">{statusLabel(entry)}{player.playerType === "trial" ? " · Trial" : ""}{assignedElsewhere ? " · Already in another group" : ""}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs font-semibold text-slate-500">{unassignedCount} unassigned Player{unassignedCount === 1 ? "" : "s"}.</p>
                    <Button type="submit" variant="secondary" className="h-9 px-3">Add selected Players</Button>
                  </form>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No Players are connected to this Training yet.</p>
                )}
              </details>

              <form action={addCustomNameToTrainingGroup} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="groupId" value={group.id} />
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Custom name</span>
                  <input name="customName" placeholder="Add custom name, e.g. Guest 1" className="h-10 w-full rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                </label>
                <Button type="submit" variant="secondary" className="h-10 px-3">Add custom</Button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function statusLabel(entry: SquadAttendanceEntry) {
  if (entry.finalStatus === "present") return "Present";
  if (entry.finalStatus === "Z") return "Late";
  if (entry.finalStatus) return finalStatusLabel(entry.finalStatus);
  if (entry.plannedStatus) return plannedStatusLabel(entry.plannedStatus);
  return "Expected";
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warning" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "warning" ? "border-red-200 bg-red-50" : "border-board-line bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === "warning" ? "text-red-700" : "text-board-navy"}`}>{value}</p>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy">{icon}{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
