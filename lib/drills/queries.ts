import type { Drill } from "@/types/domain";
import type { createClient } from "@/lib/supabase/server";
import { mapDrillRow, type DrillRow } from "@/lib/drills/mappers";
import { parseEditorState } from "@/lib/drills/editor";
import type { Json } from "@/types/database";
import type { DrillEditorState } from "@/types/editor";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const drillLibraryColumns = [
  "id",
  "user_id",
  "title",
  "short_description",
  "age_groups",
  "main_focus",
  "sub_focus",
  "training_blocks",
  "drill_type",
  "duration_minutes",
  "min_players",
  "max_players",
  "materials",
  "pitch_area",
  "difficulty_level",
  "intensity_level",
  "is_favorite",
  "tags",
  "archived_at",
  "deleted_at",
  "created_at",
  "updated_at"
].join(",");

export type DrillFilters = {
  view: "active" | "archived" | "trash";
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
    view: get("view") === "archived" || get("view") === "trash" ? get("view") as DrillFilters["view"] : "active",
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
  let query = supabase.from("drills").select(drillLibraryColumns).eq("user_id", userId).order("updated_at", {
    ascending: false
  });

  if (filters.view === "active") query = query.is("archived_at", null).is("deleted_at", null);
  if (filters.view === "archived") query = query.not("archived_at", "is", null).is("deleted_at", null);
  if (filters.view === "trash") query = query.not("deleted_at", "is", null);

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

  const rows = (data ?? []) as Partial<DrillRow>[];
  const drills = rows.map(mapDrillListRow);
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

function mapDrillListRow(row: Partial<DrillRow>): Drill {
  return mapDrillRow({
    id: row.id ?? "",
    user_id: row.user_id ?? "",
    title: row.title ?? "",
    short_description: row.short_description ?? null,
    organization: null,
    coaching_points: null,
    variations: null,
    easier_version: null,
    harder_version: null,
    age_groups: row.age_groups ?? [],
    main_focus: row.main_focus ?? "Technical",
    sub_focus: row.sub_focus ?? null,
    training_blocks: row.training_blocks ?? [],
    drill_type: row.drill_type ?? "Exercise",
    duration_minutes: row.duration_minutes ?? 0,
    min_players: row.min_players ?? 0,
    max_players: row.max_players ?? 0,
    materials: row.materials ?? [],
    pitch_area: row.pitch_area ?? null,
    difficulty_level: row.difficulty_level ?? 3,
    intensity_level: row.intensity_level ?? 3,
    is_favorite: row.is_favorite ?? false,
    tags: row.tags ?? [],
    archived_at: row.archived_at ?? null,
    deleted_at: row.deleted_at ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? ""
  });
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
