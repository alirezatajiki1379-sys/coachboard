alter table public.squad_attendance_records
add column if not exists actual_absence_reason text;

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_actual_absence_reason_check;

alter table public.squad_attendance_records
add constraint squad_attendance_records_actual_absence_reason_check
check (
  actual_absence_reason is null
  or actual_absence_reason in (
    'unexcused',
    'excused',
    'sick',
    'injured',
    'school',
    'work',
    'holiday',
    'private',
    'other'
  )
);
