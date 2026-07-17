import { ArrowLeft, Clock, Edit, FileText, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { SessionActions } from "@/components/sessions/session-actions";
import { SessionDrillPreview } from "@/components/sessions/session-drill-preview";
import { MaterialSummaryList } from "@/components/sessions/material-summary-list";
import { materialSummary } from "@/lib/drills/materials";
import { createClient } from "@/lib/supabase/server";
import { getUserSession, type SessionDrillDetail } from "@/lib/sessions/queries";
import { calculateSessionDuration, calculateSessionMaterials, durationDeltaLabel, effectiveStationDuration, formatTimelineRange, groupByTrainingBlock, normalizeSimultaneousGroup, resolveGroupName, stationSetLabel, stationSetOptions } from "@/lib/sessions/utils";
import type { SessionPlayerGroup } from "@/types/domain";

type SessionDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const session = await getUserSession(supabase, user.id, id);
  if (!session) notFound();

  const total = calculateSessionDuration(session.drills);
  const materials = calculateSessionMaterials(
    session.drills.map((item) => ({
      drill: item.drill,
      timingMode: item.timingMode,
      simultaneousGroup: item.simultaneousGroup
    }))
  );
  const blocks = groupByTrainingBlock(session.drills);
  const targetLabel = durationDeltaLabel(total, session.durationTargetMinutes);
  const view = session.deletedAt ? "trash" : session.archivedAt ? "archived" : "active";

  return (
    <div className="space-y-6">
      <Link href="/sessions" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to sessions
      </Link>

      <section className="rounded-lg border border-board-line bg-white p-6 shadow-soft">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold uppercase text-board-green">{session.mainFocus || "Training session"}</p>
              {view === "archived" ? <StatusBadge label="Archived" /> : null}
              {view === "trash" ? <StatusBadge label="Trash" danger /> : null}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{session.title}</h1>
            <p className="mt-2 text-slate-600">
              {session.date || "No date"} {session.startTime ? `- ${session.startTime}` : ""} {session.teamAgeGroup ? `- ${session.teamAgeGroup}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/sessions/${session.id}/print`} variant="primary">
              <FileText className="h-4 w-4" />
              Export PDF
            </ButtonLink>
            {view !== "trash" ? <ButtonLink href={`/sessions/${session.id}/edit`} variant="secondary">
              <Edit className="h-4 w-4" />
              Edit
            </ButtonLink> : null}
            <SessionActions sessionId={session.id} view={view} />
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <Metric label="Total duration" value={`${total} min`} icon={<Clock className="h-4 w-4" />} />
          <Metric label="Expected players" value={session.expectedPlayers ? String(session.expectedPlayers) : "Not set"} icon={<Users className="h-4 w-4" />} />
          <Metric label="Location" value={session.location || "Not set"} icon={<MapPin className="h-4 w-4" />} />
          <Metric label="Drills" value={String(session.drills.length)} />
        </div>
        {session.durationTargetMinutes ? (
          <p className="mt-4 rounded-md bg-board-paper px-3 py-2 text-sm font-semibold text-slate-700">
            Target: {session.durationTargetMinutes} min - {targetLabel}
          </p>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {blocks.map((block) => {
            const blockStart = blocks.slice(0, blocks.findIndex((candidate) => candidate.block === block.block)).reduce((sum, candidate) => sum + candidate.duration, 0);
            const blockMaterials = calculateSessionMaterials(
              block.items.map((item) => ({
                drill: item.drill,
                timingMode: item.timingMode,
                simultaneousGroup: item.simultaneousGroup
              }))
            );
            return (
            <section key={block.block} className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-board-line pb-4">
                <div>
                  <h2 className="text-xl font-bold text-board-navy">{block.block}</h2>
                  <p className="text-sm text-slate-500">{formatTimelineRange(blockStart, block.duration, session.startTime)} - {block.items.length} drills - {block.duration} min</p>
                  {block.stationSets.length ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                      {block.stationSets.map((set) => <span key={set.name} className="rounded-md bg-board-paper px-2 py-1">{set.name}: {set.duration} min</span>)}
                    </div>
                  ) : null}
                </div>
                {blockMaterials.length ? (
                  <div className="min-w-[220px] max-w-sm rounded-md border border-board-line bg-board-paper p-3 text-sm text-slate-600">
                    <h3 className="text-xs font-bold uppercase text-board-green">Block materials</h3>
                    <div className="mt-2">
                      <MaterialSummaryList materials={blockMaterials} />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 space-y-4">
                {stationSetOptions.map((set) => {
                  const setItems = block.items.filter((item) => item.timingMode === "simultaneous" && normalizeSimultaneousGroup(item.simultaneousGroup) === set.id);
                  if (!setItems.length) return null;
                  return (
                    <section key={`${block.block}-${set.id}`} className="rounded-md border border-board-line bg-board-paper p-3">
                      <h3 className="mb-3 text-sm font-bold text-board-navy">{set.label}</h3>
                      <div className="space-y-4">{setItems.map((item) => <SessionDrillDetailCard key={item.id} item={item} index={session.drills.findIndex((sessionItem) => sessionItem.id === item.id)} playerGroups={session.playerGroups} />)}</div>
                    </section>
                  );
                })}
                {block.items.some((item) => item.timingMode !== "simultaneous") ? (
                  <section className="rounded-md border border-board-line bg-board-paper p-3">
                    <h3 className="mb-3 text-sm font-bold text-board-navy">Sequential drills</h3>
                    <div className="space-y-4">
                      {block.items
                        .filter((item) => item.timingMode !== "simultaneous")
                        .map((item) => (
                          <SessionDrillDetailCard key={item.id} item={item} index={session.drills.findIndex((sessionItem) => sessionItem.id === item.id)} playerGroups={session.playerGroups} />
                        ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </section>
          );})}
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Player groups</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {session.playerGroups.length ? (
                session.playerGroups.map((group) => (
                  <div key={group.id} className="rounded-md bg-board-paper px-3 py-2">
                    <p className="font-semibold text-board-navy">{group.name}</p>
                    {group.notes ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{group.notes}</p> : null}
                  </div>
                ))
              ) : (
                <p>No player groups set.</p>
              )}
            </div>
          </section>
          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Materials</h2>
            <p className="mt-1 text-xs text-slate-500">Calculated based on simultaneous and sequential drill usage.</p>
            <div className="mt-3 text-sm text-slate-600">
              <MaterialSummaryList materials={materials} />
            </div>
          </section>
          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Notes</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{session.notes || "No notes yet."}</p>
          </section>
        </aside>
      </section>
    </div>
  );
}

function StatusBadge({ label, danger = false }: { label: string; danger?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${danger ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
      {label}
    </span>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-md border border-board-line bg-board-paper p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">{icon}{label}</p>
      <p className="mt-2 text-lg font-bold text-board-navy">{value}</p>
    </div>
  );
}

function SessionDrillDetailCard({ item, index, playerGroups }: { item: SessionDrillDetail; index: number; playerGroups: SessionPlayerGroup[] }) {
  return (
    <article className="rounded-lg border border-board-line bg-white p-4">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
        <div className="overflow-hidden rounded-md border border-board-line bg-board-grass">
          <SessionDrillPreview graphic={item.graphic} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-board-green">
            #{index + 1} - {item.plannedDurationMinutes} min - {item.timingMode === "simultaneous" ? `Simultaneous ${stationSetLabel(item.simultaneousGroup)}` : "Sequential"}
          </p>
          <h3 className="mt-1 text-xl font-bold text-board-navy">{item.drill.title}</h3>
          {item.timingMode === "simultaneous" ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              <span className="rounded-md bg-board-paper px-2 py-1">Station set: {stationSetLabel(item.simultaneousGroup)}</span>
              <span className="rounded-md bg-board-paper px-2 py-1">
                Groups: {item.participatingGroups?.length ? item.participatingGroups.map((groupId) => resolveGroupName(playerGroups, groupId)).join(", ") : "Not set"}
              </span>
              <span className="rounded-md bg-board-paper px-2 py-1">Starts: {resolveGroupName(playerGroups, item.startingGroup) || "Not set"}</span>
              <span className="rounded-md bg-board-paper px-2 py-1">{item.plannedDurationMinutes} min × {Math.max(1, item.participatingGroups?.length ?? 0)} groups = {effectiveStationDuration(item)} min</span>
            </div>
          ) : null}
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.drill.organization || item.drill.shortDescription || "No organization notes yet."}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600"><span className="font-semibold">Coaching:</span> {item.drill.coachingPoints || "No coaching points yet."}</p>
          {item.coachNotes ? <p className="mt-2 rounded-md bg-board-paper p-3 text-sm text-slate-700">{item.coachNotes}</p> : null}
          <p className="mt-3 text-xs font-semibold text-slate-500">{item.drill.minPlayers}-{item.drill.maxPlayers} players - {materialSummary(item.drill.materials)}</p>
        </div>
      </div>
    </article>
  );
}
