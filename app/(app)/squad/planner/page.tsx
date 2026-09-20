import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { SquadNav } from "@/components/squad/squad-nav";
import { SquadTacticalPlanner } from "@/components/squad/squad-tactical-planner";
import { createClient } from "@/lib/supabase/server";
import { getTacticalPlannerData } from "@/lib/squad/tactical-planner";
import { getUserLocale } from "@/lib/i18n/server";

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

  const [data, locale] = await Promise.all([getTacticalPlannerData(supabase, user.id, selectedPlanId), getUserLocale(supabase, user.id)]);

  return (
    <PageContainer width="full">
      <PageHeader
        eyebrow={locale === "de" ? "Kader" : "Squad"}
        title={locale === "de" ? "Kaderplaner" : "Squad Planner"}
        description={locale === "de" ? "Formationen, Startelf und Positionsbesetzung für die aktive Mannschaft planen." : "Plan formations, the Starting XI and positional depth for the active team."}
        metadata={locale === "de" ? `${data.players.length} aktive Spieler · ${data.plans.filter((plan) => plan.status === "active").length} aktive Pläne` : `${data.players.length} active players · ${data.plans.filter((plan) => plan.status === "active").length} active plans`}
      />
      <SquadNav locale={locale} />
      <SquadTacticalPlanner data={data} startEditing={params.edit === "1" && data.selectedPlan?.formationCode === "Custom"} />
    </PageContainer>
  );
}
