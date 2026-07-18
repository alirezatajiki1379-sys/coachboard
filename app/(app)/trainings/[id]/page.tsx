import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, MapPin, Star, UsersRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CompleteEventButton, MissingStatusesNotice } from "@/components/squad/attendance-controls";
import { attendanceDisplayName, finalStatusLabel, plannedReasonLabel, plannedStatusLabel, reliabilityMalus } from "@/lib/squad/attendance-format";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";
import { seasonLabelForDate, trainingDisplayTitle, trainingPlanStatus, trainingRatingStats, trainingSummaryCounts, trainingTimeRange } from "@/lib/trainings/utils";

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
              {event.location ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><MapPin className="h-4 w-4" />{event.location}</span> : null}
              {event.focus ? <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><Star className="h-4 w-4" />{event.focus}</span> : null}
            </div>
            {event.generalNotes ? <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{event.generalNotes}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/trainings/${event.id}/check-in`} className="justify-center">Quick check-in</ButtonLink>
            <ButtonLink href={`/trainings/${event.id}/ratings`} variant="secondary" className="justify-center">Ratings</ButtonLink>
            <CompleteEventButton eventId={event.id} />
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
                      {entry.plannedReason ? ` · Reason: ${entry.plannedReason} ${plannedReasonLabel(entry.plannedReason)}` : ""}
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
