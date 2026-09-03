import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("season_start_month, season_start_day, preferred_language")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as { season_start_month: number | null; season_start_day: number | null; preferred_language: string | null } | null;
  const locale = await getRequestLocale(profile?.preferred_language);
  const messages = getMessages(locale);
  const monthFormatter = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { month: "long" });
  const months = Array.from({ length: 12 }, (_value, index) => monthFormatter.format(new Date(2026, index, 1)));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">{messages.settings.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{messages.settings.title}</h1>
        <p className="mt-2 text-slate-600">{messages.settings.description}</p>
      </div>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">{messages.settings.language.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{messages.settings.language.description}</p>
        <div className="mt-4">
          <LanguageSwitcher locale={locale} returnTo="/settings" />
        </div>
      </section>

      <form action={updateSeasonSettings} className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">{messages.settings.season.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{messages.settings.season.description}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-medium text-slate-700">{messages.settings.season.month}</span>
            <select name="seasonStartMonth" defaultValue={profile?.season_start_month ?? 7} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
              {months.map((month, index) => (
                <option key={month} value={index + 1}>{month}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">{messages.settings.season.day}</span>
            <input name="seasonStartDay" type="number" min="1" max="31" defaultValue={profile?.season_start_day ?? 1} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
        </div>
        <Button type="submit" className="mt-5">{messages.settings.season.save}</Button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {[messages.settings.profileName, messages.settings.clubTeamName, messages.settings.preferredLanguage, messages.settings.defaultAgeGroup].map((label) => (
          <label key={label} className="block rounded-lg border border-board-line bg-white p-4 shadow-soft">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input disabled className="mt-2 h-10 w-full rounded-md border border-board-line bg-slate-50 px-3 text-sm" placeholder={messages.settings.comingLater} />
          </label>
        ))}
      </div>
    </div>
  );
}

async function updateSeasonSettings(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const month = boundedInt(formData.get("seasonStartMonth"), 1, 12, 7);
  const day = boundedInt(formData.get("seasonStartDay"), 1, 31, 1);
  const db = supabase as unknown as SupabaseClient;
  await db.from("profiles").update({ season_start_month: month, season_start_day: day }).eq("id", user.id);
  revalidatePath("/settings");
  redirect("/settings");
}

function boundedInt(value: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
