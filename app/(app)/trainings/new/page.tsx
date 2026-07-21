import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TrainingEventForm } from "@/components/squad/training-event-form";
import { getLinkableTrainingSessions, listTrainingParticipantOptions } from "@/lib/squad/attendance-queries";
import { getTeamCalendarContext } from "@/lib/squad/regional-calendar-queries";
import { listSquads } from "@/lib/squad/squads";
import { createClient } from "@/lib/supabase/server";

export default async function NewTrainingPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [sessions, squads, participants] = await Promise.all([
    getLinkableTrainingSessions(supabase, user.id),
    listSquads(supabase, user.id),
    listTrainingParticipantOptions(supabase, user.id)
  ]);
  const activeTeam = squads.find((squad) => squad.isActive) ?? squads[0];
  const today = new Date();
  const rangeStart = `${today.getUTCFullYear()}-01-01`;
  const calendarContext = await getTeamCalendarContext(supabase, user.id, activeTeam?.id, rangeStart, addYears(rangeStart, 3));

  return (
    <div className="space-y-6">
      <Link href="/trainings" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to trainings
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Trainings</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Create training</h1>
        <p className="mt-2 text-slate-600">Create one appointment or a recurring set of independent trainings.</p>
      </div>
      <TrainingEventForm sessions={sessions} squads={squads} participants={participants} calendarContext={calendarContext} />
    </div>
  );
}

function addYears(date: string, years: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
}
