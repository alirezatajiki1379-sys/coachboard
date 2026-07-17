import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/database";
import { defaultEditorState, type DrillEditorState } from "@/types/editor";
import { editorStateToJson, parseEditorState } from "@/lib/drills/editor";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getDrillGraphic(
  supabase: SupabaseServerClient,
  userId: string,
  drillId: string
): Promise<DrillEditorState> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("drill_graphics")
    .select("canvas_json")
    .eq("user_id", userId)
    .eq("drill_id", drillId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return defaultEditorState;

  return parseEditorState((data as { canvas_json: Json }).canvas_json);
}

export async function upsertDrillGraphic(
  supabase: SupabaseServerClient,
  userId: string,
  drillId: string,
  state: DrillEditorState
) {
  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("drill_graphics").upsert(
    {
      drill_id: drillId,
      user_id: userId,
      canvas_json: editorStateToJson(state)
    },
    {
      onConflict: "drill_id"
    }
  );
  if (error) throw new Error(error.message);
}
