alter table public.regional_calendar_events
drop constraint if exists regional_calendar_events_category_check;

delete from public.regional_calendar_events legacy
using public.regional_calendar_events canonical
where legacy.category in ('public_holiday', 'school_holiday', 'movable_holiday', 'local_customary_day')
  and canonical.country_code = legacy.country_code
  and canonical.federal_state_code is not distinct from legacy.federal_state_code
  and canonical.name = legacy.name
  and canonical.starts_on = legacy.starts_on
  and canonical.ends_on = legacy.ends_on
  and canonical.category = case legacy.category
    when 'public_holiday' then 'statutory_public_holiday'
    when 'school_holiday' then 'official_school_holiday'
    when 'movable_holiday' then 'movable_school_holiday'
    when 'local_customary_day' then 'local_school_free_day'
  end;

update public.regional_calendar_events
set category = case category
  when 'public_holiday' then 'statutory_public_holiday'
  when 'school_holiday' then 'official_school_holiday'
  when 'movable_holiday' then 'movable_school_holiday'
  when 'local_customary_day' then 'local_school_free_day'
  else category
end
where category in ('public_holiday', 'school_holiday', 'movable_holiday', 'local_customary_day');

alter table public.regional_calendar_events
add constraint regional_calendar_events_category_check
check (category in ('statutory_public_holiday', 'official_school_holiday', 'movable_school_holiday', 'local_school_free_day'));

alter table public.team_calendar_exclusions
drop constraint if exists team_calendar_exclusions_category_check;

update public.team_calendar_exclusions
set category = case category
  when 'movable_holiday' then 'movable_school_holiday'
  when 'local_customary_day' then 'local_school_free_day'
  else category
end
where category in ('movable_holiday', 'local_customary_day');

alter table public.team_calendar_exclusions
add constraint team_calendar_exclusions_category_check
check (category in ('movable_school_holiday', 'local_school_free_day', 'team_custom_exclusion'));

insert into public.regional_calendar_events (
  country_code,
  federal_state_code,
  name,
  category,
  starts_on,
  ends_on,
  source,
  source_version,
  verified_at
)
values
  ('DE', 'DE-NW', 'Autumn holidays', 'official_school_holiday', '2026-10-17', '2026-10-31', 'NRW official school holiday data', '2026/27', now()),
  ('DE', 'DE-NW', 'Christmas holidays', 'official_school_holiday', '2026-12-23', '2027-01-06', 'NRW official school holiday data', '2026/27', now()),
  ('DE', 'DE-NW', 'Easter holidays', 'official_school_holiday', '2027-03-22', '2027-04-03', 'NRW official school holiday data', '2026/27', now()),
  ('DE', 'DE-NW', 'Additional school-free day', 'official_school_holiday', '2027-05-18', '2027-05-18', 'NRW official school holiday data', '2026/27', now()),
  ('DE', 'DE-NW', 'Summer holidays', 'official_school_holiday', '2027-07-19', '2027-08-31', 'NRW official school holiday data', '2026/27', now())
on conflict (country_code, federal_state_code, name, category, starts_on, ends_on)
do update set
  source = excluded.source,
  source_version = excluded.source_version,
  verified_at = excluded.verified_at,
  updated_at = now();
