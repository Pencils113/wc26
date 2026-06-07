create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  auth_mode text not null check (auth_mode in ('email_otp', 'room_password')),
  email_domain text,
  password_hash text,
  lock_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.brackets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  owner_key text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  owner_email text,
  display_name text not null,
  picks jsonb not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, owner_key)
);

create table if not exists public.matches (
  id text primary key,
  stage text not null,
  home_team_id text,
  away_team_id text,
  home_score integer,
  away_score integer,
  winner_team_id text,
  starts_at timestamptz,
  status text not null default 'scheduled',
  raw jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.actual_results (
  id integer primary key default 1 check (id = 1),
  group_order jsonb not null default '{}',
  third_place_advancers text[] not null default '{}',
  knockout_winners jsonb not null default '{}',
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

create table if not exists public.results_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

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

insert into public.actual_results (id)
values (1)
on conflict (id) do nothing;

insert into public.rooms (slug, name, description, auth_mode, password_hash, lock_at)
values (
  'conway',
  'Conway',
  'Company prediction room.',
  'room_password',
  crypt('conway', gen_salt('bf')),
  '2026-06-11T18:00:00Z'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  auth_mode = excluded.auth_mode,
  email_domain = null,
  password_hash = excluded.password_hash,
  lock_at = excluded.lock_at;

insert into public.rooms (slug, name, description, auth_mode, password_hash, lock_at)
values (
  'larooch',
  'Larooch',
  'Family bracket room.',
  'room_password',
  crypt('larooch', gen_salt('bf')),
  '2026-06-11T18:00:00Z'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  auth_mode = excluded.auth_mode,
  password_hash = excluded.password_hash,
  lock_at = excluded.lock_at;

do $$
begin
  alter publication supabase_realtime add table public.brackets;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.actual_results;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
