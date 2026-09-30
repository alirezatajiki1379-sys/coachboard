import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ScoutingTableName =
  | "scouting_players"
  | "scouting_observations"
  | "scouting_targets"
  | "scouting_target_players"
  | "scouting_history"
  | "squad_players"
  | "squads";

type ScoutingDatabase = {
  public: {
    Tables: Pick<Database["public"]["Tables"], ScoutingTableName>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ScoutingDb = SupabaseClient<ScoutingDatabase, "public", "public", ScoutingDatabase["public"]>;

export function asScoutingDb(client: unknown): ScoutingDb {
  return client as ScoutingDb;
}
