-- 035_cloud_invitations.sql

create table if not exists public.cloud_invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  invited_by uuid not null,
  team_id uuid references public.teams (id) on delete set null,
  platform_role text,
  team_role text check (team_role is null or team_role in ('owner', 'admin', 'member')),
  project_assignments jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_by uuid,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cloud_invitations_email
  on public.cloud_invitations (email_normalized, status);

alter table public.cloud_invitations enable row level security;
