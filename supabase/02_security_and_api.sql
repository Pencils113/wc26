alter table public.rooms enable row level security;
alter table public.brackets enable row level security;
alter table public.matches enable row level security;
alter table public.actual_results enable row level security;
alter table public.results_sync_runs enable row level security;

drop policy if exists "rooms are readable" on public.rooms;
create policy "rooms are readable"
  on public.rooms for select
  using (true);

drop policy if exists "leaderboard brackets are readable" on public.brackets;
create policy "leaderboard brackets are readable"
  on public.brackets for select
  using (true);

drop policy if exists "matches are readable" on public.matches;
create policy "matches are readable"
  on public.matches for select
  using (true);

drop policy if exists "actual results are readable" on public.actual_results;
create policy "actual results are readable"
  on public.actual_results for select
  using (true);

create or replace function public.display_name_from_email(email text)
returns text
language sql
immutable
as $$
  select initcap(regexp_replace(split_part(email, '@', 1), '[._-]+', ' ', 'g'));
$$;

create or replace function public.owner_key_from_name(name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(name), '[[:space:]]+', ' ', 'g'));
$$;

create or replace view public.bracket_submissions
with (security_invoker = true)
as
select
  brackets.id,
  rooms.slug as room_slug,
  brackets.owner_email,
  brackets.display_name,
  brackets.picks,
  brackets.submitted_at,
  brackets.updated_at
from public.brackets
join public.rooms on rooms.id = brackets.room_id;

create or replace function public.submit_conway_bracket(room_slug text, picks jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
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

create or replace function public.submit_password_room_bracket(
  room_slug text,
  room_password text,
  display_name text,
  picks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
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

  if target_room.password_hash is null or crypt(room_password, target_room.password_hash) <> target_room.password_hash then
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

grant execute on function public.submit_conway_bracket(text, jsonb) to authenticated;
grant execute on function public.submit_password_room_bracket(text, text, text, jsonb) to anon, authenticated;
grant select on public.rooms to anon, authenticated;
grant select on public.brackets to anon, authenticated;
grant select on public.matches to anon, authenticated;
grant select on public.actual_results to anon, authenticated;
grant select on public.bracket_submissions to anon, authenticated;
revoke insert, update, delete on public.brackets from anon, authenticated;
