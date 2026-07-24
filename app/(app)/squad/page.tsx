import { redirect } from "next/navigation";
import { FileSpreadsheet, Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { CoachWorkspace } from "@/components/squad/coach-workspace";
import { SquadNav } from "@/components/squad/squad-nav";
import { ButtonLink } from "@/components/ui/button";
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
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Squad"
        title="Coach Workspace"
        description="Review your squad, identify players who need attention and open the right Player Hub when deeper context is needed."
        metadata={`${data.counts.active} active players · ${data.counts.roster} roster · ${data.counts.trial} trial`}
        actions={(
          <>
            <ButtonLink href="/squad/players/new" className="justify-center">
              <Plus className="h-4 w-4" />
              Add player
            </ButtonLink>
            <ButtonLink href="/squad/import" variant="secondary" className="justify-center">
              <FileSpreadsheet className="h-4 w-4" />
              Import players
            </ButtonLink>
          </>
        )}
      />
      <SquadNav />
      <CoachWorkspace data={data} />
    </PageContainer>
  );
}
