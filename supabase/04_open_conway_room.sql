set search_path = public, extensions;

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
