import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TrainingEventForm } from "@/components/squad/training-event-form";
import { getLinkableTrainingSessions, listTrainingParticipantOptions } from "@/lib/squad/attendance-queries";
import { getTeamCalendarContext } from "@/lib/squad/regional-calendar-queries";
import { listSquads } from "@/lib/squad/squads";
import { getUserLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export default async function NewTrainingPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [sessions, squads, participants, locale] = await Promise.all([
    getLinkableTrainingSessions(supabase, user.id),
    listSquads(supabase, user.id),
    listTrainingParticipantOptions(supabase, user.id),
    getUserLocale(supabase, user.id)
  ]);
  const copy = locale === "de" ? {
    back: "Zurück zu Trainings",
    eyebrow: "Trainings",
    title: "Training erstellen",
    description: "Plane einen einzelnen Termin oder bei Bedarf eine wiederkehrende Trainingsreihe."
  } : {
    back: "Back to Trainings",
    eyebrow: "Trainings",
    title: "Create Training",
    description: "Schedule one appointment or, when needed, a recurring Training series."
  };
  const activeTeam = squads.find((squad) => squad.isActive) ?? squads[0];
  const today = new Date();
  const rangeStart = `${today.getUTCFullYear()}-01-01`;
  const calendarContext = await getTeamCalendarContext(supabase, user.id, activeTeam?.id, rangeStart, addYears(rangeStart, 3));

  return (
    <div className="space-y-6">
      <Link href="/trainings" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        {copy.back}
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{copy.title}</h1>
        <p className="mt-2 text-slate-600">{copy.description}</p>
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
