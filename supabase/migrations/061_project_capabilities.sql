-- =============================================================================
-- NEUD v0.3.0 Pass 21: project_capabilities + modular project_type
-- Additive only. Does not alter prior migrations.
-- Note: create_project_with_capabilities RPC is in 062 (enum commit boundary).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: modular projects created via capability wizard
-- PostgreSQL requires a commit before newly added enum labels can be referenced.
-- -----------------------------------------------------------------------------
alter type public.project_type add value if not exists 'modular';

-- -----------------------------------------------------------------------------
-- project_capabilities
-- -----------------------------------------------------------------------------
create table if not exists public.project_capabilities (
  project_id uuid not null
    references public.projects (id)
    on delete cascade,
  capability text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  primary key (project_id, capability),
  constraint project_capabilities_capability_check
    check (
      capability in (
        'data-source',
        'webpage-scraper',
        'live-chat',
        'scoreboard',
        'timer',
        'lower-thirds',
        'display-only',
        'social-feed',
        'results-leaderboard',
        'rundown-schedule',
        'election-results',
        'weather',
        'statistics',
        'manual-controller',
        'automation-trigger'
      )
    )
);

create index if not exists project_capabilities_capability_idx
  on public.project_capabilities (capability);

alter table public.project_capabilities enable row level security;

drop policy if exists project_capabilities_select on public.project_capabilities;
create policy project_capabilities_select
  on public.project_capabilities
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.can_view_project(project_id)
  );

drop policy if exists project_capabilities_manage on public.project_capabilities;
create policy project_capabilities_manage
  on public.project_capabilities
  for all
  to authenticated
  using (
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.get_project_access_level(project_id) = 'manager'
  )
  with check (
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.get_project_access_level(project_id) = 'manager'
  );

grant select, insert, update, delete on public.project_capabilities to authenticated;

-- -----------------------------------------------------------------------------
-- Seed existing projects from project_type (idempotent)
-- -----------------------------------------------------------------------------
insert into public.project_capabilities (project_id, capability)
select id, 'webpage-scraper'
from public.projects
where project_type::text = 'bag-graphics'
on conflict do nothing;

insert into public.project_capabilities (project_id, capability)
select id, 'manual-controller'
from public.projects
where project_type::text = 'bag-graphics'
on conflict do nothing;

insert into public.project_capabilities (project_id, capability)
select id, 'data-source'
from public.projects
where project_type::text = 'sema-schedule'
on conflict do nothing;

insert into public.project_capabilities (project_id, capability)
select id, 'rundown-schedule'
from public.projects
where project_type::text = 'sema-schedule'
on conflict do nothing;

insert into public.project_capabilities (project_id, capability)
select id, 'manual-controller'
from public.projects
where project_type::text = 'sema-schedule'
on conflict do nothing;

insert into public.project_capabilities (project_id, capability)
select id, 'webpage-scraper'
from public.projects
where project_type::text = 'webpage-scraper'
on conflict do nothing;

insert into public.project_capabilities (project_id, capability)
select id, 'data-source'
from public.projects
where project_type::text in ('json-ingest', 'google-sheet-ingest')
on conflict do nothing;

insert into public.project_capabilities (project_id, capability)
select p.id, 'display-only'
from public.projects p
where p.project_type::text not in (
  'bag-graphics',
  'sema-schedule',
  'webpage-scraper',
  'json-ingest',
  'google-sheet-ingest'
)
and not exists (
  select 1 from public.project_capabilities pc where pc.project_id = p.id
)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.user_is_any_team_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_platform_owner()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role = 'admin'
        and t.deleted_at is null
    );
$$;

create or replace function public.user_administrates_team(p_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_platform_owner()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where tm.user_id = auth.uid()
        and tm.team_id = p_team_id
        and tm.status = 'active'
        and tm.role = 'admin'
        and t.deleted_at is null
    );
$$;

revoke all on function public.user_is_any_team_admin() from public;
revoke all on function public.user_administrates_team(uuid) from public;
grant execute on function public.user_is_any_team_admin() to authenticated;
grant execute on function public.user_administrates_team(uuid) to authenticated;
