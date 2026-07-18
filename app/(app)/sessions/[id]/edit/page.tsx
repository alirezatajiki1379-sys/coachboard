import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SessionForm } from "@/components/sessions/session-form";
import { updateSession } from "@/lib/sessions/actions";
import { getDrillsForSessionBuilder, getUserSession } from "@/lib/sessions/queries";
import { createClient } from "@/lib/supabase/server";

type EditSessionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSessionPage({ params }: EditSessionPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [session, drills] = await Promise.all([
    getUserSession(supabase, user.id, id),
    getDrillsForSessionBuilder(supabase, user.id)
  ]);

  if (!session) notFound();

  return (
    <div className="space-y-6">
      <Link href={`/sessions/${session.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to training plan
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Edit Training Plan</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{session.title}</h1>
        <p className="mt-2 text-slate-600">Update the timeline, planned duration, notes, and equipment list.</p>
      </div>
      <SessionForm action={updateSession} mode="edit" session={session} drills={drills} />
    </div>
  );
}
