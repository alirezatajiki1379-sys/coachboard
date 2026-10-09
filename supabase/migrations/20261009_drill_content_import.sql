-- Drill Content Import foundation.
--
-- This migration stores import history and source provenance only. Uploaded
-- packages remain temporary and imported images continue to use the existing
-- drill-images bucket and drill_graphics records.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.drill_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null
    check (char_length(btrim(name)) between 1 and 160),
  schema_version integer not null default 1
    check (schema_version > 0),
  source_filename text,
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'importing',
        'completed',
        'completed_with_errors',
        'cancelled'
      )
    ),

  total_items integer not null default 0
    check (total_items >= 0),
  imported_count integer not null default 0
    check (imported_count >= 0),
  skipped_count integer not null default 0
    check (skipped_count >= 0),
  failed_count integer not null default 0
    check (failed_count >= 0),

  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint drill_import_batches_processed_count_check
    check (imported_count + skipped_count + failed_count <= total_items)
);

alter table public.drills
add column if not exists import_batch_id uuid;

alter table public.drills
add column if not exists import_external_id text;

alter table public.drills
add column if not exists source_title text;

alter table public.drills
add column if not exists source_publisher text;

alter table public.drills
add column if not exists source_page text;

alter table public.drills
add column if not exists source_reference text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'drills_import_batch_id_fkey'
      and conrelid = 'public.drills'::regclass
  ) then
    alter table public.drills
    add constraint drills_import_batch_id_fkey
    foreign key (import_batch_id)
    references public.drill_import_batches(id)
    on delete set null;
  end if;
end;
$$;

create table if not exists public.drill_import_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.drill_import_batches(id) on delete cascade,

  item_index integer not null
    check (item_index >= 0),
  external_id text,
  title text not null
    check (char_length(btrim(title)) between 1 and 240),
  requested_action text not null default 'import'
    check (requested_action in ('import', 'import_anyway', 'update', 'skip')),
  status text not null default 'pending'
    check (status in ('pending', 'imported', 'skipped', 'failed')),

  matched_drill_id uuid references public.drills(id) on delete set null,
  drill_id uuid references public.drills(id) on delete set null,
  source_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_json) = 'object'),
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (batch_id, item_index)
);

create index if not exists drill_import_batches_user_created_at_idx
on public.drill_import_batches (user_id, created_at desc);

create index if not exists drill_import_batches_user_status_idx
on public.drill_import_batches (user_id, status);

create index if not exists drill_import_items_batch_status_index_idx
on public.drill_import_items (batch_id, status, item_index);

create index if not exists drill_import_items_user_external_id_idx
on public.drill_import_items (user_id, external_id)
where external_id is not null;

create index if not exists drills_user_import_batch_idx
on public.drills (user_id, import_batch_id)
where import_batch_id is not null;

create index if not exists drills_user_import_external_id_idx
on public.drills (user_id, import_external_id)
where import_external_id is not null;

create index if not exists drills_user_source_reference_idx
on public.drills (user_id, source_title, source_page)
where source_title is not null;

drop trigger if exists set_drill_import_batches_updated_at
on public.drill_import_batches;

create trigger set_drill_import_batches_updated_at
before update on public.drill_import_batches
for each row execute function public.set_updated_at();

drop trigger if exists set_drill_import_items_updated_at
on public.drill_import_items;

create trigger set_drill_import_items_updated_at
before update on public.drill_import_items
for each row execute function public.set_updated_at();

alter table public.drill_import_batches enable row level security;
alter table public.drill_import_items enable row level security;

drop policy if exists "drill import batches are owned by the user"
on public.drill_import_batches;

create policy "drill import batches are owned by the user"
on public.drill_import_batches
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

drop policy if exists "drill import items are owned by the user"
on public.drill_import_items;

create policy "drill import items are owned by the user"
on public.drill_import_items
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.drill_import_batches
    where drill_import_batches.id = drill_import_items.batch_id
      and drill_import_batches.user_id = auth.uid()
  )
  and (
    matched_drill_id is null
    or exists (
      select 1
      from public.drills
      where drills.id = drill_import_items.matched_drill_id
        and drills.user_id = auth.uid()
    )
  )
  and (
    drill_id is null
    or exists (
      select 1
      from public.drills
      where drills.id = drill_import_items.drill_id
        and drills.user_id = auth.uid()
    )
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.drill_import_batches
    where drill_import_batches.id = drill_import_items.batch_id
      and drill_import_batches.user_id = auth.uid()
  )
  and (
    matched_drill_id is null
    or exists (
      select 1
      from public.drills
      where drills.id = drill_import_items.matched_drill_id
        and drills.user_id = auth.uid()
    )
  )
  and (
    drill_id is null
    or exists (
      select 1
      from public.drills
      where drills.id = drill_import_items.drill_id
        and drills.user_id = auth.uid()
    )
  )
);

comment on table public.drill_import_batches is
  'User-owned history and aggregate outcome for reviewed Drill import packages.';

comment on table public.drill_import_items is
  'Per-item audit outcome for a Drill import batch; package files are not retained here.';

comment on column public.drills.import_external_id is
  'Source-provided stable identifier used for duplicate review; intentionally not globally unique.';

comment on column public.drills.source_reference is
  'Optional human-readable source reference retained for provenance.';
