begin;

-- Late cancellation is an explicit actual absence reason. It is distinct from
-- late arrival and from an unexcused absence. Historical final_status = 'S'
-- records remain unchanged and valid.
alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_actual_absence_reason_late_cancellation_check;

alter table public.squad_attendance_records
add constraint squad_attendance_records_actual_absence_reason_late_cancellation_check
check (
  actual_absence_reason is null
  or actual_absence_reason in (
    'unexcused',
    'excused',
    'late_cancellation',
    'sick',
    'injured',
    'school',
    'work',
    'holiday',
    'private',
    'other'
  )
) not valid;

alter table public.squad_attendance_records
validate constraint squad_attendance_records_actual_absence_reason_late_cancellation_check;

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_actual_absence_reason_check;

alter table public.squad_attendance_records
rename constraint squad_attendance_records_actual_absence_reason_late_cancellation_check
to squad_attendance_records_actual_absence_reason_check;

comment on column public.squad_attendance_records.actual_absence_reason is
  'Canonical actual absence reason. Late cancellation means the Player did not attend and cancelled too late.';

commit;
