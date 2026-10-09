"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Pencil, Plus, UserRoundCheck, UserRoundX } from "lucide-react";
import { useSystemText } from "@/components/i18n/use-system-text";
import { Button } from "@/components/ui/button";
import {
  createSquadStaff,
  toggleSquadStaffActive,
  updateSquadStaff,
  type StaffActionState
} from "@/lib/squad/staff-actions";
import { isStandardStaffRole, staffRoleOptions, type SquadStaffMember } from "@/lib/squad/staff";

const initialState: StaffActionState = { ok: true, message: "" };
const fieldClass = "mt-1 h-10 w-full min-w-0 rounded-md border border-board-line bg-white px-3 text-sm text-board-navy focus:border-board-green focus:outline-none focus:ring-2 focus:ring-green-100";

export function StaffManagement({ squadId, staff }: { squadId: string; staff: SquadStaffMember[] }) {
  const ui = useSystemText();
  const active = staff.filter((member) => member.isActive);
  const inactive = staff.filter((member) => !member.isActive);
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-green-50 p-2 text-board-green"><Plus className="h-5 w-5" /></span>
          <div><h2 className="font-bold text-board-navy">{ui("Add coach")}</h2><p className="mt-1 text-sm text-slate-600">{ui("Staff belong to this Team and can be assigned in every future Training.")}</p></div>
        </div>
        <StaffForm squadId={squadId} mode="create" />
      </section>

      <StaffSection title={ui("Active")} icon={<UserRoundCheck className="h-5 w-5" />} staff={active} squadId={squadId} empty={ui("No active Staff yet. Add the first coach above.")} />
      {inactive.length ? <StaffSection title={ui("Inactive")} icon={<UserRoundX className="h-5 w-5" />} staff={inactive} squadId={squadId} empty="" /> : null}
    </div>
  );
}

function StaffSection({ title, icon, staff, squadId, empty }: { title: string; icon: React.ReactNode; staff: SquadStaffMember[]; squadId: string; empty: string }) {
  return <section>
    <div className="mb-3 flex items-center gap-2 text-board-navy">{icon}<h2 className="text-lg font-bold">{title}</h2><span className="rounded-full bg-board-paper px-2 py-0.5 text-xs font-bold text-slate-600">{staff.length}</span></div>
    {staff.length ? <div className="grid gap-3 lg:grid-cols-2">{staff.map((member) => <StaffCard key={member.id} squadId={squadId} member={member} />)}</div> : <div className="rounded-lg border border-dashed border-board-line bg-white p-6 text-center text-sm text-slate-500">{empty}</div>}
  </section>;
}

function StaffCard({ squadId, member }: { squadId: string; member: SquadStaffMember }) {
  const ui = useSystemText();
  const [editing, setEditing] = useState(false);
  return <article className="rounded-lg border border-board-line bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 translate="no" className="break-words font-bold text-board-navy">{member.name}</h3><p className="mt-1 text-sm text-slate-600">{isStandardStaffRole(member.role) ? ui(member.role) : member.role}</p><p className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${member.isActive ? "text-green-700" : "text-slate-500"}`}><CheckCircle2 className="h-3.5 w-3.5" />{ui(member.isActive ? "Active" : "Inactive")}</p></div>
      <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => setEditing((value) => !value)}><Pencil className="h-4 w-4" />{ui("Edit")}</Button>
    </div>
    {editing ? <StaffForm squadId={squadId} mode="edit" member={member} onSaved={() => setEditing(false)} /> : null}
    <ActiveToggle squadId={squadId} member={member} />
  </article>;
}

function StaffForm({ squadId, mode, member, onSaved }: { squadId: string; mode: "create" | "edit"; member?: SquadStaffMember; onSaved?: () => void }) {
  const ui = useSystemText();
  const formRef = useRef<HTMLFormElement>(null);
  const action = mode === "create" ? createSquadStaff : updateSquadStaff;
  const [state, formAction] = useActionState(action, initialState);
  const initialRole = member?.role ?? "Assistant Coach";
  const [roleChoice, setRoleChoice] = useState(isStandardStaffRole(initialRole) ? initialRole : "Other");
  const [customRole, setCustomRole] = useState(isStandardStaffRole(initialRole) ? "" : initialRole);
  useEffect(() => {
    if (!state.ok || !state.message) return;
    if (mode === "create") {
      formRef.current?.reset();
      setRoleChoice("Assistant Coach");
      setCustomRole("");
    } else onSaved?.();
  }, [mode, onSaved, state]);
  const role = roleChoice === "Other" ? customRole : roleChoice;
  return <form ref={formRef} action={formAction} className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
    <input type="hidden" name="squadId" value={squadId} />
    {member ? <input type="hidden" name="staffId" value={member.id} /> : null}
    <input type="hidden" name="role" value={role} />
    <label className="text-xs font-bold text-slate-600">{ui("Name")}<input name="name" required maxLength={120} defaultValue={member?.name ?? ""} className={fieldClass} /></label>
    <label className="text-xs font-bold text-slate-600">{ui("Role")}<select value={roleChoice} onChange={(event) => setRoleChoice(event.target.value)} className={fieldClass}>{staffRoleOptions.map((option) => <option key={option} value={option}>{ui(option)}</option>)}<option value="Other">{ui("Other")}</option></select></label>
    {roleChoice === "Other" ? <label className="text-xs font-bold text-slate-600 sm:col-span-2">{ui("Custom role")}<input value={customRole} onChange={(event) => setCustomRole(event.target.value)} required maxLength={80} className={fieldClass} /></label> : null}
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><SubmitButton label={ui(mode === "create" ? "Add coach" : "Save changes")} />{state.message ? <p role={state.ok ? "status" : "alert"} className={`text-xs font-semibold ${state.ok ? "text-green-700" : "text-red-700"}`}>{ui(state.message)}</p> : null}</div>
  </form>;
}

function ActiveToggle({ squadId, member }: { squadId: string; member: SquadStaffMember }) {
  const ui = useSystemText();
  const [state, action] = useActionState(toggleSquadStaffActive, initialState);
  return <form action={action} className="mt-4 flex flex-wrap items-center gap-3 border-t border-board-line pt-3">
    <input type="hidden" name="squadId" value={squadId} /><input type="hidden" name="staffId" value={member.id} />
    <SubmitButton label={ui(member.isActive ? "Mark inactive" : "Reactivate")} variant="secondary" />
    {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-xs font-semibold ${state.ok ? "text-green-700" : "text-red-700"}`}>{ui(state.message)}</p> : null}
  </form>;
}

function SubmitButton({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} disabled={pending} className="h-9 justify-center">{label}</Button>;
}
