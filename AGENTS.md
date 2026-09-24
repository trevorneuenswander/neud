# NEUD Development Instructions

## Project purpose

NEUD is a desktop-first data extraction and live graphics control application. Its tagline is "The Ultimate Data Stripper."

Users will be able to:

- Log in to a secure portal
- Create and manage graphics projects
- Operate project-specific web controllers
- Preview live graphics
- Copy display URLs into OBS or other broadcast software
- Connect graphics to live data sources
- Monitor worker and data-source status

BAG-Graphics is the first graphics project implemented on the platform.

## Architecture

The platform contains reusable services for:

- Authentication
- User and project management
- Realtime project state
- Graphic display URLs
- Web controllers
- Worker commands
- Worker monitoring
- Event logging

Each graphic type must keep its project-specific controller, display, validation, state, and worker logic isolated from other graphic types.

## Initial graphic type

Project type: `bag-graphics`

BAG-Graphics monitors an auction website and provides:

- Current lot number
- Vehicle title
- Current bid
- Bid status
- Sold status
- Last sold information
- Ticker visibility controls
- Manual overrides
- OBS-compatible transparent displays



## Technology

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Supabase Realtime
- Vercel for the web application
- A separate Node.js and Puppeteer worker for continuous BAG data collection



## Coding expectations

- Use TypeScript for the Next.js application.
- Use Server Components by default.
- Use Client Components only when browser interactivity is required.
- Follow current Next.js App Router conventions.
- Never expose service-role keys to the browser.
- **Never ship `SUPABASE_SERVICE_ROLE_KEY` in packaged Electron apps.** All desktop cloud operations use the signed-in user's Supabase session, RLS, and authenticated RPCs. Service role is allowed only in trusted server environments (Vercel server routes, one-off scripts, workers) — never in desktop bundles, preload, or `server.env` requirements.
- Validate all form and API input.
- Verify authentication and project ownership for protected actions.
- Use Supabase Row Level Security.
- Keep reusable platform code separate from graphic-specific code.
- Do not place BAG-specific fields inside reusable platform components.
- Do not put continuous Puppeteer processes in Vercel Functions.
- Preserve existing working BAG scraper and animation behavior.
- Do not redesign existing graphics unless explicitly requested.
- Do not install packages unless necessary.
- Keep components small and clearly named.
- Prefer simple implementations suitable for a beginner developer.
- Avoid overengineering.
- Do not create placeholder APIs or abstractions that are not yet needed.



## Project organization

Graphic-specific web code belongs under:

`src/graphics/[project-type]/`

Worker code belongs under:

`workers/[project-type]/`

Shared portal code must not assume every graphics project is an auction.

## Development process

Before making a large change:

1. Explain the proposed implementation.
2. List the files that will change.
3. Make one feature work at a time.
4. Run TypeScript, lint, and build checks.
5. Summarize the result.
6. Do not alter working BAG behavior without documenting the reason.



## Current phase

**Alpha v0.1.0** display baseline remains locked. See [docs/alpha-v0.1.0-baseline.md](./docs/alpha-v0.1.0-baseline.md).

**Alpha v0.1.1** functional development is complete at application version **0.1.1**. See [docs/alpha-v0.1.1-online-delivery-plan.md](./docs/alpha-v0.1.1-online-delivery-plan.md) and [docs/alpha-v0.1.1-packaging-validation.md](./docs/alpha-v0.1.1-packaging-validation.md).

**Latest published release:** v0.1.4. **Current release candidate:** v0.2.0 (canonical `package.json` version). See [docs/release-milestones.md](./docs/release-milestones.md).

The **current release milestone** remains Windows x64 packaging, bundled Puppeteer Chrome, installation validation, and automatic updates for the v0.2.0 candidate. See [docs/windows-packaging.md](./docs/windows-packaging.md).

Do not alter or regress the Alpha v0.1.0 display baseline (Stream Bid Display, Stream Ticker, Legacy Pylon, Legacy Ticker) unless a compatible delivery-only change is explicitly required.

The current engineering phase remains **desktop-first overhaul**.

The installable Windows application is the primary product. The hosted portal remains temporarily during migration, but project/runtime data is moving to local SQLite under Electron.

Completed foundation:

- Supabase authentication with cookie-based sessions
- Access request and admin invitation workflow
- Platform roles in `profiles` (`owner`, `admin`, `user`)
- Dark operational portal UI with public and authenticated shells
- Generic Data Engine framework with Webpage Scraper / BAG adapter
- Electron desktop host (Phase 1)
- Local SQLite schema, backup/migration system, local API server skeleton (Phase A overhaul)
- **Alpha v0.1.0:** Completed local Broad Arrow workflow; finalized Stream Bid Display, Stream Ticker, Legacy Pylon, and Legacy Ticker (designs locked)
- **Alpha v0.1.1:** Completed local + online delivery baseline; Windows packaging, bundled browser, and auto-update milestone in progress

Use [docs/desktop-overhaul-audit.md](./docs/desktop-overhaul-audit.md) for the migration inventory and plan.
Use [docs/design-system.md](./docs/design-system.md) for tokens, components, layout rules, and terminology.
Use [docs/projects.md](./docs/projects.md) for Projects schema, authorization, and URL structure.
Use [docs/data-engines.md](./docs/data-engines.md) for Data Engine architecture.
Use [docs/desktop.md](./docs/desktop.md) for the Electron process model.

User-facing term remains **Projects** (not Graphics). Collection runtimes are **Data Engines** (not Workers).

Do not run destructive Supabase cleanup scripts automatically.

Do not add the following until explicitly requested:

- Visual redesign of completed displays (Stream Bid, Stream Ticker, Legacy Pylon, Legacy Ticker)
- macOS packaging (Windows packaging is the current milestone)
- Beta features: Online JSON Viewer product surface, browser-based controller, multi-computer synchronization

Alpha v0.1.1 explicitly **includes** online display/JSON delivery via the existing Vercel `neud` project (see v0.1.1 plan doc). The old "Full public publishing relay deployment (Phase E)" deferral is superseded for v0.1.1 scope only.

## Branding and migration notes

- Product name: **NEUD** (technical: `neud`, packages: `@neud/*`)
- Environment variables: use `NEUD_*` only
- Desktop IPC: use `neud:*` channels only
- Application data lives under `%APPDATA%\NEUD\`
- Do not rename BAG-Graphics project types, Webpage Scraper, or `broad-arrow-auction-*` export folders
- Legacy startup URL redirects (`/hmg`, `/hmg-graphics-server`, etc.) remain in `startup-paths.ts` and `startup-route.ts` only
