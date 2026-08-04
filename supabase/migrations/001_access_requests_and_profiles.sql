-- =============================================================================
-- NEUD: access requests, profiles, and future project access
-- =============================================================================
--
-- Authorization model (two layers):
--
-- 1. Platform roles (profiles.role):
--    - owner: full platform control, access to all projects (future)
--    - admin: platform administration, access to all projects (future)
--    - user:  general portal access only; project access via memberships (future)
--
-- 2. Project memberships (future project_members table):
--    - manager, operator, viewer per graphics project
--    - Newly invited users receive role = 'user' with NO project memberships
--
-- =============================================================================

-- =============================================================================
-- access_requests
-- =============================================================================

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  company text not null,
  comments text,
  status text not null default 'pending',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint access_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

-- One pending request per normalized email address
create unique index access_requests_pending_email_unique
  on public.access_requests (lower(trim(email)))
  where status = 'pending';

-- =============================================================================
-- profiles
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  company text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_role_check
    check (role in ('owner', 'admin', 'user'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Platform admin helper (security definer, used by RLS policies)
-- =============================================================================

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.access_requests enable row level security;
alter table public.profiles enable row level security;

-- profiles: users read own profile
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- profiles: platform admins read all profiles
create policy "Platform admins can read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_platform_admin());

-- access_requests: platform admins read all
create policy "Platform admins can read access requests"
  on public.access_requests for select
  to authenticated
  using (public.is_platform_admin());

-- access_requests: platform admins update (approve/reject)
create policy "Platform admins can update access requests"
  on public.access_requests for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- No INSERT/SELECT/UPDATE policies for anon or ordinary users on access_requests.
-- Public submissions use the server-side service-role client after validation.

-- =============================================================================
-- Future: project_members (not created in this phase)
-- =============================================================================
--
-- Project-specific access will be enforced separately from platform roles.
-- Regular users (profiles.role = 'user') may only access projects where they
-- have a membership record. Owners and platform admins may access all projects.
--
-- create table public.projects (
--   id uuid primary key default gen_random_uuid(),
--   -- project fields added in a future phase
--   created_at timestamptz not null default now()
-- );
--
-- create table public.project_members (
--   project_id uuid not null references public.projects (id) on delete cascade,
--   user_id uuid not null references auth.users (id) on delete cascade,
--   access_level text not null default 'viewer',
--   assigned_by uuid references auth.users (id),
--   created_at timestamptz not null default now(),
--
--   primary key (project_id, user_id),
--
--   constraint project_members_access_level_check
--     check (access_level in ('manager', 'operator', 'viewer'))
-- );
--
-- Future server-side helpers (application code, not yet implemented):
--   requireProjectAccess(projectId)
--   requireProjectRole(projectId, allowedRoles)
--
-- Every project page, query, and Server Action must independently verify
-- project membership on the server. Navigation visibility alone is not
-- authorization.
