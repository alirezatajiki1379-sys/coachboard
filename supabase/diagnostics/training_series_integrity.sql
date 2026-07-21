-- Read-only diagnostic for recurring Training series integrity.
-- Replace the two values below before running.
--
-- Expected use:
-- 1. Run this query for the affected recurrence_series_id and user_id.
-- 2. Review duplicate active occurrences and missing participant rows.
-- 3. Move safe duplicate Trainings to Trash through the app before adding the unique occurrence index if needed.

with selected_series as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as series_id,
    '00000000-0000-0000-0000-000000000000'::uuid as user_id
),
events as (
  select
    e.id,
    e.date,
    e.start_time,
    e.deleted_at,
    e.status,
    e.recurrence_series_id
  from public.squad_training_events e
  join selected_series s
    on s.series_id = e.recurrence_series_id
   and s.user_id = e.user_id
),
attendance_counts as (
  select
    event_id,
    count(*) as participant_rows,
    count(*) filter (
      where final_status is not null
         or overall_rating is not null
         or rating_technique is not null
         or rating_game_understanding is not null
         or rating_intensity is not null
         or rating_behavior is not null
         or coach_note is not null
    ) as rows_with_coaching_data
  from public.squad_attendance_records
  where event_id in (select id from events)
  group by event_id
),
duplicates as (
  select
    recurrence_series_id,
    date,
    start_time,
    count(*) as active_duplicate_count,
    array_agg(id order by id) as event_ids
  from events
  where deleted_at is null
  group by recurrence_series_id, date, start_time
  having count(*) > 1
)
select
  'summary' as row_type,
  null::date as training_date,
  null::time as start_time,
  count(e.id)::text as detail,
  count(distinct (e.date, e.start_time))::text as unique_date_time_count,
  count(*) filter (where coalesce(a.participant_rows, 0) = 0 and e.deleted_at is null)::text as active_sessions_without_participants,
  count(*) filter (where e.deleted_at is null)::text as active_sessions
from events e
left join attendance_counts a on a.event_id = e.id
union all
select
  'duplicate_active_occurrence' as row_type,
  d.date,
  d.start_time,
  d.active_duplicate_count::text,
  array_to_string(d.event_ids, ', ') as unique_date_time_count,
  null::text,
  null::text
from duplicates d
union all
select
  'missing_participants' as row_type,
  e.date,
  e.start_time,
  e.id::text,
  coalesce(a.participant_rows, 0)::text,
  coalesce(a.rows_with_coaching_data, 0)::text,
  e.status
from events e
left join attendance_counts a on a.event_id = e.id
where e.deleted_at is null
and coalesce(a.participant_rows, 0) = 0
order by row_type, training_date, start_time;
