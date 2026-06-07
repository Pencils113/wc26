update public.rooms
set
  auth_mode = 'room_password',
  email_domain = null,
  password_hash = null
where slug in ('conway', 'larooch');

create or replace function public.submit_password_room_bracket(
  room_slug text,
  room_password text,
  display_name text,
  picks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  normalized_name text;
  bracket_id uuid;
begin
  select * into target_room from public.rooms where slug = room_slug;

  if target_room.id is null then
    raise exception 'Room not found';
  end if;

  if target_room.auth_mode <> 'room_password' then
    raise exception 'Room does not use a room password';
  end if;

  if now() >= target_room.lock_at then
    raise exception 'Bracket is locked';
  end if;

  if lower(trim(coalesce(room_password, ''))) <> target_room.slug then
    raise exception 'Bad room password';
  end if;

  normalized_name := public.owner_key_from_name(display_name);

  if normalized_name is null or normalized_name = '' then
    raise exception 'Name required';
  end if;

  if exists (
    select 1
    from public.brackets
    where room_id = target_room.id
      and owner_key = normalized_name
  ) then
    raise exception 'Submission already exists';
  end if;

  insert into public.brackets (room_id, owner_key, display_name, picks)
  values (target_room.id, normalized_name, trim(display_name), picks)
  returning id into bracket_id;

  return bracket_id;
end;
$$;

grant execute on function public.submit_password_room_bracket(text, text, text, jsonb) to anon, authenticated;
