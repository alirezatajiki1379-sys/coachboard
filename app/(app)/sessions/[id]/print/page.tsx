import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/sessions/print-button";
import { SessionDrillPreview } from "@/components/sessions/session-drill-preview";
import { MaterialSummaryList } from "@/components/sessions/material-summary-list";
import { ButtonLink } from "@/components/ui/button";
import { materialSummary } from "@/lib/drills/materials";
import { calculateSessionDuration, calculateSessionMaterials, durationDeltaLabel, effectiveStationDuration, formatTimelineRange, groupByTrainingBlock, normalizeSimultaneousGroup, resolveGroupName, stationSetLabel, stationSetOptions } from "@/lib/sessions/utils";
import { createClient } from "@/lib/supabase/server";
import { getUserSession, type SessionDrillDetail } from "@/lib/sessions/queries";
import type { SessionPlayerGroup } from "@/types/domain";

type SessionPrintPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SessionPrintPage({ params }: SessionPrintPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const session = await getUserSession(supabase, user.id, id);
  if (!session) notFound();

  const total = calculateSessionDuration(session.drills);
  const blocks = groupByTrainingBlock(session.drills);
  const materials = calculateSessionMaterials(
    session.drills.map((item) => ({
      drill: item.drill,
      timingMode: item.timingMode,
      simultaneousGroup: item.simultaneousGroup
    }))
  );
  const targetLabel = durationDeltaLabel(total, session.durationTargetMinutes);
  let cursor = 0;

  return (
    <div className="print-page mx-auto max-w-[1120px] bg-white text-slate-950 shadow-soft print:max-w-none print:shadow-none">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-board-line bg-white p-4">
        <Link href={`/sessions/${session.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
          <ArrowLeft className="h-4 w-4" />
          Back to training plan
        </Link>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <ButtonLink href={`/sessions/${session.id}/edit`} variant="secondary" className="flex-1 justify-center sm:flex-none">Edit session</ButtonLink>
          <PrintButton className="flex-1 justify-center sm:flex-none" />
        </div>
      </div>

      <article className="space-y-7 rounded-xl border border-board-line bg-white p-4 print:space-y-5 print:border-0 print:p-0 sm:p-8">
        <header className="print-avoid overflow-hidden rounded-xl border border-board-line">
          <div className="bg-board-navy px-6 py-5 text-white print:bg-board-navy">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">Football training plan</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal print:text-3xl sm:text-4xl">{session.title}</h1>
            <p className="mt-2 text-sm text-white/80">
              {session.mainFocus || "Training plan"}
              {session.secondaryFocus ? ` · ${session.secondaryFocus}` : ""}
            </p>
          </div>
          <div className="grid gap-px bg-board-line md:grid-cols-4 print:grid-cols-4">
            <PrintMeta label="Date" value={session.date || "Not set"} />
            <PrintMeta label="Start time" value={session.startTime || "Not set"} />
            <PrintMeta label="Team / age group" value={session.teamAgeGroup || "Not set"} />
            <PrintMeta label="Location" value={session.location || "Not set"} />
            <PrintMeta label="Expected players" value={session.expectedPlayers ? String(session.expectedPlayers) : "Not set"} />
            <PrintMeta label="Total duration" value={`${total} min`} emphasis />
            <PrintMeta label="Target duration" value={session.durationTargetMinutes ? `${session.durationTargetMinutes} min` : "Not set"} />
            <PrintMeta label="Target status" value={session.durationTargetMinutes ? targetLabel ?? "On target" : "No target set"} />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr] print:grid-cols-[1.35fr_1fr]">
          <PrintPanel title="Material summary">
            <p className="mb-3 text-xs text-slate-500">Required material, calculated from sequential and simultaneous drill usage.</p>
            <div className="text-sm text-slate-700">
              <MaterialSummaryList materials={materials} emptyText="No materials listed." />
            </div>
          </PrintPanel>

          {session.playerGroups.length ? (
            <PrintPanel title="Player groups">
              <ul className="space-y-2 text-sm">
                {session.playerGroups.map((group) => (
                  <li key={group.id}>
                    <span className="font-bold text-board-navy">{group.name}</span>
                    {group.notes ? <span>: {group.notes}</span> : null}
                  </li>
                ))}
              </ul>
            </PrintPanel>
          ) : null}
        </section>

        {session.notes ? (
          <PrintPanel title="Training plan notes">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{session.notes}</p>
          </PrintPanel>
        ) : null}

        <section className="space-y-5">
          <div className="border-b border-board-line pb-3">
            <h2 className="text-2xl font-bold text-board-navy">Training timeline</h2>
            <p className="mt-1 text-sm text-slate-500">
              {session.startTime ? "Times are shown as real clock ranges from the training plan start time." : "Times are shown as relative training plan ranges because no start time is set."}
            </p>
          </div>

          {blocks.map((block) => {
            const blockStart = cursor;
            const blockMaterials = calculateSessionMaterials(
              block.items.map((item) => ({
                drill: item.drill,
                timingMode: item.timingMode,
                simultaneousGroup: item.simultaneousGroup
              }))
            );
            cursor += block.duration;
            return (
              <section key={block.block} className="print-avoid overflow-hidden rounded-xl border border-board-line">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-board-line bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-board-green">{formatTimelineRange(blockStart, block.duration, session.startTime)}</p>
                    <h3 className="mt-1 text-xl font-bold text-board-navy">{block.block}</h3>
                    <p className="mt-1 text-sm text-slate-600">{block.duration} min · {block.items.length} drills</p>
                  </div>
                  {block.stationSets.length ? (
                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                      {block.stationSets.map((set) => <span key={set.name} className="rounded-full bg-white px-3 py-1 ring-1 ring-board-line">{set.name}: {set.duration} min</span>)}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 p-4">
                  {blockMaterials.length ? (
                    <section className="print-avoid rounded-lg border border-board-line bg-white p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-board-green">Materials for {block.block}</h4>
                      <div className="mt-2 text-sm text-slate-700">
                        <MaterialSummaryList materials={blockMaterials} />
                      </div>
                    </section>
                  ) : null}

                  {stationSetOptions.map((set) => {
                    const setItems = block.items.filter((item) => item.timingMode === "simultaneous" && normalizeSimultaneousGroup(item.simultaneousGroup) === set.id);
                    if (!setItems.length) return null;
                    const setDuration = Math.max(...setItems.map((item) => effectiveStationDuration(item)));
                    return (
                      <section key={`${block.block}-${set.id}`} className="print-avoid rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold uppercase tracking-wide text-board-green">{set.label}</h4>
                            <p className="mt-1 text-xs text-slate-600">Drills in this station set run at the same time.</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-board-navy ring-1 ring-emerald-100">{setDuration} min</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {setItems.map((item) => <PrintableDrill key={item.id} item={item} playerGroups={session.playerGroups} />)}
                        </div>
                      </section>
                    );
                  })}

                  {block.items.some((item) => item.timingMode !== "simultaneous") ? (
                    <section className="print-avoid rounded-lg border border-board-line bg-board-paper p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-board-green">Sequential drills</h4>
                      <div className="mt-3 space-y-3">
                        {block.items
                          .filter((item) => item.timingMode !== "simultaneous")
                          .map((item) => <PrintableDrill key={item.id} item={item} playerGroups={session.playerGroups} />)}
                      </div>
                    </section>
                  ) : null}
                </div>
              </section>
            );
          })}
        </section>
      </article>
    </div>
  );
}

function PrintableDrill({ item, playerGroups }: { item: SessionDrillDetail; playerGroups: SessionPlayerGroup[] }) {
  const drill = item.drill;
  const details = [
    { label: "Organization", value: drill.organization || drill.shortDescription },
    { label: "Coaching points", value: drill.coachingPoints },
    { label: "Variations", value: drill.variations },
    { label: "Easier", value: drill.easierVersion },
    { label: "Harder", value: drill.harderVersion }
  ].filter((detail) => detail.value);

  return (
    <article className="print-avoid rounded-lg border border-board-line bg-white p-4">
      <div className="grid gap-4 md:grid-cols-[280px_1fr] print:grid-cols-[230px_1fr]">
        <div className="overflow-hidden rounded border border-board-line bg-board-grass">
          <SessionDrillPreview graphic={item.graphic} previewMode="print" />
        </div>
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h5 className="text-base font-bold text-board-navy">{drill.title}</h5>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {item.timingMode === "simultaneous" ? `Station set: ${stationSetLabel(item.simultaneousGroup)}` : "Sequential"} · {item.plannedDurationMinutes} min
              </p>
            </div>
            {item.timingMode === "simultaneous" ? (
              <span className="rounded-full bg-board-paper px-3 py-1 text-xs font-semibold text-slate-600">
                {item.plannedDurationMinutes} × {Math.max(1, item.participatingGroups?.length ?? 0)} groups = {effectiveStationDuration(item)} min
              </span>
            ) : null}
          </div>

          {item.timingMode === "simultaneous" ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="rounded bg-slate-50 px-2 py-1">Groups: {item.participatingGroups?.length ? item.participatingGroups.map((groupId) => resolveGroupName(playerGroups, groupId)).join(", ") : "Not set"}</span>
              <span className="rounded bg-slate-50 px-2 py-1">Starts: {resolveGroupName(playerGroups, item.startingGroup) || "Not set"}</span>
            </div>
          ) : null}

          {item.coachNotes ? <PrintDetailBlock label="Coach notes">{item.coachNotes}</PrintDetailBlock> : null}
          {drill.materials.length ? <p className="mt-2 text-xs font-semibold text-slate-500">Materials: {materialSummary(drill.materials)}</p> : null}

          {details.length ? (
            <div className="mt-3 space-y-2">
              {details.map((detail) => (
                <PrintDetailBlock key={detail.label} label={detail.label}>{detail.value}</PrintDetailBlock>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PrintMeta({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className={emphasis ? "text-lg font-bold text-board-navy" : "font-semibold text-board-navy"}>{value}</p>
    </div>
  );
}

function PrintPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="print-avoid rounded-xl border border-board-line bg-white p-5">
      <h2 className="text-lg font-bold text-board-navy">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function PrintDetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-5 text-slate-700">{children}</p>
    </div>
  );
}
