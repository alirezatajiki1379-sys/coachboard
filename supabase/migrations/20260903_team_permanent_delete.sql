create or replace function public.delete_squad_permanently(
  target_squad_id uuid,
  confirmation_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requesting_user uuid := auth.uid();
  team_record public.squads%rowtype;
  fallback_team_id uuid;
  event_ids uuid[] := '{}'::uuid[];
  player_ids uuid[] := '{}'::uuid[];
begin
  if requesting_user is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into team_record
  from public.squads
  where id = target_squad_id
  and user_id = requesting_user;

  if not found then
    raise exception 'Team not found';
  end if;

  if confirmation_name is distinct from team_record.name then
    raise exception 'Team name confirmation does not match';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
  into event_ids
  from public.squad_training_events
  where user_id = requesting_user
  and squad_id = target_squad_id;

  select coalesce(array_agg(id), '{}'::uuid[])
  into player_ids
  from public.squad_players
  where user_id = requesting_user
  and squad_id = target_squad_id;

  delete from public.coach_attention_states
  where user_id = requesting_user
  and (
    (target_kind = 'training' and target_id = any(event_ids))
    or (target_kind = 'player' and target_id = any(player_ids))
    or player_id = any(player_ids)
  );

  update public.player_import_rows
  set player_id = case when player_id = any(player_ids) then null else player_id end,
      matched_player_id = case when matched_player_id = any(player_ids) then null else matched_player_id end
  where user_id = requesting_user
  and (
    player_id = any(player_ids)
    or matched_player_id = any(player_ids)
  );

  delete from public.squad_training_events
  where user_id = requesting_user
  and squad_id = target_squad_id;

  delete from public.training_recurrence_series
  where user_id = requesting_user
  and squad_id = target_squad_id;

  delete from public.squad_players
  where user_id = requesting_user
  and squad_id = target_squad_id;

  delete from public.squads
  where id = target_squad_id
  and user_id = requesting_user;

  select id
  into fallback_team_id
  from public.squads
  where user_id = requesting_user
  and archived_at is null
  order by is_active desc, updated_at desc, created_at asc
  limit 1;

  if team_record.is_active then
    update public.squads
    set is_active = false
    where user_id = requesting_user;

    if fallback_team_id is not null then
      update public.squads
      set is_active = true
      where id = fallback_team_id
      and user_id = requesting_user;
    end if;
  end if;

  return fallback_team_id;
end;
$$;

revoke all on function public.delete_squad_permanently(uuid, text) from public;
grant execute on function public.delete_squad_permanently(uuid, text) to authenticated;
