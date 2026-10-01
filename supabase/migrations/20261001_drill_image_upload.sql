-- Drill image upload support.
-- Keeps the existing CoachBoard editor canvas and an optional uploaded image
-- independently, with one language-independent active visual source.

alter table public.drill_graphics
add column if not exists visual_source text not null default 'editor';

alter table public.drill_graphics
add column if not exists uploaded_image_path text;

alter table public.drill_graphics
add column if not exists uploaded_image_mime_type text;

alter table public.drill_graphics
add column if not exists uploaded_image_size_bytes bigint;

update public.drill_graphics
set visual_source = 'editor'
where visual_source is null
   or visual_source not in ('editor', 'upload');

update public.drill_graphics
set
  uploaded_image_path = null,
  uploaded_image_mime_type = null,
  uploaded_image_size_bytes = null,
  visual_source = 'editor'
where uploaded_image_path is null
  and (
    uploaded_image_mime_type is not null
    or uploaded_image_size_bytes is not null
    or visual_source = 'upload'
  );

alter table public.drill_graphics
drop constraint if exists drill_graphics_visual_source_check;

alter table public.drill_graphics
add constraint drill_graphics_visual_source_check
check (visual_source in ('editor', 'upload'));

alter table public.drill_graphics
drop constraint if exists drill_graphics_uploaded_image_metadata_check;

alter table public.drill_graphics
add constraint drill_graphics_uploaded_image_metadata_check
check (
  (
    uploaded_image_path is null
    and uploaded_image_mime_type is null
    and uploaded_image_size_bytes is null
    and visual_source <> 'upload'
  )
  or
  (
    uploaded_image_path is not null
    and uploaded_image_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and uploaded_image_size_bytes between 1 and 10485760
    and uploaded_image_path like user_id::text || '/' || drill_id::text || '/%'
  )
);

comment on column public.drill_graphics.visual_source is
'Active Drill visual. editor uses canvas_json; upload uses uploaded_image_path.';

comment on column public.drill_graphics.uploaded_image_path is
'Private Supabase Storage object path in the drill-images bucket.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'drill-images',
  'drill-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users can read own drill images"
on storage.objects;

create policy "users can read own drill images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users can upload own drill images"
on storage.objects;

create policy "users can upload own drill images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.drills
    where drills.id::text = (storage.foldername(name))[2]
      and drills.user_id = auth.uid()
  )
);

drop policy if exists "users can update own drill images"
on storage.objects;

create policy "users can update own drill images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.drills
    where drills.id::text = (storage.foldername(name))[2]
      and drills.user_id = auth.uid()
  )
);

drop policy if exists "users can delete own drill images"
on storage.objects;

create policy "users can delete own drill images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
