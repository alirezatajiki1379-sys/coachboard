import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { StaffBriefComposer } from "@/components/squad/staff-brief-composer";
import { createSignedImageUrlMap } from "@/lib/drills/graphics";
import { parseEditorState } from "@/lib/drills/editor";
import { jsonToMaterials, materialLineLabel } from "@/lib/drills/materials";
import { getActiveLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { isExpectedFromPlannedStatus, participantComposition } from "@/lib/squad/attendance-utils";
import type { BriefPlanningStatus, BriefResponsibilityMode, StaffBriefData, StaffBriefDrill, StaffBriefSection } from "@/lib/squad/staff-brief";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { DrillVisual, SquadAttendanceEntry } from "@/types/domain";
import { defaultEditorState } from "@/types/editor";

type SectionRow = {
  id: string;
  section_key: string;
  title: string;
  order_index: number;
  duration_minutes: number;
  section_notes: string | null;
  responsibility_mode: string;
  staff_id: string | null;
  planning_status: string;
  instruction: string | null;
  briefing_text: string | null;
};

type DrillRow = {
  id: string;
  section_id: string | null;
  block: string | null;
  title: string;
  order_index: number;
  planned_duration_minutes: number | null;
  snapshot_json: Json;
  override_json: Json;
  responsibility_mode: string | null;
  responsible_staff_id: string | null;
  planning_status: string | null;
  planning_instruction: string | null;
};

type StaffRow = {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
};

export default async function StaffBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, supabase] = await Promise.all([getActiveLocale(), createClient()]);
  const ui = createSystemTranslator(locale);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event || event.deletedAt) notFound();

  const db = supabase as unknown as SupabaseClient;
  const [planResult, sectionResult, drillResult, staffResult] = await Promise.all([
    db.from("training_session_plan_instances")
      .select("title,plan_json")
      .eq("user_id", user.id)
      .eq("event_id", id)
      .maybeSingle(),
    db.from("training_section_briefs")
      .select("id,section_key,title,order_index,duration_minutes,section_notes,responsibility_mode,staff_id,planning_status,instruction,briefing_text")
      .eq("user_id", user.id)
      .eq("event_id", id)
      .order("order_index"),
    db.from("training_session_drill_instances")
      .select("id,section_id,block,title,order_index,planned_duration_minutes,snapshot_json,override_json,responsibility_mode,responsible_staff_id,planning_status,planning_instruction")
      .eq("user_id", user.id)
      .eq("event_id", id)
      .neq("status", "removed")
      .order("order_index"),
    event.squadId
      ? db.from("squad_staff")
        .select("id,name,role,is_active")
        .eq("user_id", user.id)
        .eq("squad_id", event.squadId)
        .order("is_active", { ascending: false })
        .order("name")
      : Promise.resolve({ data: [], error: null })
  ]);

  if (planResult.error) throw new Error(planResult.error.message);
  if (!planResult.data) redirect(`/trainings/${id}/plan`);
  if (sectionResult.error) throw new Error(sectionResult.error.message);
  if (drillResult.error) throw new Error(drillResult.error.message);
  if (staffResult.error) throw new Error(staffResult.error.message);

  const sectionRows = (sectionResult.data ?? []) as SectionRow[];
  const drillRows = (drillResult.data ?? []) as DrillRow[];
  const paths = drillRows.flatMap((drill) => {
    const source = sourceDrill(drill.snapshot_json);
    const path = optionalString(record(source?.visual)?.uploadedImagePath);
    return path ? [path] : [];
  });
  const signedUrls = await createSignedImageUrlMap(supabase, paths);
  const planJson = record(planResult.data.plan_json);
  const expected = event.attendance.filter(isExpectedFromPlannedStatus);
  const composition = participantComposition(expected);

  const sections: StaffBriefSection[] = sectionRows.map((section) => ({
    id: section.id,
    key: section.section_key,
    title: section.title,
    orderIndex: section.order_index,
    durationMinutes: positiveNumber(section.duration_minutes),
    notes: section.section_notes ?? "",
    briefingText: section.briefing_text ?? "",
    responsibilityMode: responsibilityMode(section.responsibility_mode),
    staffId: section.staff_id ?? undefined,
    planningStatus: planningStatus(section.planning_status),
    instruction: section.instruction ?? "",
    drills: drillRows
      .filter((drill) => drill.section_id === section.id || (!drill.section_id && drill.block === section.section_key))
      .map((drill) => mapDrill(drill, signedUrls))
  }));

  const unassignedDrills = drillRows.filter((drill) => !sections.some((section) => section.drills.some((item) => item.id === drill.id)));
  if (unassignedDrills.length) {
    sections.push({
      id: "legacy-unassigned",
      key: "other",
      title: ui("Other"),
      orderIndex: sections.length,
      durationMinutes: 0,
      notes: "",
      briefingText: "",
      responsibilityMode: "unassigned",
      planningStatus: "needs_planning",
      instruction: "",
      drills: unassignedDrills.map((drill) => mapDrill(drill, signedUrls))
    });
  }

  const data: StaffBriefData = {
    eventId: id,
    title: String(planResult.data.title || event.label || event.linkedTrainingSessionTitle || ui("Training")),
    team: event.squadName || ui("Team"),
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location ?? "",
    objective: stringValue(planJson?.mainFocus) || event.focus || "",
    staff: ((staffResult.data ?? []) as StaffRow[]).map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      isActive: member.is_active
    })),
    counts: {
      expected: expected.length,
      goalkeepers: composition.goalkeepers,
      fieldPlayers: composition.fieldPlayers + composition.unassigned,
      unavailable: event.attendance.filter((entry) => entry.plannedStatus === "unavailable").length,
      unclear: event.attendance.filter((entry) => entry.plannedStatus === "unclear").length,
      trials: expected.filter((entry) => entry.player?.playerType === "trial").length
    },
    expectedNames: expected.map(playerName).filter(Boolean),
    sections
  };

  return <div className="mx-auto max-w-[1180px] space-y-4">
    <div className="no-print">
      <Link href={`/trainings/${id}/plan`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-green">
        <ArrowLeft className="h-4 w-4" />{ui("Back to Session Plan")}
      </Link>
    </div>
    <StaffBriefComposer data={data} locale={locale} />
  </div>;
}

function mapDrill(drill: DrillRow, signedUrls: Map<string, string>): StaffBriefDrill {
  const source = sourceDrill(drill.snapshot_json);
  const override = record(drill.override_json);
  const materials = source?.materials === undefined ? [] : jsonToMaterials(source.materials as Json);
  return {
    id: drill.id,
    title: drill.title,
    durationMinutes: positiveNumber(drill.planned_duration_minutes),
    fallbackText: stringValue(override?.description) || stringValue(source?.shortDescription ?? source?.short_description),
    briefingText: stringValue(override?.briefingText),
    organization: stringValue(override?.organization) || stringValue(source?.organization),
    sessionNote: stringValue(override?.sessionNote) || stringValue(override?.coachNotes),
    coachingPoints: Array.isArray(override?.coachingPoints)
      ? stringArray(override.coachingPoints)
      : coachingPoints(source?.coachingPoints ?? source?.coaching_points),
    equipment: materials.map(materialLineLabel),
    visual: snapshotVisual(source, signedUrls),
    responsibilityMode: drill.responsibility_mode ? responsibilityMode(drill.responsibility_mode) : undefined,
    responsibleStaffId: drill.responsible_staff_id ?? undefined,
    planningStatus: drill.planning_status ? planningStatus(drill.planning_status) : undefined,
    planningInstruction: drill.planning_instruction ?? ""
  };
}

function snapshotVisual(source: Record<string, unknown> | undefined, signedUrls: Map<string, string>): DrillVisual {
  const stored = record(source?.visual);
  const path = optionalString(stored?.uploadedImagePath);
  return {
    graphic: source?.graphic ? parseEditorState(source.graphic as Json) : defaultEditorState,
    source: stored?.source === "upload" && path ? "upload" : "editor",
    uploadedImagePath: path,
    uploadedImageUrl: path ? signedUrls.get(path) : undefined,
    uploadedImageMimeType: optionalString(stored?.uploadedImageMimeType),
    uploadedImageSizeBytes: numberValue(stored?.uploadedImageSizeBytes)
  };
}

function sourceDrill(snapshot: Json) {
  return record(record(snapshot)?.sourceDrill);
}

function playerName(entry: SquadAttendanceEntry) {
  return entry.player ? [entry.player.firstName, entry.player.lastName].filter(Boolean).join(" ") : "";
}

function responsibilityMode(value: string): BriefResponsibilityMode {
  if (value === "me" || value === "staff" || value === "together") return value;
  return "unassigned";
}

function planningStatus(value: string): BriefPlanningStatus {
  return value === "ready" ? "ready" : "needs_planning";
}

function coachingPoints(value: unknown) {
  return typeof value === "string"
    ? value.split(/\r?\n|;/).map((point) => point.replace(/^[-*•]\s*/, "").trim()).filter(Boolean)
    : stringArray(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}
