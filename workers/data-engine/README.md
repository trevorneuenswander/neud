# Data Engine Worker

Long-running Puppeteer worker for HMG Data Engines. One process typically binds to one `ENGINE_ID`.

## Setup

```bash
cd workers/data-engine
cp .env.example .env
npm install
npm start
```

## Dry run

```bash
DRY_RUN=true npm start
```

## Timeout configuration

| Variable | Default | Range | Purpose |
|----------|---------|-------|---------|
| `PUPPETEER_PROTOCOL_TIMEOUT_MS` | `300000` | 30000–900000 | CDP protocol calls such as `Runtime.callFunctionOn` |
| `PUPPETEER_PAGE_TIMEOUT_MS` | `60000` | 5000–300000 | Default page operation timeout |
| `PUPPETEER_NAVIGATION_TIMEOUT_MS` | `60000` | 5000–300000 | `page.goto`, `reload`, selector waits |
| `COMMAND_STALE_AFTER_MS` | `600000` | 60000–3600000 | Fail abandoned `processing` commands |

These are separate from poll interval and browser launch timeout.

## Command lifecycle

1. Portal inserts a command as `pending`
2. Worker claims it via `claim_data_engine_command()` → `processing`
3. Worker completes work
4. Command becomes `completed` or `failed`

`run_once` stays `processing` until the scrape finishes. A failed scrape marks the command `failed`, not `completed`.

## Stale command recovery

On startup and each loop, the worker fails `processing` commands for this engine when:

- `processing_started_at` is older than `COMMAND_STALE_AFTER_MS`, and
- `claimed_by_worker_id` is null or matches this worker

## Protocol timeout recovery

When Puppeteer raises a protocol timeout, the worker:

1. Logs `browser.protocol_timeout` with the failing step name
2. Marks the command `failed`
3. Closes and clears the browser session
4. Allows the next command to launch a fresh browser

## Manual recovery (Supabase SQL)

If a command remains stuck in `processing`:

```sql
update public.data_engine_commands
set
  status = 'failed',
  processed_at = now(),
  error_message = 'Marked failed manually.'
where id = <command_id>
  and status = 'processing';
```

Platform owners/admins can also use **Mark stale command failed** in the portal when a command exceeds the stale threshold.

## Syntax check

```bash
npm run check
```
