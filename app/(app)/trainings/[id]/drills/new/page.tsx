import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, UsersRound } from "lucide-react";
import { DrillForm } from "@/components/drills/drill-form";
import { createReusableTrainingDrill, createSessionOnlyTrainingDrill } from "@/lib/squad/training-drill-actions";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";
import { editorStateToString } from "@/lib/drills/editor";
import { defaultEditorState } from "@/types/editor";
import { formatDateLabel, trainingDisplayTitle, trainingTimeRange } from "@/lib/trainings/utils";

type TrainingDrillCreatePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TrainingDrillCreatePage({ params, searchParams }: TrainingDrillCreatePageProps) {
  const { id } = await params;
  const query = await searchParams;
  const mode = query.mode === "reusable" ? "reusable" : "session";
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event) notFound();
  const returnTo = `/trainings/${event.id}`;
  const action = mode === "reusable" ? createReusableTrainingDrill : createSessionOnlyTrainingDrill;

  return (
    <div className="space-y-6">
      <Link href={returnTo} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to training
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Create Drill</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">
          {mode === "reusable" ? "Create reusable Drill and add it" : "Create Drill for this Training"}
        </h1>
        <p className="mt-2 text-slate-600">
          {mode === "reusable"
            ? "This creates a normal Drill Library template, then inserts a session copy into this Training."
            : "This creates a session-only Drill instance. It will not appear in the shared Drill Library."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/trainings/${event.id}/drills/new?mode=session`} className={`rounded-md px-3 py-2 text-sm font-bold ${mode === "session" ? "bg-board-green text-white" : "bg-white text-board-navy ring-1 ring-board-line"}`}>
            Create for this Training only
          </Link>
          <Link href={`/trainings/${event.id}/drills/new?mode=reusable`} className={`rounded-md px-3 py-2 text-sm font-bold ${mode === "reusable" ? "bg-board-green text-white" : "bg-white text-board-navy ring-1 ring-board-line"}`}>
            Create reusable Drill Template
          </Link>
        </div>
      </div>
      <DrillForm
        action={action}
        mode="create"
        graphicJson={editorStateToString(defaultEditorState)}
        defaultReturnTo={returnTo}
        cancelHref={returnTo}
        hiddenFields={{ trainingEventId: event.id }}
        contextBanner={(
          <section className="rounded-lg border border-board-line bg-board-paper p-4">
            <p className="text-sm font-bold text-board-navy">Creating a Drill for</p>
            <h2 className="mt-1 text-xl font-bold text-board-navy">{trainingDisplayTitle(event)}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1"><CalendarDays className="h-3.5 w-3.5" />{formatDateLabel(event.date)} · {trainingTimeRange(event)}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1"><UsersRound className="h-3.5 w-3.5" />{event.squadName ?? "Active Team"}</span>
              <span className="rounded-md bg-white px-2 py-1">{event.attendance.length} connected Player{event.attendance.length === 1 ? "" : "s"}</span>
            </div>
          </section>
        )}
      />
    </div>
  );
}
