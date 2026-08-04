-- =============================================================================
-- Profile contact fields and company -> team rename
-- =============================================================================

alter table public.profiles
  add column if not exists email text,
  add column if not exists phone_number text;

alter table public.profiles
  rename column company to team;

comment on column public.profiles.email is
  'Profile contact email copied from auth.users on signup; may differ from login email if changed separately.';
comment on column public.profiles.phone_number is
  'Optional contact phone number stored as text.';
comment on column public.profiles.team is
  'Optional team label for the user profile (not normalized team membership).';

-- Backfill profile emails from auth.users where missing.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or btrim(p.email) = '');

-- Create profile rows for auth users that do not yet have one.
insert into public.profiles (id, full_name, email, team, role)
select
  u.id,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  u.email,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'company', u.raw_user_meta_data ->> 'team', '')), ''),
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'role'), ''),
    'viewer'
  )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Auto-create profile rows for new auth users.
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, team, role)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'company', new.raw_user_meta_data ->> 'team', '')), ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'role'), ''),
      'viewer'
    )
  )
  on conflict (id) do update
  set
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    team = coalesce(public.profiles.team, excluded.team),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_profile();

-- Keep profile email in sync when auth email changes, unless profile email was set manually.
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set
      email = new.email,
      updated_at = now()
    where id = new.id
      and (email is null or email = old.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated_profile on auth.users;
create trigger on_auth_user_email_updated_profile
  after update of email on auth.users
  for each row execute function public.sync_profile_email_from_auth();

-- Users may update their own non-privileged profile fields.
create policy "Users can update own profile contact fields"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- Update directory functions to use team and profile email.
create or replace function public.get_platform_users_directory()
returns table (
  id uuid,
  full_name text,
  team text,
  role text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  assigned_project_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.team,
    p.role,
    coalesce(p.email, u.email),
    p.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until,
    (
      select count(*)::bigint
      from public.project_members pm
      where pm.user_id = p.id
    ) as assigned_project_count
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_platform_admin()
  order by coalesce(p.full_name, coalesce(p.email, u.email)) asc;
$$;

create or replace function public.get_project_members_directory(p_project_id uuid)
returns table (
  project_id uuid,
  user_id uuid,
  access_level text,
  assigned_by uuid,
  created_at timestamptz,
  full_name text,
  team text,
  email text,
  role text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    pm.project_id,
    pm.user_id,
    pm.access_level,
    pm.assigned_by,
    pm.created_at,
    p.full_name,
    p.team,
    coalesce(p.email, u.email),
    p.role
  from public.project_members pm
  join public.profiles p on p.id = pm.user_id
  join auth.users u on u.id = pm.user_id
  where pm.project_id = p_project_id
    and (
      public.is_platform_admin()
      or public.is_project_manager(p_project_id)
    )
  order by pm.created_at asc;
$$;

create or replace function public.get_assignable_users_for_project(p_project_id uuid)
returns table (
  id uuid,
  full_name text,
  team text,
  role text,
  email text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.team,
    p.role,
    coalesce(p.email, u.email)
  from public.profiles p
  join auth.users u on u.id = p.id
  where not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p.id
  )
    and (
      public.is_platform_admin()
      or public.is_project_manager(p_project_id)
    )
  order by coalesce(p.full_name, coalesce(p.email, u.email)) asc;
$$;
