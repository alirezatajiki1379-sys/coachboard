alter table public.training_recurrence_series
add column if not exists creation_token text;

create unique index if not exists regional_calendar_events_identity_unique
on public.regional_calendar_events (
  country_code,
  federal_state_code,
  name,
  category,
  starts_on,
  ends_on
);

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
  ('DE', 'DE-NW', 'Autumn holidays', 'school_holiday', '2026-10-17', '2026-10-31', 'NRW official school holiday data', '2026/27', now()),
  ('DE', 'DE-NW', 'Christmas holidays', 'school_holiday', '2026-12-23', '2027-01-06', 'NRW official school holiday data', '2026/27', now()),
  ('DE', 'DE-NW', 'Easter holidays', 'school_holiday', '2027-03-22', '2027-04-03', 'NRW official school holiday data', '2026/27', now()),
  ('DE', 'DE-NW', 'Additional school-free day', 'school_holiday', '2027-05-18', '2027-05-18', 'NRW official school holiday data', '2026/27', now()),
  ('DE', 'DE-NW', 'Summer holidays', 'school_holiday', '2027-07-19', '2027-08-31', 'NRW official school holiday data', '2026/27', now())
on conflict (country_code, federal_state_code, name, category, starts_on, ends_on)
do update set
  source = excluded.source,
  source_version = excluded.source_version,
  verified_at = excluded.verified_at,
  updated_at = now();

create unique index if not exists training_recurrence_series_user_squad_creation_token_unique
on public.training_recurrence_series (
  user_id,
  squad_id,
  creation_token
)
where creation_token is not null;

-- This final safeguard prevents duplicate active occurrences in a recurrence series.
-- If existing duplicate active occurrences exist, inspect and repair them before running this line.
create unique index if not exists squad_training_events_series_date_time_unique
on public.squad_training_events (
  recurrence_series_id,
  date,
  start_time
)
where recurrence_series_id is not null and deleted_at is null;
