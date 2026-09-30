import { redirect } from "next/navigation";
import { getUserLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function scoutingContext() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const locale = await getUserLocale(db, user.id);
  return { db, userId: user.id, locale };
}
