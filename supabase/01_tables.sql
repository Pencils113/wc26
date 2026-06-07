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
