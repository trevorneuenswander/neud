-- Secure password reset tokens (hashed, single-use, expiring)

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  request_ip_hash text,
  constraint password_reset_tokens_token_hash_key unique (token_hash)
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id);

create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);

create index if not exists password_reset_tokens_used_at_idx
  on public.password_reset_tokens (used_at)
  where used_at is null;

alter table public.password_reset_tokens enable row level security;

revoke all on table public.password_reset_tokens from public;
grant all on table public.password_reset_tokens to service_role;
