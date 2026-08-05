# Workers

NEUD separates the web portal from long-running Data Engine processes.

## Portal (Vercel)

- Next.js App Router
- Supabase Auth with cookie sessions for operators
- Stores engine configuration, commands, snapshots, and logs
- Does **not** run Puppeteer

## Data Engine worker (outside Vercel)

Location: `workers/data-engine/`

One worker process typically binds to one `ENGINE_ID`.

### Desktop host (Phase 1)

The Electron app in `desktop/` can spawn the same worker locally. See [desktop.md](./desktop.md).

Execution modes:

| Mode | Host |
|------|------|
| `remote-worker` | External Node.js process (default) |
| `local-desktop` | Electron EngineManager on the operator PC |

### Environment

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ENGINE_ID=
WORKER_ID=
BAG_AUCTION_EMAIL=
BAG_AUCTION_PASSWORD=
PUPPETEER_PROTOCOL_TIMEOUT_MS=300000
PUPPETEER_PAGE_TIMEOUT_MS=60000
PUPPETEER_NAVIGATION_TIMEOUT_MS=60000
COMMAND_STALE_AFTER_MS=600000
ENABLE_DEBUG_HTTP=false
DRY_RUN=false
```

### Local startup

```bash
cd workers/data-engine
cp .env.example .env
npm install
npm start
```

### Dry run

```bash
DRY_RUN=true npm start
```

### Cloud deployment

Deploy as a long-running service on a VPS, container host, or dedicated broadcast server with outbound HTTPS access to Supabase and target websites.

## Command lifecycle

1. Portal inserts command with status `pending`
2. Worker claims command via `claim_data_engine_command()` using `FOR UPDATE SKIP LOCKED`
3. Worker sets status `processing` and records `claimed_by_worker_id`
4. Worker completes command as `completed` or `failed`

`run_once` remains `processing` until the scrape succeeds or fails. Protocol timeouts and scrape errors mark the command `failed`.

### Stale commands

Processing commands older than `COMMAND_STALE_AFTER_MS` (default 10 minutes) are failed automatically when the worker starts or on each loop. Platform admins can mark stale commands failed from the portal.

### Puppeteer timeouts

- `PUPPETEER_PROTOCOL_TIMEOUT_MS` — CDP calls such as `Runtime.callFunctionOn` (default 300000)
- `PUPPETEER_PAGE_TIMEOUT_MS` — default page timeout (default 60000)
- `PUPPETEER_NAVIGATION_TIMEOUT_MS` — navigation and selector waits (default 60000)

See `workers/data-engine/README.md` for details.

## Why not Vercel?

Puppeteer requires a persistent browser process and is unsuitable for Vercel Functions, Route Handlers, Server Actions, or Supabase Edge Functions.
