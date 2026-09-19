import { headers } from "next/headers";
import { cache } from "react";
import { cookies } from "next/headers";
import { localeCookieName, normalizeLocale, resolveLocale, type Locale } from "@/lib/i18n";
import type { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";

type PreferredLanguageRow = {
  preferred_language: string | null;
};

export async function getRequestLocale(preferredLanguage?: string | null): Promise<Locale> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  return normalizeLocale(preferredLanguage) ?? normalizeLocale(cookieStore.get(localeCookieName)?.value) ?? resolveLocale(null, requestHeaders.get("accept-language"));
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

// Server subcomponents share one resolved language per request, not a global locale.
export const getActiveLocale = cache(async (): Promise<Locale> => {
  const supabase = await createSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? getUserLocale(supabase, user.id) : getRequestLocale();
});
