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
- **Supabase Auth** — email/password authentication
- **Supabase Postgres** — database (planned)
- **Supabase Realtime** — live updates (planned)
- **Vercel** — web hosting
- **Node.js + Puppeteer** — BAG background worker (planned)

## Environment variables

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Do not commit `.env.local`. Do not add the service-role key.

See [docs/authentication.md](./docs/authentication.md) for Supabase redirect URL configuration.

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

## Authentication routes

| Route | Purpose |
|-------|---------|
| `/signup` | Create an account |
| `/login` | Sign in |
| `/forgot-password` | Request a password reset email |
| `/update-password` | Set a new password after recovery link |
| `/auth/confirm` | Verify email confirmation or recovery tokens |
| `/dashboard` | Protected portal page |
| `/projects` | Protected portal page |
| `/projects/new` | Protected portal page |

## Architecture

The platform separates reusable portal services from graphic-specific modules.

**Portal (shared):** authentication, user and project management, realtime state, display URLs, controllers, worker commands, monitoring, and event logging.

**Graphic modules:** each project type keeps its controller, display, validation, state, and worker logic under `src/graphics/[project-type]/` and `workers/[project-type]/`.

**Workers:** long-running data collectors (such as the BAG Puppeteer scraper) run outside Vercel on dedicated hosts.

See [docs/architecture.md](./docs/architecture.md) for the full architecture overview.

## Documentation

- [Architecture](./docs/architecture.md)
- [Authentication](./docs/authentication.md)
- [Project types](./docs/project-types.md)
- [BAG-Graphics](./docs/bag-graphics.md)
- [Deployment](./docs/deployment.md)

## Current status

**Phase: Supabase authentication**

Completed:

- Next.js App Router scaffold with TypeScript, Tailwind, and ESLint
- Landing page and portal routes
- Supabase email/password signup, login, logout, and password reset
- Cookie-based sessions with Next.js 16 proxy session refresh
- Protected routes for dashboard and projects
- Architecture and deployment documentation

Not yet implemented:

- Application database tables and project data
- BAG controller, display, and worker migration
- Functional project creation and realtime state

See [AGENTS.md](./AGENTS.md) for development guidelines and phase constraints.
