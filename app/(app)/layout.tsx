import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getRequestLocale } from "@/lib/i18n/server";
import { listSquads } from "@/lib/squad/squads";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProfileName = {
  display_name: string | null;
  preferred_language: string | null;
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profileData }, teams] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,preferred_language")
      .eq("id", user.id)
      .maybeSingle(),
    listSquads(supabase, user.id)
  ]);
  const profile = profileData as ProfileName | null;
  const locale = await getRequestLocale(profile?.preferred_language);

  return <AppShell coachName={profile?.display_name ?? user.email} teams={teams} locale={locale}>{children}</AppShell>;
}
