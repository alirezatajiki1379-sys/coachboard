import type { Drill } from "@/types/domain";
import type { createClient } from "@/lib/supabase/server";
import { mapDrillRow, type DrillRow } from "@/lib/drills/mappers";
import { parseEditorState } from "@/lib/drills/editor";
import type { Json } from "@/types/database";
import type { DrillEditorState } from "@/types/editor";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DrillFilters = {
  search?: string;
  ageGroup?: string;
  mainFocus?: string;
  subFocus?: string;
  trainingBlock?: string;
  drillType?: string;
  minPlayers?: number;
  maxPlayers?: number;
  minDuration?: number;
  maxDuration?: number;
  material?: string;
  favorites?: boolean;
};

export function parseDrillFilters(searchParams: Record<string, string | string[] | undefined>): DrillFilters {
  const get = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const numberFilter = (key: string) => {
    const value = Number.parseInt(get(key) ?? "", 10);
    return Number.isFinite(value) ? value : undefined;
  };

  return {
    search: get("search")?.trim() || undefined,
    ageGroup: get("ageGroup") || undefined,
    mainFocus: get("mainFocus") || undefined,
    subFocus: get("subFocus")?.trim() || undefined,
    trainingBlock: get("trainingBlock") || undefined,
    drillType: get("drillType") || undefined,
    minPlayers: numberFilter("minPlayers"),
    maxPlayers: numberFilter("maxPlayers"),
    minDuration: numberFilter("minDuration"),
    maxDuration: numberFilter("maxDuration"),
    material: get("material")?.trim() || undefined,
    favorites: get("favorites") === "true"
  };
}

export async function listUserDrills(
  supabase: SupabaseServerClient,
  userId: string,
  filters: DrillFilters
): Promise<Array<Drill & { graphic?: DrillEditorState }>> {
  let query = supabase.from("drills").select("*").eq("user_id", userId).order("updated_at", {
    ascending: false
  });

  if (filters.search) {
    const search = filters.search.replaceAll("%", "").replaceAll("_", "");
    query = query.or(`title.ilike.%${search}%,short_description.ilike.%${search}%,sub_focus.ilike.%${search}%`);
  }

  if (filters.ageGroup) query = query.contains("age_groups", [filters.ageGroup]);
  if (filters.mainFocus) query = query.eq("main_focus", filters.mainFocus);
  if (filters.subFocus) query = query.ilike("sub_focus", `%${filters.subFocus}%`);
  if (filters.trainingBlock) query = query.contains("training_blocks", [filters.trainingBlock]);
  if (filters.drillType) query = query.eq("drill_type", filters.drillType);
  if (filters.minPlayers) query = query.gte("max_players", filters.minPlayers);
  if (filters.maxPlayers) query = query.lte("min_players", filters.maxPlayers);
  if (filters.minDuration) query = query.gte("duration_minutes", filters.minDuration);
  if (filters.maxDuration) query = query.lte("duration_minutes", filters.maxDuration);
  if (filters.favorites) query = query.eq("is_favorite", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as DrillRow[];
  const drills = rows.map(mapDrillRow);
  const graphics = await getGraphicsByDrillId(supabase, userId, drills.map((drill) => drill.id));
  const drillsWithGraphics = drills.map((drill) => ({ ...drill, graphic: graphics.get(drill.id) }));

  if (!filters.material) return drillsWithGraphics;

  const material = filters.material.toLowerCase();
  return drillsWithGraphics.filter((drill) =>
    drill.materials.some((item) =>
      [item.type, item.color, item.label].filter(Boolean).join(" ").toLowerCase().includes(material)
    )
  );
}

async function getGraphicsByDrillId(supabase: SupabaseServerClient, userId: string, drillIds: string[]) {
  const graphics = new Map<string, DrillEditorState>();
  if (!drillIds.length) return graphics;
  const { data, error } = await supabase
    .from("drill_graphics")
    .select("drill_id, canvas_json")
    .eq("user_id", userId)
    .in("drill_id", drillIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ drill_id: string; canvas_json: Json }>) {
    graphics.set(row.drill_id, parseEditorState(row.canvas_json));
  }
  return graphics;
}

export async function getUserDrill(
  supabase: SupabaseServerClient,
  userId: string,
  drillId: string
): Promise<Drill | null> {
  const { data, error } = await supabase
    .from("drills")
    .select("*")
    .eq("user_id", userId)
    .eq("id", drillId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapDrillRow(data as DrillRow) : null;
}
