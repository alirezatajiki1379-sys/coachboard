alter table public.coach_attention_states
add column if not exists target_kind text not null default 'player',
add column if not exists target_id uuid;

alter table public.coach_attention_states
alter column player_id drop not null;

update public.coach_attention_states
set target_kind = coalesce(target_kind, 'player'),
    target_id = coalesce(target_id, player_id)
where target_id is null;

alter table public.coach_attention_states
drop constraint if exists coach_attention_states_target_kind_check;

alter table public.coach_attention_states
add constraint coach_attention_states_target_kind_check
check (target_kind in ('player', 'training'));

drop policy if exists "coach attention states are owned by the user"
on public.coach_attention_states;

create policy "coach attention states are owned by the user"
on public.coach_attention_states
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and (
    (
      coach_attention_states.target_kind = 'player'
      and coach_attention_states.player_id is not null
      and exists (
        select 1
        from public.squad_players
        where squad_players.id = coach_attention_states.player_id
        and squad_players.user_id = auth.uid()
      )
    )
    or (
      coach_attention_states.target_kind = 'training'
      and coach_attention_states.target_id is not null
      and exists (
        select 1
        from public.squad_training_events
        where squad_training_events.id = coach_attention_states.target_id
        and squad_training_events.user_id = auth.uid()
      )
    )
  )
);
