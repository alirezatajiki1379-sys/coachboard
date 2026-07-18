import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("season_start_month, season_start_day")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as { season_start_month: number | null; season_start_day: number | null } | null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Settings</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Coach profile</h1>
        <p className="mt-2 text-slate-600">Profile defaults and season settings for your CoachBoard workspace.</p>
      </div>

      <form action={updateSeasonSettings} className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Season start</h2>
        <p className="mt-1 text-sm text-slate-500">CoachBoard uses this to calculate football seasons. Default is 1 July.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-medium text-slate-700">Month</span>
            <select name="seasonStartMonth" defaultValue={profile?.season_start_month ?? 7} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
              {[
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December"
              ].map((month, index) => (
                <option key={month} value={index + 1}>{month}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Day</span>
            <input name="seasonStartDay" type="number" min="1" max="31" defaultValue={profile?.season_start_day ?? 1} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
        </div>
        <Button type="submit" className="mt-5">Save settings</Button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {["Profile name", "Club/team name", "Preferred language", "Default age group"].map((label) => (
          <label key={label} className="block rounded-lg border border-board-line bg-white p-4 shadow-soft">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input disabled className="mt-2 h-10 w-full rounded-md border border-board-line bg-slate-50 px-3 text-sm" placeholder="Coming in a later milestone" />
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
