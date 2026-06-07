create or replace function public.submit_conway_bracket(room_slug text, picks jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  user_email text;
  bracket_id uuid;
begin
  select * into target_room from public.rooms where slug = room_slug;

  if target_room.id is null then
    raise exception 'Room not found';
  end if;

  if target_room.auth_mode <> 'email_otp' then
    raise exception 'Room does not use email OTP';
  end if;

  if now() >= target_room.lock_at then
    raise exception 'Bracket is locked';
  end if;

  user_email := lower(auth.jwt() ->> 'email');

  if auth.uid() is null or user_email is null then
    raise exception 'Email verification required';
  end if;

  if target_room.email_domain is null or split_part(user_email, '@', 2) <> target_room.email_domain then
    raise exception 'Email domain is not allowed';
  end if;

  if exists (
    select 1
    from public.brackets
    where room_id = target_room.id
      and owner_key = user_email
  ) then
    raise exception 'Submission already exists';
  end if;

  insert into public.brackets (room_id, owner_key, auth_user_id, owner_email, display_name, picks)
  values (
    target_room.id,
    user_email,
    auth.uid(),
    user_email,
    public.display_name_from_email(user_email),
    picks
  )
  returning id into bracket_id;

  return bracket_id;
end;
$$;
