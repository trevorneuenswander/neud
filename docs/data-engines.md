# Data Engines

Data Engines are reusable data-collection runtimes attached to a Project. The user-facing term is **Data Engine** (not Worker).

## Generic model

| Table | Purpose |
|-------|---------|
| `data_engines` | Engine identity, type, desired state, config |
| `data_engine_status` | Actual state, health, heartbeat, statistics |
| `data_engine_commands` | Command queue (`start`, `stop`, `restart`, `run_once`) |
| `data_engine_snapshots` | Latest JSON payloads |
| `data_engine_logs` | Bounded operational log |

A Project may contain multiple engines in future phases. The first Webpage Scraper Project receives one default engine.

## Webpage Scraper extension

| Table | Purpose |
|-------|---------|
| `webpage_scraper_settings` | Poll interval, TTL, headless |
| `webpage_scraper_sources` | Source URLs keyed by `source_key` |

## Portal routes

- `/projects/[slug]/data-engines` — engine cards
- `/projects/[slug]/data-engines/[engineId]` — engine detail

## Worker runtime

Long-running Node.js process in `workers/data-engine/`. Uses Supabase service role. Never runs in Vercel.

See [workers.md](./workers.md) and [webpage-scraper.md](./webpage-scraper.md).
