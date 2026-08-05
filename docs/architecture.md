# Architecture

NEUD is an installable Windows desktop application for live graphics projects. The existing portal UI is preserved, but project and runtime data move to local SQLite while a minimal Supabase account service handles online authentication and entitlement checks.

## High-level layout

```
┌──────────────────────────────────────────────────────────────┐
│                      NEUD Desktop                            │
│  Electron main + embedded Next.js UI (same visual design)    │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
     ┌──────────▼──────────┐         ┌──────────▼──────────┐
     │ Local SQLite + files │         │ Minimal cloud auth  │
     │ Projects, engines,   │         │ login, entitlement, │
     │ displays, logs       │         │ device records      │
     └──────────┬──────────┘         └─────────────────────┘
                │
     ┌──────────▼──────────────────────────────────────────┐
     │ Local runtime on 127.0.0.1                           │
     │ Data Engines, Puppeteer, displays, controllers       │
     │ Optional public publishing relay (Phase E)           │
     └──────────────────────────────────────────────────────┘
```

See [desktop.md](./desktop.md) and [desktop-overhaul-audit.md](./desktop-overhaul-audit.md).

## Framework decision

**Keep the existing Next.js UI embedded in Electron** for Phase A–C because:

- The operational UI, Data Engine pages, JSON viewer, and design system already exist
- Packaging via Next standalone is proven in this repository
- Server Actions and Supabase reads can be replaced incrementally with local API/IPC calls without a visual redesign

A React/Vite migration remains a fallback if standalone packaging becomes unstable, but it is not the first choice.

## Local services owned by Electron main

| Service | Responsibility |
|---------|----------------|
| SQLite database | Projects, data sources, displays, controllers, logs, snapshots |
| Local API server | Loopback HTTP for UI, graphics, controllers, health |
| Engine manager | Local Puppeteer workers only |
| Credential manager | OS-backed scraper credential storage |
| Auth/license manager | 7-day offline authorization cache |
| Publishing manager | Optional public graphics relay (Phase E) |

## Authorization model (target)

Platform roles and entitlements remain cloud-backed. Local project data is owned by the signed-in desktop installation. Offline access is allowed for up to 7 days after the last successful online verification.

## Code organization

| Area | Location | Purpose |
|------|----------|---------|
| Desktop host | `desktop/src/` | Electron main, IPC, SQLite, local server |
| UI (transitional) | `src/app/` | Existing Next.js portal UI |
| Shared UI | `src/components/` | Preserved design system and pages |
| Worker runtime | `workers/data-engine/` | BAG scraper (moving to local-only mode) |
| Cloud auth migrations | `supabase/migrations/007_*` | Entitlements/devices only |
| Manual cleanup | `supabase/cleanup/` | Export + destructive cleanup scripts |

## Migration phases

1. **Phase A** — Local database, paths, auth cache skeleton, cleanup scripts
2. **Phase B** — Portal reads/writes through local repositories
3. **Phase C** — Local-only engines and graphics URLs
4. **Phase D** — Signed offline authorization enforcement in UI
5. **Phase E** — Public publishing relay
6. **Phase F** — Remove hosted portal/runtime Supabase usage
7. **Phase G** — Self-contained Windows installer with bundled Chromium

Destructive Supabase cleanup is manual only. Do not run `supabase/cleanup/desktop_only_destructive_cleanup.sql` until local migration is verified.
