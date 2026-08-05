# Data Engine worker deployment

NEUD ships two distinct Data Engine worker artifacts. They must never be mixed in packaging or deployment.

## Local packaged worker (`@neud/data-engine-local-worker`)

**Build:** `npm run build:local -w @neud/data-engine-worker`

**Output:** `workers/data-engine/dist-local/`

**Shipped with:** Electron desktop installer (`desktop/staging/worker/dist`)

**Behavior:**

- Communicates only through `NEUD_LOCAL_API_URL` (desktop local API on `127.0.0.1`)
- Does **not** include `supabase.js` or `@supabase/supabase-js`
- Does **not** load or accept `SUPABASE_SERVICE_ROLE_KEY`
- `cloud-client.js` throws if a remote cloud path is invoked

**Safe for distribution** to end users.

## Remote trusted worker (`@neud/data-engine-worker`)

**Build:** `npm run build:remote -w @neud/data-engine-worker`

**Output:** `workers/data-engine/dist/`

**Deployed to:** independently managed VPS or server environment only

**Behavior:**

- Uses Supabase service-role credentials from server environment
- Polls cloud command queue, writes snapshots/logs/status to hosted Postgres
- Must never be copied into Electron `extraResources`, `staging/`, or installer output

**Not safe for distribution** — trusted server artifact only.

## Desktop packaging path

`desktop/scripts/stage-standalone.mjs`:

1. Builds local worker (`dist-local`)
2. Stages `staging/worker/dist/` from local build
3. Copies worker `node_modules` **excluding** `@supabase`
4. Electron main process spawns `staging/worker/dist/index.js` with `cwd=staging/worker`

Development mode continues to use `workers/data-engine/src/index.js` on the developer machine.

## Verification

```bash
npm run test:neud-release-security
```

Scans `desktop/dist`, `desktop/staging/worker`, and packaged release output when present.
