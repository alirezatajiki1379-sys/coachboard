begin;

alter table public.squad_attendance_records
add column if not exists actual_attendance_note text,
add column if not exists left_early_minute integer;

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_final_status_check;

alter table public.squad_attendance_records
add constraint squad_attendance_records_final_status_check
check (
  final_status is null
  or final_status in (
    'present',
    'absent',
    'left_early',
    'Z',
    'V',
    'K',
    'E',
    'P',
    'S',
    'U'
  )
) not valid;

alter table public.squad_attendance_records
validate constraint squad_attendance_records_final_status_check;

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_left_early_minute_check;

alter table public.squad_attendance_records
add constraint squad_attendance_records_left_early_minute_check
check (
  left_early_minute is null
  or left_early_minute >= 0
) not valid;

alter table public.squad_attendance_records
validate constraint squad_attendance_records_left_early_minute_check;

comment on column public.squad_attendance_records.actual_attendance_note is
  'Factual context about what actually happened regarding attendance.';

comment on column public.squad_attendance_records.left_early_minute is
  'Optional non-negative Training minute when the Player left early.';

comment on column public.squad_attendance_records.actual_absence_reason is
  'Canonical actual attendance reason used for absent and left-early outcomes.';

commit;
