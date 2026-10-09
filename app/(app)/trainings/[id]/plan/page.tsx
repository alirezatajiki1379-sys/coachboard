import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { SessionForm } from "@/components/sessions/session-form";
import { Button } from "@/components/ui/button";
import { createSignedImageUrlMap } from "@/lib/drills/graphics";
import { parseEditorState } from "@/lib/drills/editor";
import { jsonToMaterials } from "@/lib/drills/materials";
import { getActiveLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { defaultSessionGroups, type SessionFormValues, type SessionPlanSection, type SessionPlanStaff } from "@/lib/sessions/utils";
import { getDrillsForSessionBuilder } from "@/lib/sessions/queries";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { addSessionPlanStaff, applyTrainingPlanTemplate, createBlankSessionPlan, updateConcreteSessionPlan } from "@/lib/squad/training-plan-actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { Drill, DrillVisual, SquadTrainingEventDetail } from "@/types/domain";
import { defaultEditorState } from "@/types/editor";

type PageProps = { params: Promise<{ id: string }> };
type PlanRow = { id: string; title: string; source_training_session_id: string | null; plan_json: Json; snapshot_json: Json; updated_at: string };
type SectionRow = {
  id: string; section_key: string; title: string; order_index: number; duration_minutes: number; section_notes: string | null;
  responsibility_mode: SessionPlanSection["responsibilityMode"]; staff_id: string | null;
  planning_status: SessionPlanSection["planningStatus"]; instruction: string | null;
};
type DrillInstanceRow = {
  id: string; source_drill_id: string | null; title: string; block: string | null; order_index: number;
  planned_duration_minutes: number | null; snapshot_json: Json; override_json: Json; section_id: string | null;
  responsibility_mode: "unassigned" | "me" | "staff" | "together" | null; responsible_staff_id: string | null;
  planning_status: "ready" | "needs_planning" | null; planning_instruction: string | null;
};

export default async function TrainingPlanPage({ params }: PageProps) {
  const { id } = await params;
  const [locale, supabase] = await Promise.all([getActiveLocale(), createClient()]);
  const ui = createSystemTranslator(locale);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event || event.deletedAt) notFound();
  const db = supabase as unknown as SupabaseClient;
  const { data: planData, error: planError } = await db.from("training_session_plan_instances")
    .select("id,title,source_training_session_id,plan_json,snapshot_json,updated_at")
    .eq("user_id", user.id).eq("event_id", id).maybeSingle();
  if (planError) throw new Error(planError.message);

  if (!planData) {
    const { data: templates, error } = await db.from("training_sessions")
      .select("id,title,duration_target_minutes,main_focus")
      .eq("user_id", user.id).is("archived_at", null).is("deleted_at", null).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return <div className="mx-auto max-w-5xl space-y-6">
      <BackLink eventId={id} label={ui("Back to training")} />
      <header><p className="text-sm font-semibold uppercase text-board-green">{ui("Session Plan Builder")}</p><h1 className="mt-2 text-3xl font-bold text-board-navy">{ui("Plan Training")}</h1><p className="mt-2 text-slate-600">{ui("Use a reusable Training Plan or start with an empty plan. The Session copy can be edited independently.")}</p></header>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <ClipboardList className="h-6 w-6 text-board-green" /><h2 className="mt-3 text-lg font-bold text-board-navy">{ui("Use Training Plan")}</h2><p className="mt-1 text-sm text-slate-600">{ui("Copy an existing plan into this Training. The original remains unchanged.")}</p>
          <div className="mt-4 space-y-2">{(templates ?? []).length ? (templates ?? []).map((template) => <form key={template.id} action={applyTrainingPlanTemplate} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-board-line bg-board-paper p-3">
            <input type="hidden" name="eventId" value={id} /><input type="hidden" name="templateId" value={template.id} />
            <div className="min-w-0"><p translate="no" className="truncate font-bold text-board-navy">{template.title}</p><p className="text-xs text-slate-500">{template.duration_target_minutes ? `${template.duration_target_minutes} ${ui("min")}` : ui("Flexible duration")}</p></div>
            <Button type="submit" className="h-9">{ui("Use Plan")}</Button>
          </form>) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-500">{ui("No reusable Training Plans available yet.")}</p>}</div>
        </article>
        <article className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
          <Plus className="h-6 w-6 text-board-green" /><h2 className="mt-3 text-lg font-bold text-board-navy">{ui("Create from scratch")}</h2><p className="mt-1 text-sm text-slate-600">{ui("Open the full builder with an empty Training section and add Drills from your Library.")}</p>
          <form action={createBlankSessionPlan} className="mt-4"><input type="hidden" name="eventId" value={id} /><Button type="submit">{ui("Create from scratch")}</Button></form>
        </article>
      </section>
    </div>;
  }

  const plan = planData as PlanRow;
  const [sectionsResult, instancesResult, staffResult, libraryDrills] = await Promise.all([
    db.from("training_section_briefs").select("id,section_key,title,order_index,duration_minutes,section_notes,responsibility_mode,staff_id,planning_status,instruction").eq("user_id", user.id).eq("event_id", id).order("order_index"),
    db.from("training_session_drill_instances").select("id,source_drill_id,title,block,order_index,planned_duration_minutes,snapshot_json,override_json,section_id,responsibility_mode,responsible_staff_id,planning_status,planning_instruction").eq("user_id", user.id).eq("event_id", id).neq("status", "removed").order("order_index"),
    event.squadId ? db.from("squad_staff").select("id,name,role,is_active").eq("user_id", user.id).eq("squad_id", event.squadId).order("name") : Promise.resolve({ data: [], error: null }),
    getDrillsForSessionBuilder(supabase, user.id)
  ]);
  if (sectionsResult.error) throw new Error(sectionsResult.error.message);
  if (instancesResult.error) throw new Error(instancesResult.error.message);
  if (staffResult.error) throw new Error(staffResult.error.message);
  const sectionRows = (sectionsResult.data ?? []) as SectionRow[];
  const instanceRows = (instancesResult.data ?? []) as DrillInstanceRow[];
  const snapshotPaths = instanceRows.flatMap((row) => {
    const visual = record(record(row.snapshot_json)?.sourceDrill)?.visual;
    const path = record(visual)?.uploadedImagePath;
    return typeof path === "string" ? [path] : [];
  });
  const signedUrls = await createSignedImageUrlMap(supabase, snapshotPaths);
  const snapshotDrills = instanceRows.map((row) => snapshotDrill(row, user.id, signedUrls));
  const staff = (staffResult.data ?? []).filter((member) => member.is_active).map((member) => ({ id: member.id, name: member.name, role: member.role })) as SessionPlanStaff[];
  const initialValues = buildInitialValues(plan, event, sectionRows, instanceRows);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><BackLink eventId={id} label={ui("Back to training")} /><Link href={`/trainings/${id}/brief`} className="text-sm font-bold text-board-green hover:underline">{ui("Open Staff Brief")}</Link></div>
    <header><p className="text-sm font-semibold uppercase text-board-green">{ui("Session Plan Builder")}</p><h1 className="mt-2 text-3xl font-bold text-board-navy">{ui("Plan Training")}</h1><p className="mt-2 text-slate-600">{ui("The same full builder as reusable Training Plans, with Session-only sections, Drill changes and staff responsibilities.")}</p></header>
    <details className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Team staff")} ({staff.length})</summary>
      <form action={addSessionPlanStaff} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="eventId" value={id} />
        <label className="text-xs font-semibold text-slate-600">{ui("Coach name")}<input name="name" required maxLength={120} className="mt-1 h-10 w-full rounded-md border border-board-line px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">{ui("Role")}<input name="role" maxLength={80} placeholder={ui("Assistant coach")} className="mt-1 h-10 w-full rounded-md border border-board-line px-3 text-sm" /></label>
        <Button type="submit" variant="secondary">{ui("Add coach")}</Button>
      </form>
      {staff.length ? <div className="mt-3 flex flex-wrap gap-2">{staff.map((member) => <span key={member.id} translate="no" className="rounded-full bg-board-paper px-3 py-1 text-xs font-semibold text-slate-700">{member.name}{member.role ? ` · ${member.role}` : ""}</span>)}</div> : <p className="mt-3 text-sm text-slate-500">{ui("Add a coach to assign Training sections.")}</p>}
    </details>
    <SessionForm action={updateConcreteSessionPlan} mode="edit" builderMode="session" eventId={id} drills={[...libraryDrills, ...snapshotDrills]} initialValues={initialValues} staff={staff} cancelHref={`/trainings/${id}`} />
  </div>;
}

function BackLink({ eventId, label }: { eventId: string; label: string }) {
  return <Link href={`/trainings/${eventId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy"><ArrowLeft className="h-4 w-4" />{label}</Link>;
}

function buildInitialValues(plan: PlanRow, event: SquadTrainingEventDetail, sections: SectionRow[], drills: DrillInstanceRow[]): SessionFormValues {
  const value = record(plan.plan_json);
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const normalizedSections: SessionPlanSection[] = sections.map((section, orderIndex) => ({ id: section.id, key: section.section_key, title: section.title, orderIndex, durationMinutes: section.duration_minutes, notes: section.section_notes ?? "", responsibilityMode: section.responsibility_mode, staffId: section.staff_id ?? "", planningStatus: section.planning_status, instruction: section.instruction ?? "" }));
  return {
    title: stringValue(value?.title) || plan.title,
    sessionDate: stringValue(value?.sessionDate) || event.date,
    startTime: stringValue(value?.startTime) || event.startTime,
    teamAgeGroup: stringValue(value?.teamAgeGroup), mainFocus: stringValue(value?.mainFocus) || event.focus || "", secondaryFocus: stringValue(value?.secondaryFocus),
    expectedPlayers: String(numberValue(value?.expectedPlayers) ?? (event.attendance.filter((entry) => !entry.plannedStatus || entry.plannedStatus === "expected").length || "")),
    durationTargetMinutes: String(numberValue(value?.durationTargetMinutes) ?? ""), location: stringValue(value?.location) || event.location || "", notes: stringValue(value?.notes),
    playerGroups: Array.isArray(value?.playerGroups) ? value.playerGroups as SessionFormValues["playerGroups"] : defaultSessionGroups(), sections: normalizedSections,
    drills: drills.map((row, orderIndex) => {
      const override = record(row.override_json); const source = record(record(row.snapshot_json)?.sourceDrill); const sourceTitle = stringValue(source?.title);
      const section = row.section_id ? sectionById.get(row.section_id) : sections.find((item) => item.title === row.block);
      return { id: row.id, drillId: `session:${row.id}`, block: section?.section_key ?? normalizedSections[0]?.key ?? "main-part", plannedDurationMinutes: row.planned_duration_minutes ?? 1, coachNotes: stringValue(override?.coachNotes), orderIndex,
        timingMode: override?.timingMode === "simultaneous" ? "simultaneous" : "sequential", simultaneousGroup: stringValue(override?.simultaneousGroup) || "set-1", participatingGroups: stringArray(override?.participatingGroups), startingGroup: stringValue(override?.startingGroup),
        titleOverride: stringValue(override?.title) || (row.title !== sourceTitle ? row.title : undefined), descriptionOverride: optionalString(override?.description), organizationOverride: optionalString(override?.organization), selectedCoachingPoints: Array.isArray(override?.coachingPoints) ? stringArray(override?.coachingPoints) : undefined, sessionNote: optionalString(override?.sessionNote),
        responsibilityMode: row.responsibility_mode ?? undefined, responsibleStaffId: row.responsible_staff_id ?? undefined, planningStatus: row.planning_status ?? undefined, planningInstruction: row.planning_instruction ?? undefined };
    })
  };
}

function snapshotDrill(row: DrillInstanceRow, userId: string, signedUrls: Map<string, string>): Drill & { visual?: DrillVisual; isSessionSnapshot: true } {
  const source = record(record(row.snapshot_json)?.sourceDrill); const visualData = record(source?.visual); const uploadedImagePath = stringValue(visualData?.uploadedImagePath) || undefined;
  const visual: DrillVisual = { graphic: source?.graphic ? parseEditorState(source.graphic as Json) : defaultEditorState, source: visualData?.source === "upload" && uploadedImagePath ? "upload" : "editor", uploadedImagePath, uploadedImageUrl: uploadedImagePath ? signedUrls.get(uploadedImagePath) : undefined, uploadedImageMimeType: optionalString(visualData?.uploadedImageMimeType), uploadedImageSizeBytes: numberValue(visualData?.uploadedImageSizeBytes) };
  const now = new Date(0).toISOString();
  return { id: `session:${row.id}`, userId, title: stringValue(source?.title) || row.title, shortDescription: optionalString(source?.shortDescription ?? source?.short_description), organization: optionalString(source?.organization), coachingPoints: optionalString(source?.coachingPoints ?? source?.coaching_points), variations: optionalString(source?.variations), easierVersion: optionalString(source?.easierVersion ?? source?.easier_version), harderVersion: optionalString(source?.harderVersion ?? source?.harder_version), ageMode: "all_ages", ageGroups: ["all_ages"], mainFocus: "Passing", trainingBlocks: ["Main part 1"], drillType: "Group exercise", durationMinutes: numberValue(source?.durationMinutes ?? source?.duration_minutes) ?? row.planned_duration_minutes ?? 1, minPlayers: numberValue(source?.minPlayers ?? source?.min_players) ?? 1, maxPlayers: numberValue(source?.maxPlayers ?? source?.max_players) ?? 30, materials: jsonToMaterials((source?.materials ?? []) as Json), setupParameters: [], difficultyLevel: 3, intensityLevel: 3, isFavorite: false, tags: [], status: "published", createdAt: now, updatedAt: now, visual, isSessionSnapshot: true };
}

function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function optionalString(value: unknown) { return typeof value === "string" ? value : undefined; }
function numberValue(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
