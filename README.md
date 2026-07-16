# HMG Graphics Server

Centralized web platform for HMG's live graphics projects.

## Purpose

HMG Graphics Server gives operators a single portal to:

- Log in to a secure portal
- Create and manage graphics projects
- Operate project-specific web controllers
- Preview live graphics
- Copy display URLs into OBS or other broadcast software
- Connect graphics to live data sources
- Monitor worker and data-source status

## First project type: BAG-Graphics

BAG-Graphics is the first graphics project implemented on the platform. It monitors an auction website and provides live lot, bid, and sold information for broadcast overlays.

See [docs/bag-graphics.md](./docs/bag-graphics.md) for details.

## Technology stack

- **Next.js** (App Router) — web application
- **TypeScript** — application code
- **Tailwind CSS** — styling
- **Supabase Auth** — authentication (planned)
- **Supabase Postgres** — database (planned)
- **Supabase Realtime** — live updates (planned)
- **Vercel** — web hosting
- **Node.js + Puppeteer** — BAG background worker (planned)

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Other commands:

```bash
npm run lint    # ESLint
npm run build   # Production build
npm run start   # Run production build locally
```

## Architecture

The platform separates reusable portal services from graphic-specific modules.

**Portal (shared):** authentication, user and project management, realtime state, display URLs, controllers, worker commands, monitoring, and event logging.

**Graphic modules:** each project type keeps its controller, display, validation, state, and worker logic under `src/graphics/[project-type]/` and `workers/[project-type]/`.

**Workers:** long-running data collectors (such as the BAG Puppeteer scraper) run outside Vercel on dedicated hosts.

See [docs/architecture.md](./docs/architecture.md) for the full architecture overview.

## Documentation

- [Architecture](./docs/architecture.md)
- [Project types](./docs/project-types.md)
- [BAG-Graphics](./docs/bag-graphics.md)
- [Deployment](./docs/deployment.md)

## Current status

**Phase: foundation setup**

Completed in this phase:

- Next.js App Router scaffold with TypeScript, Tailwind, and ESLint
- Landing page and placeholder portal routes (`/login`, `/signup`, `/dashboard`, `/projects`, `/projects/new`)
- Shared site header and folder structure for platform and BAG-Graphics modules
- Architecture and deployment documentation

Not yet implemented:

- Supabase, authentication, and database
- BAG controller, display, and worker migration
- Functional project creation and realtime state

See [AGENTS.md](./AGENTS.md) for development guidelines and phase constraints.
