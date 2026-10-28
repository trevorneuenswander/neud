-- Preview-only synthetic identities for migration 065 + hosted auth tests.
-- No production emails, passwords, or tokens.

-- Fixed UUIDs for repeatable tests
-- owner:     11111111-1111-1111-1111-111111111111
-- admin_a:   22222222-2222-2222-2222-222222222222  (Team Admin A)
-- admin_b:   33333333-3333-3333-3333-333333333333  (Team Admin B)
-- member:    44444444-4444-4444-4444-444444444444
-- outsider:  55555555-5555-5555-5555-555555555555
-- team_alpha: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- team_other: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- project_ba: cccccccc-cccc-cccc-cccc-cccccccccccc

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner@preview.neud.test', crypt('preview-only', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin-a@preview.neud.test', crypt('preview-only', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin-b@preview.neud.test', crypt('preview-only', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'member@preview.neud.test', crypt('preview-only', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'outsider@preview.neud.test', crypt('preview-only', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

-- profiles.role is platform role (owner|admin|operator|viewer), not team role.
insert into public.profiles (id, full_name, role, email)
values
  ('11111111-1111-1111-1111-111111111111', 'Preview Owner', 'owner', 'owner@preview.neud.test'),
  ('22222222-2222-2222-2222-222222222222', 'Preview Admin A', 'viewer', 'admin-a@preview.neud.test'),
  ('33333333-3333-3333-3333-333333333333', 'Preview Admin B', 'viewer', 'admin-b@preview.neud.test'),
  ('44444444-4444-4444-4444-444444444444', 'Preview Member', 'viewer', 'member@preview.neud.test'),
  ('55555555-5555-5555-5555-555555555555', 'Preview Outsider', 'viewer', 'outsider@preview.neud.test')
on conflict (id) do update set role = excluded.role, email = excluded.email, full_name = excluded.full_name;

insert into public.teams (id, name, slug, is_active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alpha Media Group', 'alpha-media-group', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Other Unrelated Team', 'other-unrelated-team', true)
on conflict (id) do update set name = excluded.name, is_active = true, deleted_at = null;

delete from public.team_memberships
where team_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into public.team_memberships (team_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'member', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'admin', 'active');

insert into public.projects (id, slug, name)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'broad-arrow-like', 'Broad Arrow Like')
on conflict (id) do update set name = excluded.name;

insert into public.project_team_assignments (project_id, team_id)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
on conflict do nothing;

delete from public.displays where project_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
insert into public.displays (project_id, slug, name, enabled, online_viewer_enabled, is_archived)
select 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'display-' || g, 'Display ' || g, true, false, false
from generate_series(1, 10) as g;
