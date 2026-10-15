import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function listConcreteTrainingPlanEventIds(
  supabase: SupabaseServerClient,
  userId: string,
  eventIds: string[]
): Promise<Set<string>> {
  const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)));
  const result = new Set<string>();
  if (!uniqueEventIds.length) return result;
  const db = supabase as unknown as SupabaseClient;
  const [plans, drills] = await Promise.all([
    db.from("training_session_plan_instances").select("event_id").eq("user_id", userId).in("event_id", uniqueEventIds),
    db.from("training_session_drill_instances").select("event_id").eq("user_id", userId).in("event_id", uniqueEventIds).neq("status", "removed")
  ]);
  if (plans.error) throw new Error(plans.error.message);
  if (drills.error) throw new Error(drills.error.message);
  for (const row of [...(plans.data ?? []), ...(drills.data ?? [])] as Array<{ event_id?: string | null }>) {
    if (row.event_id) result.add(row.event_id);
  }
  return result;
}
