"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export async function updatePreferredLanguage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const locale = normalizeLocale(String(formData.get("locale") ?? ""));
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/settings"));

  if (!locale) {
    redirect(returnTo);
  }

  const db = supabase as unknown as SupabaseClient;
  await db
    .from("profiles")
    .upsert({ id: user.id, preferred_language: locale, updated_at: new Date().toISOString() }, { onConflict: "id" });

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });

  revalidatePath("/", "layout");
  redirect(returnTo);
}

function safeReturnTo(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/settings";
  return value;
}
