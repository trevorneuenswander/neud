# MacBook development setup

Use this guide for **clean-machine** NEUD development on Apple Silicon macOS without access to the home Windows PC.

## Prerequisites

- **Git** and GitHub access (SSH or HTTPS + credential helper)
- **Node.js 22** (match CI — use `nvm` or official installer)
- **npm** (comes with Node)

## Clone and install

```bash
git clone https://github.com/trevorneuenswander/neud.git
cd neud
git fetch origin
git checkout develop   # or create feature/* from develop
npm ci
```

## Environment

1. Copy `.env.example` → `.env.local` in the repo root.
2. Set **public** Supabase values only:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. For local SQLite desktop dev, enable:
   - `NEUD_USE_LOCAL_DATA=1`
   - `NEXT_PUBLIC_NEUD_USE_LOCAL_DATA=1`

Never commit `.env.local`, service-role keys, or auction credentials.

## Run locally on macOS

```bash
# Web only
npm run dev:web

# Full desktop (Next + Electron)
npm run dev:desktop
```

Sign in through the desktop shell. Open a Broad Arrow project to validate scraper + displays.

## Packaged Mac build (local)

```bash
npm run build:desktop
npm run package:mac -w @neud/desktop
```

Output: `desktop/release/NEUD-0.2.2-arm64.dmg` (version from `package.json`).

**Unsigned engineering builds:** if Gatekeeper blocks the app, right-click → Open once, or clear quarantine:

```bash
xattr -cr /path/to/NEUD.app
```

## Branch workflow

See [branch-deployment-workflow.md](./branch-deployment-workflow.md).

```bash
git checkout develop
git pull origin develop
git checkout -b feature/my-change
# edit, test, commit
git push -u origin feature/my-change
```

Open a PR to **`develop`**. Merge to **`main`** only when intentionally releasing.

## Vercel Preview

Push a branch or open a PR — Vercel creates a **Preview** URL. Production (**neud.io**) deploys from **`main`** only when configured in Vercel.

## CI artifacts without a Windows PC

### Windows engineering installer

GitHub → **Actions** → **Build Windows Development** → **Run workflow**  
Choose branch or use default. Download artifact `neud-windows-dev-<shortSHA>`.

### macOS engineering build

GitHub → **Actions** → **Build macOS Development** → **Run workflow**

Public releases use **Release Windows** / **Release macOS** workflows (maintainers only).

## Logs and diagnostics

| Item | macOS path |
| ---- | ---------- |
| App data root | `~/Library/Application Support/NEUD/` |
| Logs | `~/Library/Application Support/NEUD/logs/` |
| Live display pipeline | `~/Library/Application Support/NEUD/logs/live-display-pipeline.jsonl` |
| SQLite | `~/Library/Application Support/NEUD/data/neud.sqlite` |
| Exported diagnostics | `~/Library/Application Support/NEUD/exports/` |

**Help → Export Diagnostics** in the desktop app creates a redacted zip under `exports/`.

Windows paths: `%APPDATA%\NEUD\` — see [cross-platform-data-paths.md](./cross-platform-data-paths.md).

## Remote Windows debugging

- **Level 1:** GitHub-hosted Windows runners (tests, package, worker smoke).
- **Level 2:** Interactive Windows 11 (home PC remote desktop or cloud VM) for GUI/network timing issues CI cannot reproduce.

Ordinary feature work does not require Level 2.

## Useful tests before pushing

```bash
npm run build
npm run build -w @neud/desktop
npm run test:live-display-latency
npm run test:packaged-auth-config
node --test desktop/scripts/test-neud-bag-event-driven-live.mjs
```
