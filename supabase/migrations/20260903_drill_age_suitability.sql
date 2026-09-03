alter table public.drills
add column if not exists age_mode text not null default 'all_ages';

alter table public.drills
add column if not exists minimum_age integer;

alter table public.drills
add column if not exists maximum_age integer;

update public.drills
set age_mode = case
    when age_mode = 'custom_range' then 'custom_range'
    when age_groups is null or array_length(age_groups, 1) is null then 'all_ages'
    when array_length(age_groups, 1) = 0 then 'all_ages'
    when array_length(age_groups, 1) = 1 and lower(age_groups[1]) = 'custom' then 'all_ages'
    else 'preset'
  end,
  minimum_age = case when age_mode <> 'custom_range' then null else minimum_age end,
  maximum_age = case when age_mode <> 'custom_range' then null else maximum_age end
where
  coalesce(age_mode, '') = ''
  or age_mode = 'all_ages'
  or age_mode is null;

update public.drills
set age_mode = 'preset'
where age_groups is not null
and age_mode = 'all_ages'
and array_length(age_groups, 1) > 0
and not (array_length(age_groups, 1) = 1 and lower(age_groups[1]) = 'custom');

update public.drills
set age_mode = 'all_ages'
where age_mode not in ('all_ages', 'preset', 'custom_range')
or age_mode is null;

update public.drills
set minimum_age = null,
    maximum_age = null
where age_mode <> 'custom_range';

update public.drills
set age_mode = 'all_ages',
    minimum_age = null,
    maximum_age = null
where age_mode = 'custom_range'
and minimum_age is null
and maximum_age is null;

alter table public.drills
alter column age_mode set default 'all_ages';

alter table public.drills
alter column age_mode set not null;

alter table public.drills
drop constraint if exists drills_age_mode_check;

alter table public.drills
add constraint drills_age_mode_check
check (age_mode in ('all_ages', 'preset', 'custom_range'));

alter table public.drills
drop constraint if exists drills_minimum_age_check;

alter table public.drills
add constraint drills_minimum_age_check
check (minimum_age is null or minimum_age between 3 and 99);

alter table public.drills
drop constraint if exists drills_maximum_age_check;

alter table public.drills
add constraint drills_maximum_age_check
check (maximum_age is null or maximum_age between 3 and 99);

alter table public.drills
drop constraint if exists drills_custom_age_range_check;

alter table public.drills
add constraint drills_custom_age_range_check
check (
  age_mode <> 'custom_range'
  or (
    (minimum_age is not null or maximum_age is not null)
    and (minimum_age is null or maximum_age is null or minimum_age <= maximum_age)
  )
);
