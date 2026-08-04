-- 034_project_team_assignments.sql

create table if not exists public.project_team_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  assigned_by uuid,
  created_at timestamptz not null default now(),
  unique (project_id, team_id)
);

create index if not exists idx_project_team_assignments_team
  on public.project_team_assignments (team_id);

alter table public.project_team_assignments enable row level security;
