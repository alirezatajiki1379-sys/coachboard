import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Footprints, Mail, Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PlayerActions } from "@/components/squad/player-actions";
import { createClient } from "@/lib/supabase/server";
import { getSquadPlayer } from "@/lib/squad/queries";

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

  const fullName = `${player.firstName} ${player.lastName}`.trim();

  return (
    <div className="space-y-6">
      <Link href="/squad" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to squad
      </Link>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-board-green">{player.position || "Player profile"}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{fullName}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
              {player.dateOfBirth ? <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-4 w-4" />{player.dateOfBirth}</span> : null}
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
          <DetailRow icon={<Phone className="h-4 w-4" />} label="Player phone" value={player.playerPhone} />
          <DetailRow icon={<Phone className="h-4 w-4" />} label="Parent phone" value={player.parentPhone} />
          <DetailRow icon={<Mail className="h-4 w-4" />} label="Parent email" value={player.parentEmail} />
        </DetailSection>

        <DetailSection title="Development">
          <DetailRow label="Development goal" value={player.developmentGoal} />
          <DetailRow label="Work on" value={player.workOn} />
          <DetailRow label="Hobbies" value={player.hobbies} />
          <DetailRow label="Coach notes" value={player.notes} />
        </DetailSection>
      </div>
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

function DetailRow({ label, value, icon }: { label: string; value?: string; icon?: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line text-sm font-semibold text-board-navy">{value || "Not added yet"}</p>
    </div>
  );
}
