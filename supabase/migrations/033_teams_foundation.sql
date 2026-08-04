-- 033_teams_foundation.sql
-- First-class cloud teams and memberships.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_teams_slug_unique
  on public.teams (lower(slug))
  where deleted_at is null;

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists idx_team_memberships_user on public.team_memberships (user_id);
create index if not exists idx_team_memberships_team on public.team_memberships (team_id);

alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'owner'
  );
$$;

create or replace function public.is_team_admin(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = p_team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'admin')
    );
$$;

revoke all on function public.is_platform_owner() from public;
revoke execute on function public.is_platform_owner() from anon;
revoke execute on function public.is_platform_owner() from service_role;
grant execute on function public.is_platform_owner() to authenticated;

revoke all on function public.is_team_admin(uuid) from public;
revoke execute on function public.is_team_admin(uuid) from anon;
revoke execute on function public.is_team_admin(uuid) from service_role;
grant execute on function public.is_team_admin(uuid) to authenticated;
