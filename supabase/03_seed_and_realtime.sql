set search_path = public, extensions;

insert into public.actual_results (id)
values (1)
on conflict (id) do nothing;

insert into public.rooms (slug, name, description, auth_mode, lock_at)
values (
  'conway',
  'Conway',
  'Company prediction room.',
  'room_password',
  '2026-06-11T18:00:00Z'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  auth_mode = excluded.auth_mode,
  email_domain = null,
  password_hash = null,
  lock_at = excluded.lock_at;

insert into public.rooms (slug, name, description, auth_mode, lock_at)
values (
  'larooch',
  'Larooch',
  'Family bracket room.',
  'room_password',
  '2026-06-11T18:00:00Z'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  auth_mode = excluded.auth_mode,
  password_hash = null,
  lock_at = excluded.lock_at;

insert into public.rooms (slug, name, description, auth_mode, lock_at)
values (
  'sixseven',
  'Purdue Gooners',
  'Purdue Gooners prediction room.',
  'room_password',
  '2026-06-11T18:00:00Z'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  auth_mode = excluded.auth_mode,
  email_domain = null,
  password_hash = null,
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

do $$
begin
  alter publication supabase_realtime add table public.matches;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
