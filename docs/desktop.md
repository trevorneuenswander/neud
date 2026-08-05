# NEUD Desktop

Phase 1 adds an Electron host for the existing Next.js portal and local Data Engine workers.

## Architecture

- **Electron main process** — lifecycle, IPC, credentials, engine child processes, optional packaged Next.js server
- **Preload** — exposes `window.neudDesktop` through `contextBridge`
- **Renderer** — existing NEUD UI loaded from local Next.js
- **Data Engine worker** — existing `workers/data-engine/` spawned as a child process

The Vercel web deployment and remote worker path remain unchanged.

## Development

1. Copy `.env.local` to the repository root with Supabase keys.
2. Install dependencies: `npm install`
3. Start desktop dev:

```bash
npm run dev:desktop
```

This runs:

- Next.js on `http://127.0.0.1:3000`
- Electron loading that URL with `persist:neud` session partition

Optional scraper credential dev fallback:

```bash
NEUD_ALLOW_PLAINTEXT_CREDENTIALS=true
BAG_AUCTION_EMAIL=
BAG_AUCTION_PASSWORD=
```

## Desktop API

See `src/lib/desktop/types.ts` for portal-safe types (`NeudDesktopAPI`).

Renderer access is only through `src/lib/desktop/client.ts`.

IPC channels use the `neud:*` prefix.

## Security

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- **No service-role key in renderer, main process, preload, or packaged resources**
- Cloud sync uses the signed-in user's Supabase session via `AuthenticatedCloudCoordinator`
- Credentials stored with Electron `safeStorage` in main process
- Navigation restricted to the local app origin; external links open in the system browser

### Cloud session lifecycle

| Event | Behavior |
|-------|----------|
| Startup without cloud config | Local mode; cloud services report unavailable status |
| Sign-in | Encrypted session stored; display/activity/directory/publishing sync start |
| Token refresh | Coordinator refreshes access token; sync continues |
| Sign-out / session expiry | All cloud sync services stop; local operation continues |
| Project access revoked | Cloud writes rejected by RLS/RPCs; errors surfaced in UI |

Privileged identity administration (user invite) calls the trusted Vercel server route `/api/desktop/admin/invite-user`, not Supabase Admin APIs from Electron.

Packaged Data Engine worker uses the **local worker** artifact only (`staging/worker/dist/`). See [data-engine-worker-deployment.md](../data-engine-worker-deployment.md).

## Local paths

Windows application data defaults to `%APPDATA%\NEUD\`.

Database file: `data/neud.sqlite`

Example layout:

```text
%APPDATA%\NEUD\
  config\
    auth-cache.enc
  data\
    neud.sqlite
  logs\
  logs\engines\
  browser-data\
  cookies\
```

## Execution modes

| Mode | Behavior |
|------|----------|
| `remote-worker` | Default. Server Actions queue commands for an external worker. |
| `local-desktop` | Electron EngineManager spawns the worker on this PC. |

Use **Run on this PC** on the Data Engine detail page inside the desktop app.

## Packaging

After `npm install`, approve native install scripts if npm prompts (required for `electron` and `app-builder-bin`):

```bash
npm approve-scripts electron app-builder-bin
```

Then:

```bash
npm run build:desktop
npm run package:win
```

For an unpacked build without an installer:

```bash
npm run package:win -w @neud/desktop -- --dir
```

Validation after packaging:

```bash
npm run verify:bundled-browser
npm run verify:win-package
npm run smoke:packaged-app
npm run release:win
```

See also:

- [windows-packaging.md](./windows-packaging.md)
- [bundled-puppeteer-browser.md](./bundled-puppeteer-browser.md)
- [application-updates.md](./application-updates.md)

Packaged Windows releases bundle Chrome for Testing under `resources/puppeteer/chrome/`. Automatic updates use `electron-updater` with GitHub Releases (draft). Check for Updates is available in **Settings → About NEUD** and **Help → Check for Updates**.

Unsigned Windows builds trigger SmartScreen until Authenticode signing is configured (`CSC_LINK`, `CSC_KEY_PASSWORD`).

## Production blockers

- Authenticode code signing for public distribution
- Cross-machine execution lease enforcement (Beta)
- First-run Supabase configuration wizard
- Custom protocol auth callbacks (`neud://`)

## Rollback

Remove `desktop/`, revert workspace scripts, and set all engines to `remote-worker`. The web app continues to work without Electron.
