import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TrainingEventForm } from "@/components/squad/training-event-form";
import { getLinkableTrainingSessions, getTrainingEventDetail, listTrainingParticipantOptions } from "@/lib/squad/attendance-queries";
import { getTeamCalendarContext } from "@/lib/squad/regional-calendar-queries";
import { listSquads } from "@/lib/squad/squads";
import { getUserLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

type EditTrainingPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTrainingPage({ params }: EditTrainingPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [event, sessions, squads, locale] = await Promise.all([
    getTrainingEventDetail(supabase, user.id, id),
    getLinkableTrainingSessions(supabase, user.id),
    listSquads(supabase, user.id),
    getUserLocale(supabase, user.id)
  ]);

  if (!event) notFound();
  const [participants, calendarContext] = await Promise.all([
    listTrainingParticipantOptions(supabase, user.id, event.squadId),
    getTeamCalendarContext(supabase, user.id, event.squadId, addMonths(event.date, -3), addMonths(event.date, 12))
  ]);
  const copy = locale === "de" ? {
    back: "Zurück zum Training",
    eyebrow: "Trainings",
    title: "Training bearbeiten",
    description: "Passe Termin und Teilnehmer an, ohne bereits erfasste Anwesenheiten zu verändern."
  } : {
    back: "Back to Training",
    eyebrow: "Trainings",
    title: "Edit Training",
    description: "Adjust the appointment and participants without changing recorded attendance history."
  };

  return (
    <div className="space-y-6">
      <Link href={`/trainings/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        {copy.back}
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{copy.title}</h1>
        <p className="mt-2 text-slate-600">{copy.description}</p>
      </div>
      <TrainingEventForm sessions={sessions} squads={squads} participants={participants} event={event} mode="edit" calendarContext={calendarContext} />
    </div>
  );
}

function addMonths(date: string, months: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}
