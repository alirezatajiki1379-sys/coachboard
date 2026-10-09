import type { DrillVisual } from "@/types/domain";

export type StaffBriefStaff = {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
};

export type BriefResponsibilityMode = "unassigned" | "me" | "staff" | "together";
export type BriefPlanningStatus = "ready" | "needs_planning";

export type StaffBriefDrill = {
  id: string;
  title: string;
  durationMinutes: number;
  fallbackText: string;
  briefingText: string;
  organization: string;
  sessionNote: string;
  coachingPoints: string[];
  equipment: string[];
  visual: DrillVisual;
  responsibilityMode?: BriefResponsibilityMode;
  responsibleStaffId?: string;
  planningStatus?: BriefPlanningStatus;
  planningInstruction: string;
};

export type StaffBriefSection = {
  id: string;
  key: string;
  title: string;
  orderIndex: number;
  durationMinutes: number;
  notes: string;
  briefingText: string;
  responsibilityMode: BriefResponsibilityMode;
  staffId?: string;
  planningStatus: BriefPlanningStatus;
  instruction: string;
  drills: StaffBriefDrill[];
};

export type StaffBriefData = {
  eventId: string;
  title: string;
  team: string;
  date: string;
  startTime: string;
  endTime?: string;
  location: string;
  objective: string;
  staff: StaffBriefStaff[];
  counts: {
    expected: number;
    goalkeepers: number;
    fieldPlayers: number;
    unavailable: number;
    unclear: number;
    trials: number;
  };
  expectedNames: string[];
  sections: StaffBriefSection[];
};

export type ResolvedBriefResponsibility = {
  mode: BriefResponsibilityMode;
  staffId?: string;
  label: string;
  inherited: boolean;
};

export function resolveBriefResponsibility(
  section: StaffBriefSection,
  drill: StaffBriefDrill | undefined,
  staff: StaffBriefStaff[],
  labels: { me: string; together: string; unassigned: string; staffMember: string }
): ResolvedBriefResponsibility {
  const inherited = !drill?.responsibilityMode;
  const mode = drill?.responsibilityMode ?? section.responsibilityMode;
  const staffId = inherited ? section.staffId : drill?.responsibleStaffId;
  const name = staff.find((member) => member.id === staffId)?.name;
  if (mode === "me") return { mode, staffId, label: labels.me, inherited };
  if (mode === "staff") return { mode, staffId, label: name ?? labels.staffMember, inherited };
  if (mode === "together") return { mode, staffId, label: name ? `${labels.together} · ${name}` : labels.together, inherited };
  return { mode: "unassigned", staffId, label: labels.unassigned, inherited };
}

export function sectionDuration(section: StaffBriefSection) {
  if (section.durationMinutes > 0) return section.durationMinutes;
  return section.drills.reduce((total, drill) => total + Math.max(0, drill.durationMinutes), 0);
}

export function clockTime(startTime: string, offsetMinutes: number) {
  const [hours = 0, minutes = 0] = startTime.split(":").map(Number);
  const total = ((hours * 60 + minutes + offsetMinutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function sectionStartOffsets(sections: StaffBriefSection[]) {
  let elapsed = 0;
  return sections.map((section) => {
    const start = elapsed;
    elapsed += sectionDuration(section);
    return start;
  });
}
