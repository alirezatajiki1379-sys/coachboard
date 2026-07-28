-- CoachBoard training participant source diagnostics
-- Privacy-safe: returns counts and IDs only, no names/contact/medical data.
--
-- Usage in Supabase SQL editor:
-- 1. Replace YOUR_USER_ID with the affected auth.users.id.
-- 2. Optionally replace YOUR_SQUAD_ID and YOUR_EVENT_ID. Leave as null to use active/current scope.

with params as (
  select
    'YOUR_USER_ID'::uuid as user_id,
    nullif('YOUR_SQUAD_ID', 'YOUR_SQUAD_ID')::uuid as squad_id,
    nullif('YOUR_EVENT_ID', 'YOUR_EVENT_ID')::uuid as event_id
),
target_squad as (
  select coalesce(
    (select squad_id from params),
    (select id from public.squads where user_id = (select user_id from params) and is_active = true order by created_at desc limit 1)
  ) as id
),
player_counts as (
  select
    count(*) filter (where archived_at is null and deleted_at is null) as active_player_records,
    count(*) filter (where archived_at is null and deleted_at is null and player_type = 'roster') as active_roster_players,
    count(*) filter (where archived_at is not null and deleted_at is null) as archived_player_records,
    count(*) filter (where deleted_at is not null) as soft_deleted_player_records,
    count(*) filter (where archived_at is null and deleted_at is null and position is not null) as active_players_with_primary_position,
    count(*) filter (where archived_at is null and deleted_at is null and position is null) as active_players_without_primary_position
  from public.squad_players
  where user_id = (select user_id from params)
    and squad_id = (select id from target_squad)
),
candidate_ids as (
  select distinct id
  from public.squad_players
  where user_id = (select user_id from params)
    and squad_id = (select id from target_squad)
    and archived_at is null
    and deleted_at is null
    and (
      player_type = 'roster'
      or (player_type = 'trial' and converted_at is null)
    )
),
future_attendance as (
  select ar.*
  from public.squad_attendance_records ar
  join public.squad_training_events te on te.id = ar.event_id
  where ar.user_id = (select user_id from params)
    and te.user_id = (select user_id from params)
    and te.squad_id = (select id from target_squad)
    and te.deleted_at is null
    and te.status <> 'completed'
    and te.date >= current_date
    and ((select event_id from params) is null or ar.event_id = (select event_id from params))
),
future_attendance_classified as (
  select
    fa.id,
    fa.event_id,
    fa.player_id,
    sp.id as linked_player_id,
    sp.deleted_at,
    sp.archived_at
  from future_attendance fa
  left join public.squad_players sp
    on sp.id = fa.player_id
   and sp.user_id = fa.user_id
),
duplicate_attendance as (
  select event_id, player_id, count(*) as duplicate_count
  from future_attendance
  group by event_id, player_id
  having count(*) > 1
)
select 'target_squad_id' as metric, (select id::text from target_squad) as value
union all
select 'active_player_records', active_player_records::text from player_counts
union all
select 'active_roster_players', active_roster_players::text from player_counts
union all
select 'archived_player_records', archived_player_records::text from player_counts
union all
select 'soft_deleted_player_records', soft_deleted_player_records::text from player_counts
union all
select 'active_players_with_primary_position', active_players_with_primary_position::text from player_counts
union all
select 'active_players_without_primary_position', active_players_without_primary_position::text from player_counts
union all
select 'unique_current_candidate_player_ids', count(*)::text from candidate_ids
union all
select 'future_session_participant_rows', count(*)::text from future_attendance_classified
union all
select 'future_participants_linked_to_active_players', count(*)::text from future_attendance_classified where linked_player_id is not null and deleted_at is null and archived_at is null
union all
select 'future_participants_linked_to_deleted_players', count(*)::text from future_attendance_classified where linked_player_id is not null and deleted_at is not null
union all
select 'future_participants_linked_to_archived_players', count(*)::text from future_attendance_classified where linked_player_id is not null and archived_at is not null and deleted_at is null
union all
select 'future_participants_with_missing_player_record', count(*)::text from future_attendance_classified where linked_player_id is null
union all
select 'duplicate_future_attendance_player_ids', count(*)::text from duplicate_attendance;
