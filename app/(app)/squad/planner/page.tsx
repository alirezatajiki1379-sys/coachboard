import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { SquadNav } from "@/components/squad/squad-nav";
import { SquadTacticalPlanner } from "@/components/squad/squad-tactical-planner";
import { createClient } from "@/lib/supabase/server";
import { getTacticalPlannerData } from "@/lib/squad/tactical-planner";

type SquadPlannerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SquadPlannerPage({ searchParams }: SquadPlannerPageProps) {
  const params = await searchParams;
  const planParam = params.plan;
  const selectedPlanId = Array.isArray(planParam) ? planParam[0] : planParam;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const data = await getTacticalPlannerData(supabase, user.id, selectedPlanId);

  return (
    <PageContainer width="full">
      <PageHeader
        eyebrow="Squad"
        title="Formation and Depth Planner"
        description="Build tactical plans for the active team, assign starters and manage depth without changing training attendance or session plans."
        metadata={`${data.players.length} active squad players · ${data.plans.filter((plan) => plan.status === "active").length} active plans`}
      />
      <SquadNav />
      <SquadTacticalPlanner data={data} />
    </PageContainer>
  );
}
