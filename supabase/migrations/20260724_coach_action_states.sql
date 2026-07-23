alter table public.coach_attention_states
add column if not exists dismissal_reason text,
add column if not exists resolved_at timestamptz;

alter table public.coach_attention_states
drop constraint if exists coach_attention_states_dismissal_reason_check;

alter table public.coach_attention_states
add constraint coach_attention_states_dismissal_reason_check
check (
  dismissal_reason is null
  or dismissal_reason in ('dismissed', 'not_relevant')
);
