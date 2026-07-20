import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TrainingEventForm } from "@/components/squad/training-event-form";
import { getLinkableTrainingSessions, getTrainingEventDetail, listTrainingParticipantOptions } from "@/lib/squad/attendance-queries";
import { listSquads } from "@/lib/squad/squads";
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

  const [event, sessions, squads, participants] = await Promise.all([
    getTrainingEventDetail(supabase, user.id, id),
    getLinkableTrainingSessions(supabase, user.id),
    listSquads(supabase, user.id),
    listTrainingParticipantOptions(supabase, user.id)
  ]);

  if (!event) notFound();

  return (
    <div className="space-y-6">
      <Link href={`/trainings/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to training
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Trainings</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Edit training</h1>
        <p className="mt-2 text-slate-600">Adjust appointment details and participants without changing recorded attendance history.</p>
      </div>
      <TrainingEventForm sessions={sessions} squads={squads} participants={participants} event={event} mode="edit" />
    </div>
  );
}
