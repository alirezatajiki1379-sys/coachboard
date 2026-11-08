import { notFound, redirect } from "next/navigation";
import { DrillDetail } from "@/components/drills/drill-detail";
import { getDrillVisual } from "@/lib/drills/graphics";
import { createClient } from "@/lib/supabase/server";
import { getUserDrill } from "@/lib/drills/queries";
import { getDrillUsageStatsByDrillId } from "@/lib/drills/usage";
import { getActiveLocale } from "@/lib/i18n/server";

export default async function DrillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [drill, visual, usageMap, locale] = await Promise.all([
    getUserDrill(supabase, user.id, id),
    getDrillVisual(supabase, user.id, id),
    getDrillUsageStatsByDrillId(supabase, user.id, [id]),
    getActiveLocale()
  ]);
  if (!drill) notFound();
  return <DrillDetail drill={drill} visual={visual} usage={usageMap.get(drill.id)} locale={locale} />;
}
