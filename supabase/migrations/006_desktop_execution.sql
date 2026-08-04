-- Desktop execution metadata (Phase 1 additive migration)

create table if not exists public.desktop_hosts (
  id uuid primary key,
  display_name text not null,
  hostname text not null,
  platform text not null,
  app_version text,
  last_seen_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger desktop_hosts_updated_at
  before update on public.desktop_hosts
  for each row execute function public.set_updated_at();

alter table public.data_engines
  add column if not exists execution_mode text not null default 'remote-worker';

alter table public.data_engines
  drop constraint if exists data_engines_execution_mode_check;

alter table public.data_engines
  add constraint data_engines_execution_mode_check
  check (execution_mode in ('remote-worker', 'local-desktop'));

alter table public.data_engine_status
  add column if not exists execution_host_id uuid references public.desktop_hosts (id);

alter table public.data_engine_status
  add column if not exists lease_token text;

alter table public.data_engine_status
  add column if not exists lease_expires_at timestamptz;

alter table public.desktop_hosts enable row level security;

create policy "Authenticated users can read desktop hosts"
  on public.desktop_hosts for select
  to authenticated
  using (true);

revoke all on table public.desktop_hosts from public;
grant select on table public.desktop_hosts to authenticated;
grant all on table public.desktop_hosts to service_role;
