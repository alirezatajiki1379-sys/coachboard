import { redirect } from "next/navigation";
import { CoachWorkspace } from "@/components/squad/coach-workspace";
import { SquadNav } from "@/components/squad/squad-nav";
import { createClient } from "@/lib/supabase/server";
import { getCoachWorkspaceData, parseWorkspaceState } from "@/lib/squad/workspace";

type SquadPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SquadPage({ searchParams }: SquadPageProps) {
  const params = await searchParams;
  const state = parseWorkspaceState(params);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const data = await getCoachWorkspaceData(supabase, user.id, state);

  return (
    <div className="space-y-6">
      <SquadNav />
      <CoachWorkspace data={data} />
    </div>
  );
}
