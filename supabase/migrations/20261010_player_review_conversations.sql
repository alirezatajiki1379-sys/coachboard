-- CoachBoard Player Report 2.0 data foundation.
-- Apply this migration before deploying dependent Player Conversation or Player Notes code.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.player_review_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,

  report_type text not null default 'player_conversation',
  period_start date not null,
  period_end date not null,
  title text,
  strengths text,
  development_focus text,
  player_perspective text,
  agreed_next_steps text,
  next_review_on date,
  section_options jsonb not null default '{}'::jsonb,
  content_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  finalized_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_review_conversations_report_type_check
    check (report_type in ('player_conversation', 'internal_coach_report')),
  constraint player_review_conversations_status_check
    check (status in ('draft', 'finalized')),
  constraint player_review_conversations_period_check
    check (period_end >= period_start)
);

create table if not exists public.player_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,

  note text not null,
  note_date date not null default current_date,
  visibility text not null default 'internal',
  pinned boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_notes_note_check
    check (btrim(note) <> ''),
  constraint player_notes_visibility_check
    check (visibility in ('internal', 'conversation_eligible'))
);

create table if not exists public.player_review_conversation_notes (
  conversation_id uuid not null
    references public.player_review_conversations(id)
    on delete cascade,
  note_id uuid not null
    references public.player_notes(id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  created_at timestamptz not null default now(),

  primary key (conversation_id, note_id)
);

create index if not exists player_review_conversations_player_period_idx
on public.player_review_conversations (
  user_id,
  player_id,
  period_start desc,
  period_end desc
);

create index if not exists player_review_conversations_squad_status_idx
on public.player_review_conversations (
  user_id,
  squad_id,
  status,
  updated_at desc
);

create index if not exists player_notes_player_date_idx
on public.player_notes (
  user_id,
  player_id,
  pinned desc,
  note_date desc,
  created_at desc
);

create index if not exists player_notes_conversation_eligible_idx
on public.player_notes (
  user_id,
  player_id,
  note_date desc
)
where visibility = 'conversation_eligible';

create index if not exists player_review_conversation_notes_note_idx
on public.player_review_conversation_notes (note_id);

drop trigger if exists set_player_review_conversations_updated_at
on public.player_review_conversations;

create trigger set_player_review_conversations_updated_at
before update on public.player_review_conversations
for each row
execute function public.set_updated_at();

drop trigger if exists set_player_notes_updated_at
on public.player_notes;

create trigger set_player_notes_updated_at
before update on public.player_notes
for each row
execute function public.set_updated_at();

alter table public.player_review_conversations enable row level security;
alter table public.player_notes enable row level security;
alter table public.player_review_conversation_notes enable row level security;

drop policy if exists "player review conversations are owned by the user"
on public.player_review_conversations;

create policy "player review conversations are owned by the user"
on public.player_review_conversations
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_review_conversations.player_id
      and squad_players.user_id = auth.uid()
      and squad_players.squad_id = player_review_conversations.squad_id
  )
  and exists (
    select 1
    from public.squads
    where squads.id = player_review_conversations.squad_id
      and squads.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_review_conversations.player_id
      and squad_players.user_id = auth.uid()
      and squad_players.squad_id = player_review_conversations.squad_id
  )
  and exists (
    select 1
    from public.squads
    where squads.id = player_review_conversations.squad_id
      and squads.user_id = auth.uid()
  )
);

drop policy if exists "player notes are owned by the user"
on public.player_notes;

create policy "player notes are owned by the user"
on public.player_notes
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_notes.player_id
      and squad_players.user_id = auth.uid()
      and squad_players.squad_id = player_notes.squad_id
  )
  and exists (
    select 1
    from public.squads
    where squads.id = player_notes.squad_id
      and squads.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_notes.player_id
      and squad_players.user_id = auth.uid()
      and squad_players.squad_id = player_notes.squad_id
  )
  and exists (
    select 1
    from public.squads
    where squads.id = player_notes.squad_id
      and squads.user_id = auth.uid()
  )
);

drop policy if exists "player review conversation notes are owned by the user"
on public.player_review_conversation_notes;

create policy "player review conversation notes are owned by the user"
on public.player_review_conversation_notes
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.player_review_conversations conversation
    join public.player_notes note
      on note.id = player_review_conversation_notes.note_id
    where conversation.id = player_review_conversation_notes.conversation_id
      and conversation.user_id = auth.uid()
      and note.user_id = auth.uid()
      and note.player_id = conversation.player_id
      and note.squad_id = conversation.squad_id
      and note.visibility = 'conversation_eligible'
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.player_review_conversations conversation
    join public.player_notes note
      on note.id = player_review_conversation_notes.note_id
    where conversation.id = player_review_conversation_notes.conversation_id
      and conversation.user_id = auth.uid()
      and note.user_id = auth.uid()
      and note.player_id = conversation.player_id
      and note.squad_id = conversation.squad_id
      and note.visibility = 'conversation_eligible'
  )
);
