insert into public.actual_results (id)
values (1)
on conflict (id) do nothing;

insert into public.rooms (slug, name, description, auth_mode, email_domain, lock_at)
values (
  'conway',
  'Conway',
  'One verified @conway.ai bracket per person.',
  'email_otp',
  'conway.ai',
  '2026-06-11T18:00:00Z'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  auth_mode = excluded.auth_mode,
  email_domain = excluded.email_domain,
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
