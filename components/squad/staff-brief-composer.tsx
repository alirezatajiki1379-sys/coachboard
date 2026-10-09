"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, FileDown, Minimize2, Save, Share2, TriangleAlert } from "lucide-react";
import { SessionDrillPreview } from "@/components/sessions/session-drill-preview";
import { useSystemText } from "@/components/i18n/use-system-text";
import { Button } from "@/components/ui/button";
import { formatEventDate } from "@/lib/squad/attendance-format";
import { saveStaffBriefContent, type StaffBriefActionState } from "@/lib/squad/staff-brief-actions";
import {
  clockTime,
  resolveBriefResponsibility,
  sectionDuration,
  sectionStartOffsets,
  type StaffBriefData,
  type StaffBriefDrill,
  type StaffBriefSection
} from "@/lib/squad/staff-brief";
import { cn } from "@/lib/utils";

const initialActionState: StaffBriefActionState = { ok: true, message: "" };
const printableHeightPx = 1047;

export function StaffBriefComposer({ data, locale }: { data: StaffBriefData; locale: "en" | "de" }) {
  const ui = useSystemText();
  const sheetRef = useRef<HTMLElement>(null);
  const [audience, setAudience] = useState("all");
  const [includeNames, setIncludeNames] = useState(false);
  const [includeVisuals, setIncludeVisuals] = useState(true);
  const [includePoints, setIncludePoints] = useState(true);
  const [includeEquipment, setIncludeEquipment] = useState(data.sections.some((section) => section.drills.some((drill) => drill.equipment.length)));
  const [includeInstructions, setIncludeInstructions] = useState(true);
  const [compact, setCompact] = useState(false);
  const [fits, setFits] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [sectionTexts, setSectionTexts] = useState<Record<string, string>>(() => Object.fromEntries(data.sections.map((section) => [section.id, section.briefingText])));
  const [drillTexts, setDrillTexts] = useState<Record<string, string>>(() => Object.fromEntries(data.sections.flatMap((section) => section.drills.map((drill) => [drill.id, drill.briefingText]))));
  const [saveState, saveAction, savePending] = useActionState(saveStaffBriefContent, initialActionState);
  const offsets = useMemo(() => sectionStartOffsets(data.sections), [data.sections]);
  const activeStaff = data.staff.filter((member) => member.isActive);

  const measure = useCallback(() => {
    if (!sheetRef.current) return;
    const measurement = sheetRef.current.cloneNode(true) as HTMLElement;
    measurement.classList.add("staff-brief-measure");
    measurement.setAttribute("aria-hidden", "true");
    document.body.appendChild(measurement);
    const measuredHeight = measurement.getBoundingClientRect().height;
    measurement.remove();
    setFits(measuredHeight <= printableHeightPx + 2);
  }, []);

  useEffect(() => {
    measure();
    const node = sheetRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [audience, compact, drillTexts, includeEquipment, includeInstructions, includeNames, includePoints, includeVisuals, measure, sectionTexts]);

  useEffect(() => {
    if (saveState.message) setFeedback(ui(saveState.message));
  }, [saveState, ui]);

  const payload = JSON.stringify({
    eventId: data.eventId,
    sections: data.sections.map((section) => ({ id: section.id, text: sectionTexts[section.id] ?? "" })),
    drills: data.sections.flatMap((section) => section.drills.map((drill) => ({ id: drill.id, text: drillTexts[drill.id] ?? "" })))
  });

  function condense() {
    setCompact(true);
    setIncludeVisuals(false);
    setIncludeEquipment(false);
    setFeedback(ui("Compact layout enabled. No Session Plan content was changed."));
  }

  const text = staffBriefText({ data, locale, audience, includeNames, includePoints, includeEquipment, includeInstructions, sectionTexts, drillTexts });

  async function copyText() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else legacyCopyText(text);
      setFeedback(ui("Brief copied."));
    } catch {
      setFeedback(ui("Copy failed. Please try again."));
    }
  }

  async function shareText() {
    if (!navigator.share) return copyText();
    try {
      await navigator.share({ title: `${ui("Staff Brief")} · ${data.title}`, text });
      setFeedback("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyText();
    }
  }

  return <div className="staff-brief-composer grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_290px] xl:items-start">
    <div className="min-w-0">
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-board-line bg-white p-3 shadow-sm">
        <FitStatus fits={fits} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-9" onClick={condense}><Minimize2 className="h-4 w-4" />{ui("Condense")}</Button>
          <Button type="button" variant="secondary" className="h-9" onClick={copyText}><Copy className="h-4 w-4" />{ui("Copy text")}</Button>
          <Button type="button" variant="secondary" className="h-9" onClick={shareText}><Share2 className="h-4 w-4" />{ui("Share")}</Button>
          <Button type="button" className="h-9" onClick={() => window.print()}><FileDown className="h-4 w-4" />{ui("Print / PDF")}</Button>
        </div>
        {feedback ? <p role="status" className="w-full text-xs font-semibold text-board-green">{feedback}</p> : null}
      </div>

      <article ref={sheetRef} className={cn("staff-brief-sheet print-page mx-auto w-full max-w-[794px] border border-board-line bg-white p-5 text-board-navy shadow-soft sm:p-7", compact && "staff-brief-compact")}>
        <BriefHeader data={data} locale={locale} ui={ui} />
        <ParticipantSummary data={data} includeNames={includeNames} ui={ui} />
        {data.objective ? <section className="staff-brief-band"><h2>{ui("Training objective")}</h2><p translate="no">{data.objective}</p></section> : null}
        <section className="staff-brief-timeline">
          <h2 className="staff-brief-heading">{ui("Session timeline")}</h2>
          <div className="mt-2 space-y-3">
            {data.sections.map((section, index) => <BriefSectionCard
              key={section.id}
              data={data}
              section={section}
              startMinute={offsets[index] ?? 0}
              audience={audience}
              includeVisuals={includeVisuals}
              includePoints={includePoints}
              includeEquipment={includeEquipment}
              includeInstructions={includeInstructions}
              compact={compact}
              sectionText={sectionTexts[section.id] ?? ""}
              drillTexts={drillTexts}
              setSectionText={(text) => setSectionTexts((current) => ({ ...current, [section.id]: text }))}
              setDrillText={(drillId, text) => setDrillTexts((current) => ({ ...current, [drillId]: text }))}
              ui={ui}
            />)}
          </div>
        </section>
      </article>
    </div>

    <aside className="no-print rounded-lg border border-board-line bg-white p-4 shadow-soft xl:sticky xl:top-24">
      <h2 className="font-bold text-board-navy">{ui("Brief settings")}</h2>
      <label className="mt-4 block text-xs font-bold text-slate-600">{ui("Briefing for")}
        <select value={audience} onChange={(event) => setAudience(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm">
          <option value="all">{ui("All staff")}</option>
          {activeStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>
      <fieldset className="mt-5 space-y-3"><legend className="text-xs font-bold uppercase text-slate-500">{ui("Include")}</legend>
        <Toggle checked={includeNames} onChange={setIncludeNames} label={ui("Include Player names")} />
        <Toggle checked={includeVisuals} onChange={setIncludeVisuals} label={ui("Drill visuals")} />
        <Toggle checked={includePoints} onChange={setIncludePoints} label={ui("Coaching Points")} />
        <Toggle checked={includeEquipment} onChange={setIncludeEquipment} label={ui("Equipment")} />
        <Toggle checked={includeInstructions} onChange={setIncludeInstructions} label={ui("Planning instructions")} />
      </fieldset>
      <form action={saveAction} className="mt-5 border-t border-board-line pt-4">
        <input type="hidden" name="briefingPayload" value={payload} />
        <Button type="submit" disabled={savePending} className="w-full justify-center"><Save className="h-4 w-4" />{ui(savePending ? "Saving..." : "Save briefing text")}</Button>
        {saveState.message ? <p role={saveState.ok ? "status" : "alert"} className={`mt-2 text-xs font-semibold ${saveState.ok ? "text-green-700" : "text-red-700"}`}>{ui(saveState.message)}</p> : null}
      </form>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">{ui("Only operational Training information is included. Ratings, development notes and medical details stay private.")}</p>
    </aside>
  </div>;
}

function BriefHeader({ data, locale, ui }: { data: StaffBriefData; locale: "en" | "de"; ui: (value: string) => string }) {
  return <header className="staff-brief-header">
    <p className="text-[10px] font-black uppercase text-board-green">CoachBoard · {ui("Staff Brief")}</p>
    <div className="mt-1 flex flex-wrap items-end justify-between gap-2"><div><p translate="no" className="text-sm font-bold text-slate-600">{data.team}</p><h1 translate="no" className="text-2xl font-bold">{data.title}</h1></div><p className="text-sm font-bold tabular-nums">{formatEventDate(data.date, locale)} · {data.startTime.slice(0, 5)}{data.endTime ? `–${data.endTime.slice(0, 5)}` : ""}</p></div>
    {data.location ? <p translate="no" className="mt-1 text-xs text-slate-600">{data.location}</p> : null}
  </header>;
}

function ParticipantSummary({ data, includeNames, ui }: { data: StaffBriefData; includeNames: boolean; ui: (value: string) => string }) {
  return <section className="staff-brief-summary">
    <Metric label={ui("Expected Players")} value={data.counts.expected} />
    <Metric label={ui("Goalkeepers")} value={data.counts.goalkeepers} />
    <Metric label={ui("Field players")} value={data.counts.fieldPlayers} />
    <Metric label={ui("Unavailable")} value={data.counts.unavailable} />
    {data.counts.trials ? <p className="col-span-full text-[10px] font-semibold text-slate-600">{ui("Trial Players")}: {data.counts.trials}</p> : null}
    {includeNames && data.expectedNames.length ? <p translate="no" className="col-span-full break-words border-t border-board-line pt-2 text-[10px] leading-relaxed text-slate-600">{data.expectedNames.join(", ")}</p> : null}
  </section>;
}

function BriefSectionCard({ data, section, startMinute, audience, includeVisuals, includePoints, includeEquipment, includeInstructions, compact, sectionText, drillTexts, setSectionText, setDrillText, ui }: {
  data: StaffBriefData;
  section: StaffBriefSection;
  startMinute: number;
  audience: string;
  includeVisuals: boolean;
  includePoints: boolean;
  includeEquipment: boolean;
  includeInstructions: boolean;
  compact: boolean;
  sectionText: string;
  drillTexts: Record<string, string>;
  setSectionText: (text: string) => void;
  setDrillText: (drillId: string, text: string) => void;
  ui: (value: string) => string;
}) {
  const labels = responsibilityLabels(ui);
  const responsibility = resolveBriefResponsibility(section, undefined, data.staff, labels);
  const highlighted = audience !== "all" && responsibility.staffId === audience;
  const duration = sectionDuration(section);
  return <section className={cn("staff-brief-section print-avoid", highlighted && "staff-brief-highlight") }>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="text-[10px] font-bold tabular-nums text-board-green">{clockTime(data.startTime, startMinute)}–{clockTime(data.startTime, startMinute + duration)}</p><h3 translate="no" className="break-words text-sm font-bold">{section.title}</h3></div>
      <div className="text-right text-[10px] font-semibold text-slate-600"><p translate="no">{responsibility.label}</p><p className={section.planningStatus === "ready" ? "text-green-700" : "text-amber-700"}>{ui(section.planningStatus === "ready" ? "Ready" : "Needs planning")}</p></div>
    </div>
    {highlighted ? <span className="mt-1 inline-flex rounded bg-board-green px-2 py-0.5 text-[9px] font-black uppercase text-white">{ui("Your section")}</span> : null}
    <BriefingEditor value={sectionText} fallback={section.notes} onChange={setSectionText} ui={ui} />
    {includeInstructions && section.instruction ? <p translate="no" className="staff-brief-instruction"><b>{ui("Planning instruction")}:</b> {section.instruction}</p> : null}
    {section.drills.length ? <div className="mt-2 space-y-2">{section.drills.map((drill) => <BriefDrillCard key={drill.id} data={data} section={section} drill={drill} audience={audience} includeVisuals={includeVisuals} includePoints={includePoints} includeEquipment={includeEquipment} includeInstructions={includeInstructions} compact={compact} text={drillTexts[drill.id] ?? ""} setText={(text) => setDrillText(drill.id, text)} ui={ui} />)}</div> : <p className="mt-2 rounded border border-dashed border-board-line px-2 py-1.5 text-[10px] text-slate-500">{ui("No Drills in this section yet.")}</p>}
  </section>;
}

function BriefDrillCard({ data, section, drill, audience, includeVisuals, includePoints, includeEquipment, includeInstructions, compact, text, setText, ui }: {
  data: StaffBriefData; section: StaffBriefSection; drill: StaffBriefDrill; audience: string; includeVisuals: boolean; includePoints: boolean; includeEquipment: boolean; includeInstructions: boolean; compact: boolean; text: string; setText: (text: string) => void; ui: (value: string) => string;
}) {
  const responsibility = resolveBriefResponsibility(section, drill, data.staff, responsibilityLabels(ui));
  const highlighted = audience !== "all" && responsibility.staffId === audience;
  const points = compact ? drill.coachingPoints.slice(0, 3) : drill.coachingPoints;
  return <article className={cn("staff-brief-drill print-avoid", highlighted && "ring-1 ring-board-green/50")}>
    <div className={cn("grid gap-2", includeVisuals && "sm:grid-cols-[minmax(0,1fr)_118px]")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 translate="no" className="break-words text-xs font-bold">{drill.title}</h4>{highlighted ? <span className="mt-1 inline-flex rounded bg-board-green px-1.5 py-0.5 text-[8px] font-black uppercase text-white">{ui("Your drill")}</span> : null}</div><p className="text-right text-[9px] font-semibold text-slate-500">{drill.durationMinutes} {ui("min")} · <span translate="no">{responsibility.label}</span>{responsibility.inherited ? ` · ${ui("Inherited")}` : ""}{drill.planningStatus ? <><br /><span className={drill.planningStatus === "ready" ? "text-green-700" : "text-amber-700"}>{ui(drill.planningStatus === "ready" ? "Ready" : "Needs planning")}</span></> : null}</p></div>
        <BriefingEditor value={text} fallback={drill.fallbackText || drill.sessionNote || drill.organization} onChange={setText} ui={ui} drill />
        {includePoints && points.length ? <div className="mt-1"><p className="text-[9px] font-bold uppercase text-slate-500">{ui("Coaching Points")}</p><ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[10px] leading-snug text-slate-700">{points.map((point) => <li key={point} translate="no">{point}</li>)}</ul></div> : null}
        {includeEquipment && drill.equipment.length ? <p translate="no" className="mt-1 text-[9px] text-slate-600"><b>{ui("Equipment")}:</b> {drill.equipment.join(" · ")}</p> : null}
        {includeInstructions && drill.planningInstruction ? <p translate="no" className="staff-brief-instruction"><b>{ui("Planning instruction")}:</b> {drill.planningInstruction}</p> : null}
      </div>
      {includeVisuals ? <div className="staff-brief-visual overflow-hidden rounded border border-board-line bg-white"><SessionDrillPreview visual={drill.visual} title={drill.title} /></div> : null}
    </div>
  </article>;
}

function BriefingEditor({ value, fallback, onChange, ui, drill = false }: { value: string; fallback: string; onChange: (text: string) => void; ui: (value: string) => string; drill?: boolean }) {
  const shown = value || fallback;
  return <div className="mt-1">
    <label className="no-print block text-[9px] font-bold uppercase text-slate-500">{ui("Briefing text")}<textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={2000} rows={drill ? 2 : 2} placeholder={fallback || ui("Add concise operational briefing text.")} className="mt-1 w-full resize-y rounded border border-board-line bg-white px-2 py-1.5 text-[11px] font-normal normal-case leading-snug text-slate-700 focus:border-board-green focus:outline-none" /></label>
    {shown ? <p translate="no" className="print-only text-[10px] leading-snug text-slate-700">{shown}</p> : null}
    {!value && fallback ? <p className="no-print mt-0.5 text-[9px] text-slate-400">{ui("Using Session description until custom Briefing text is saved.")}</p> : null}
  </div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-board-green" />{label}</label>;
}

function FitStatus({ fits }: { fits: boolean }) {
  const ui = useSystemText();
  return <span className={cn("inline-flex items-center gap-2 text-sm font-bold", fits ? "text-green-700" : "text-amber-700")}>{fits ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}{ui(fits ? "Fits on one page" : "Too long for one page")}</span>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><p className="text-[9px] font-bold uppercase text-slate-500">{label}</p><p className="text-lg font-bold tabular-nums">{value}</p></div>;
}

function responsibilityLabels(ui: (value: string) => string) {
  return { me: ui("Me"), together: ui("Together"), unassigned: ui("Unassigned"), staffMember: ui("Staff member") };
}

function staffBriefText({ data, locale, audience, includeNames, includePoints, includeEquipment, includeInstructions, sectionTexts, drillTexts }: { data: StaffBriefData; locale: "en" | "de"; audience: string; includeNames: boolean; includePoints: boolean; includeEquipment: boolean; includeInstructions: boolean; sectionTexts: Record<string, string>; drillTexts: Record<string, string> }) {
  const de = locale === "de";
  const staffName = data.staff.find((member) => member.id === audience)?.name;
  const labels = { me: de ? "Ich" : "Me", together: de ? "Gemeinsam" : "Together", unassigned: de ? "Nicht zugewiesen" : "Unassigned", staffMember: de ? "Trainerteam-Mitglied" : "Staff member" };
  const lines = [
    `CoachBoard · ${de ? "Trainerbriefing" : "Staff Brief"}`,
    `${data.title} · ${formatEventDate(data.date, locale)} · ${data.startTime.slice(0, 5)}${data.endTime ? `–${data.endTime.slice(0, 5)}` : ""}`,
    data.team,
    ...(data.location ? [data.location] : []),
    "",
    `${data.counts.expected} ${de ? "eingeplant" : "expected"} · ${data.counts.goalkeepers} GK · ${data.counts.fieldPlayers} ${de ? "Feldspieler" : "field players"} · ${data.counts.unavailable} ${de ? "nicht verfügbar" : "unavailable"}`
  ];
  if (staffName) lines.push(`${de ? "Briefing für" : "Briefing for"}: ${staffName}`);
  if (includeNames && data.expectedNames.length) lines.push(`${de ? "Spieler" : "Players"}: ${data.expectedNames.join(", ")}`);
  if (data.objective) lines.push("", `${de ? "Ziel" : "Objective"}: ${data.objective}`);
  lines.push("", de ? "ABLAUF" : "TIMELINE");
  const offsets = sectionStartOffsets(data.sections);
  for (const [index, section] of data.sections.entries()) {
    const duration = sectionDuration(section);
    const responsibility = resolveBriefResponsibility(section, undefined, data.staff, labels);
    lines.push("", `${clockTime(data.startTime, offsets[index])}–${clockTime(data.startTime, offsets[index] + duration)} ${section.title} · ${responsibility.label}`);
    const sectionText = sectionTexts[section.id] || section.notes;
    if (sectionText) lines.push(concise(sectionText));
    if (includeInstructions && section.instruction) lines.push(`${de ? "Planung" : "Instruction"}: ${concise(section.instruction)}`);
    for (const drill of section.drills) {
      const drillResponsibility = resolveBriefResponsibility(section, drill, data.staff, labels);
      lines.push(`- ${drill.title} · ${drill.durationMinutes} min · ${drillResponsibility.label}`);
      const drillText = drillTexts[drill.id] || drill.fallbackText || drill.sessionNote;
      if (drillText) lines.push(`  ${concise(drillText)}`);
      if (includePoints && drill.coachingPoints.length) lines.push(`  ${drill.coachingPoints.slice(0, 3).join(" · ")}`);
      if (includeEquipment && drill.equipment.length) lines.push(`  ${de ? "Material" : "Equipment"}: ${drill.equipment.join(", ")}`);
      if (includeInstructions && drill.planningInstruction) lines.push(`  ${de ? "Planung" : "Instruction"}: ${concise(drill.planningInstruction)}`);
    }
  }
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n").trim();
}

function concise(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 220) return clean;
  const sentence = clean.slice(0, 221).lastIndexOf(".");
  return `${clean.slice(0, sentence > 80 ? sentence + 1 : 217).trim()}…`;
}

function legacyCopyText(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy failed");
}
