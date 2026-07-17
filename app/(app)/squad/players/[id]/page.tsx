import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Footprints, Mail, Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PlayerActions } from "@/components/squad/player-actions";
import { createClient } from "@/lib/supabase/server";
import { getSquadPlayer, getSquadPlayerTrainingHistory } from "@/lib/squad/queries";
import { formatPlayerBirthDate, playerFullName } from "@/lib/squad/format";
import { finalStatusLabel, formatEventDate, plannedStatusLabel, reliabilityMalus } from "@/lib/squad/attendance-format";

type PlayerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const player = await getSquadPlayer(supabase, user.id, id);
  if (!player) notFound();
  const history = await getSquadPlayerTrainingHistory(supabase, user.id, id);

  const fullName = playerFullName(player);
  const rated = history.filter((entry) => entry.overallRating);
  const averageRating = rated.length ? (rated.reduce((sum, entry) => sum + (entry.overallRating ?? 0), 0) / rated.length).toFixed(1) : "-";
  const lateCount = history.filter((entry) => entry.finalStatus === "Z").length;
  const unexcusedCount = history.filter((entry) => entry.finalStatus === "U").length;
  const malus = history.reduce((sum, entry) => sum + reliabilityMalus(entry), 0);

  return (
    <div className="space-y-6">
      <Link href="/squad" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to squad
      </Link>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{fullName}</h1>
            <div className="mt-3">
              {player.position ? (
                <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-board-green ring-1 ring-green-100">
                  Position: {player.position}
                </span>
              ) : (
                <span className="text-sm font-semibold text-slate-500">No position set</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
              {player.dateOfBirth ? <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-4 w-4" />{formatPlayerBirthDate(player.dateOfBirth)}</span> : null}
              {player.strongFoot ? <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1"><Footprints className="h-4 w-4" />{player.strongFoot}</span> : null}
              {player.club ? <span className="rounded-md bg-slate-100 px-2 py-1">{player.club}</span> : null}
              {player.archivedAt ? <span className="rounded-md bg-amber-50 px-2 py-1 font-bold text-amber-700">Archived</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!player.archivedAt ? (
              <ButtonLink href={`/squad/players/${player.id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
            ) : null}
            <PlayerActions playerId={player.id} archived={Boolean(player.archivedAt)} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Contact">
          <DetailRow icon={<Phone className="h-4 w-4" />} label="Player phone" value={player.playerPhone} href={player.playerPhone ? `tel:${player.playerPhone}` : undefined} />
          <DetailRow icon={<Phone className="h-4 w-4" />} label="Parent phone" value={player.parentPhone} href={player.parentPhone ? `tel:${player.parentPhone}` : undefined} />
          <DetailRow icon={<Mail className="h-4 w-4" />} label="Parent email" value={player.parentEmail} href={player.parentEmail ? `mailto:${player.parentEmail}` : undefined} />
        </DetailSection>

        <DetailSection title="Development">
          <DetailRow label="Development goal" value={player.developmentGoal} />
          <DetailRow label="Work on" value={player.workOn} />
          <DetailRow label="Hobbies" value={player.hobbies} />
          <DetailRow label="Coach notes" value={player.notes} />
        </DetailSection>
      </div>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Training history</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Attendances" value={String(history.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z").length)} />
          <Stat label="Rated trainings" value={String(rated.length)} />
          <Stat label="Average rating" value={averageRating} />
          <Stat label="Late" value={String(lateCount)} />
          <Stat label="Reliability malus" value={String(malus)} />
        </div>
        {unexcusedCount ? <p className="mt-3 text-sm font-semibold text-red-700">{unexcusedCount} unexcused absence{unexcusedCount === 1 ? "" : "s"}</p> : null}
        <div className="mt-5 space-y-3">
          {history.length ? (
            history.map((entry) => (
              <article key={entry.id} className="rounded-md border border-board-line bg-board-paper p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-board-navy">{entry.event ? `${formatEventDate(entry.event.date)} · ${entry.event.label || "Training"}` : "Training"}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Planned: {plannedStatusLabel(entry.plannedStatus)} · Actual: {finalStatusLabel(entry.finalStatus)}
                      {entry.overallRating ? ` · Rating: ${entry.overallRating}` : ""}
                    </p>
                  </div>
                  {entry.sensitiveNote ? <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">Sensitive note</span> : null}
                </div>
                {entry.coachNote ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{entry.coachNote}</p> : null}
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No training history yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-bold text-board-navy">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function DetailRow({ label, value, icon, href }: { label: string; value?: string; icon?: ReactNode; href?: string }) {
  const content = value || "Not added yet";
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      {href && value ? (
        <a href={href} className="mt-1 block whitespace-pre-line text-sm font-semibold text-board-navy underline-offset-4 hover:underline">{content}</a>
      ) : (
        <p className="mt-1 whitespace-pre-line text-sm font-semibold text-board-navy">{content}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-board-navy">{value}</p>
    </div>
  );
}
