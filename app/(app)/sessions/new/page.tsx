import { redirect } from "next/navigation";
import { SessionForm } from "@/components/sessions/session-form";
import { createSession } from "@/lib/sessions/actions";
import { getDrillsForSessionBuilder } from "@/lib/sessions/queries";
import { createClient } from "@/lib/supabase/server";

export default async function NewSessionPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const drills = await getDrillsForSessionBuilder(supabase, user.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Create Training Session</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Build a session plan</h1>
        <p className="mt-2 text-slate-600">Select drills, arrange the timeline, and calculate the equipment list.</p>
      </div>
      <SessionForm action={createSession} mode="create" drills={drills} />
    </div>
  );
}
