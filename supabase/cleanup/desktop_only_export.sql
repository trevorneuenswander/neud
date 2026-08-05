-- WARNING: MANUAL EXECUTION ONLY
-- Export-oriented queries for desktop migration.
-- Run results to CSV/JSON and import with scripts/migrate-from-supabase.mjs

-- Projects
select * from public.projects order by project_number;

-- Webpage scraper engines and related configuration
select e.*, p.slug as project_slug
from public.data_engines e
join public.projects p on p.id = e.project_id
order by p.project_number, e.name;

select s.* from public.webpage_scraper_settings s;
select src.* from public.webpage_scraper_sources src order by engine_id, position;

-- Latest snapshot per engine (optional import)
select distinct on (engine_id)
  engine_id, data, record_count, payload_size_bytes, duration_ms, captured_at
from public.data_engine_snapshots
order by engine_id, captured_at desc;

-- Recent logs (optional import)
select * from public.data_engine_logs
where created_at > now() - interval '30 days'
order by created_at desc;
