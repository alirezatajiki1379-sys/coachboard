import { redirect } from "next/navigation";
import { FileSpreadsheet, Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { CoachWorkspace } from "@/components/squad/coach-workspace";
import { SquadNav } from "@/components/squad/squad-nav";
import { ButtonLink } from "@/components/ui/button";
import { formatMessage, getMessages } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
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

  const [data, locale] = await Promise.all([
    getCoachWorkspaceData(supabase, user.id, state),
    getUserLocale(supabase, user.id)
  ]);
  const messages = getMessages(locale);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={messages.squad.page.eyebrow}
        title={messages.squad.page.title}
        description={messages.squad.page.description}
        metadata={formatMessage(messages.squad.page.metadata, {
          active: data.counts.active,
          roster: data.counts.roster,
          trial: data.counts.trial
        })}
        actions={(
          <>
            <ButtonLink href="/squad/players/new" className="justify-center">
              <Plus className="h-4 w-4" />
              {messages.squad.page.addPlayer}
            </ButtonLink>
            <ButtonLink href="/squad/import" variant="secondary" className="justify-center">
              <FileSpreadsheet className="h-4 w-4" />
              {messages.squad.page.importPlayers}
            </ButtonLink>
          </>
        )}
      />
      <SquadNav locale={locale} />
      <CoachWorkspace data={data} locale={locale} />
    </PageContainer>
  );
}
