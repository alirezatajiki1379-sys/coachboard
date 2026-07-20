import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TrainingEventForm } from "@/components/squad/training-event-form";
import { createClient } from "@/lib/supabase/server";
import { getLinkableTrainingSessions, listTrainingParticipantOptions } from "@/lib/squad/attendance-queries";
import { listSquads } from "@/lib/squad/squads";

export default async function NewTrainingEventPage() {
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

  return (
    <div className="space-y-6">
      <Link href="/squad/attendance" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to attendance
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Attendance</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">New training</h1>
        <p className="mt-2 text-slate-600">Create the real appointment your players will attend.</p>
      </div>
      <TrainingEventForm sessions={sessions} squads={squads} participants={participants} />
    </div>
  );
}
