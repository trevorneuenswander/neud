-- Minimal cloud auth/entitlement schema for desktop-only runtime (additive)

create table if not exists public.account_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  product_code text not null default 'neud',
  enabled boolean not null default true,
  plan_name text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger account_entitlements_updated_at
  before update on public.account_entitlements
  for each row execute function public.set_updated_at();

create table if not exists public.authorized_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  device_name text,
  platform text,
  app_version text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists public.auth_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.account_entitlements enable row level security;
alter table public.authorized_devices enable row level security;
alter table public.auth_audit_log enable row level security;

create policy "Users can read own entitlement"
  on public.account_entitlements for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can read own authorized devices"
  on public.authorized_devices for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can read own auth audit events"
  on public.auth_audit_log for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.account_entitlements from public;
revoke all on table public.authorized_devices from public;
revoke all on table public.auth_audit_log from public;

grant select on table public.account_entitlements to authenticated;
grant select on table public.authorized_devices to authenticated;
grant select on table public.auth_audit_log to authenticated;

grant all on table public.account_entitlements to service_role;
grant all on table public.authorized_devices to service_role;
grant all on table public.auth_audit_log to service_role;
