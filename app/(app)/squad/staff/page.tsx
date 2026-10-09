import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { SquadNav } from "@/components/squad/squad-nav";
import { StaffManagement } from "@/components/squad/staff-management";
import { getMessages } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { createClient } from "@/lib/supabase/server";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { listSquadStaff } from "@/lib/squad/staff";

export default async function SquadStaffPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const squad = await ensureActiveSquad(supabase, user.id);
  const [staff, locale] = await Promise.all([
    listSquadStaff(supabase, user.id, squad.id),
    getUserLocale(supabase, user.id)
  ]);
  const messages = getMessages(locale);
  const ui = createSystemTranslator(locale);
  const activeCount = staff.filter((member) => member.isActive).length;

  return <PageContainer width="wide">
    <PageHeader
      eyebrow={messages.squad.page.eyebrow}
      title={ui("Staff")}
      description={ui("Manage coaches and prepare responsibilities for every Training.")}
      metadata={`${squad.name} · ${activeCount} ${ui("active")}`}
      actions={<span className="inline-flex h-10 items-center gap-2 rounded-md bg-green-50 px-3 text-sm font-bold text-green-800"><UsersRound className="h-4 w-4" />{activeCount}</span>}
    />
    <SquadNav locale={locale} />
    <StaffManagement squadId={squad.id} staff={staff} />
  </PageContainer>;
}
