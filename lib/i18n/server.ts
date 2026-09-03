import { headers } from "next/headers";
import { resolveLocale, type Locale } from "@/lib/i18n";
import type { createClient } from "@/lib/supabase/server";

type PreferredLanguageRow = {
  preferred_language: string | null;
};

export async function getRequestLocale(preferredLanguage?: string | null): Promise<Locale> {
  const requestHeaders = await headers();
  return resolveLocale(preferredLanguage, requestHeaders.get("accept-language"));
}

export async function getUserLocale(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<Locale> {
  const { data } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();
  const profile = data as PreferredLanguageRow | null;
  return getRequestLocale(profile?.preferred_language);
}
