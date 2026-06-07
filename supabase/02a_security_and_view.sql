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
