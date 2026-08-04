-- Track which worker claimed a command for stale-command recovery.

alter table public.data_engine_commands
  add column if not exists claimed_by_worker_id text;

create index if not exists data_engine_commands_processing_idx
  on public.data_engine_commands (engine_id, status, processing_started_at)
  where status = 'processing';

create or replace function public.claim_data_engine_command(
  p_engine_id uuid,
  p_worker_id text default null
)
returns table (
  command_id bigint,
  command text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.data_engine_commands%rowtype;
begin
  select *
  into v_row
  from public.data_engine_commands
  where engine_id = p_engine_id
    and status = 'pending'
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.data_engine_commands
  set
    status = 'processing',
    processing_started_at = now(),
    claimed_by_worker_id = p_worker_id
  where id = v_row.id;

  command_id := v_row.id;
  command := v_row.command;
  return next;
end;
$$;

revoke all on function public.claim_data_engine_command(uuid, text) from public;
grant execute on function public.claim_data_engine_command(uuid, text) to service_role;

create or replace function public.fail_stale_data_engine_command(
  p_command_id bigint,
  p_stale_after_ms integer default 600000
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.data_engine_commands%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Unauthorized.';
  end if;

  select *
  into v_row
  from public.data_engine_commands
  where id = p_command_id;

  if not found then
    return false;
  end if;

  if v_row.status <> 'processing'
    or v_row.processing_started_at is null
    or v_row.processing_started_at > now() - make_interval(secs => greatest(p_stale_after_ms, 60000) / 1000.0) then
    return false;
  end if;

  update public.data_engine_commands
  set
    status = 'failed',
    processed_at = now(),
    error_message = 'Marked failed by platform administrator.'
  where id = p_command_id;

  return true;
end;
$$;

revoke all on function public.fail_stale_data_engine_command(bigint, integer) from public;
grant execute on function public.fail_stale_data_engine_command(bigint, integer) to authenticated;
