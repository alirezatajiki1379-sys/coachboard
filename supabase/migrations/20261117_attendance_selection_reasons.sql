begin;

-- Additive reason vocabulary only: no historical rows, status values or RLS
-- policies change. Apply before deploying code that writes the new reasons.
-- not_nominated is a selection decision, not a missed attendance opportunity.
alter table public.squad_attendance_records
  drop constraint if exists squad_attendance_records_planned_reason_check,
  add constraint squad_attendance_records_planned_reason_check check (
    planned_reason is null or planned_reason in (
      'V', 'K', 'E', 'P', 'S', 'Z', 'U',
      'injured', 'sick', 'school', 'work', 'holiday', 'private', 'other',
      'club', 'not_nominated'
    )
  ),
  drop constraint if exists squad_attendance_records_actual_absence_reason_check,
  add constraint squad_attendance_records_actual_absence_reason_check check (
    actual_absence_reason is null or actual_absence_reason in (
      'unexcused', 'excused', 'late_cancellation', 'sick', 'injured',
      'school', 'work', 'holiday', 'private', 'other', 'club', 'not_nominated'
    )
  );

commit;
