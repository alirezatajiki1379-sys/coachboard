import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProfileName = {
  display_name: string | null;
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as ProfileName | null;

  return <AppShell coachName={profile?.display_name ?? user.email}>{children}</AppShell>;
}
