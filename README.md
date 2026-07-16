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
- **Supabase Auth** — email/password authentication and invitations
- **Supabase Postgres** — profiles and access requests
- **Supabase Realtime** — live updates (planned)
- **Vercel** — web hosting
- **Node.js + Puppeteer** — BAG background worker (planned)

## Environment variables

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Do not commit `.env.local`. The service-role key is server-only.

See [docs/authentication.md](./docs/authentication.md) for migration, first-admin setup, and Supabase configuration.

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

## Access and authentication routes

| Route | Purpose |
|-------|---------|
| `/request-access` | Submit an access request |
| `/request-access/submitted` | Request confirmation page |
| `/signup` | Redirects to `/request-access` |
| `/login` | Sign in |
| `/forgot-password` | Request a password reset email |
| `/accept-invitation` | Set password after invitation |
| `/update-password` | Set a new password after recovery link |
| `/auth/confirm` | Verify invitation or recovery tokens |
| `/admin/access-requests` | Review access requests (owner/admin) |
| `/dashboard` | Protected portal home |
| `/projects` | Protected Projects list |
| `/projects/new` | New Project foundation page |
| `/users` | User management placeholder (owner/admin) |
| `/activity` | Activity log placeholder (owner/admin) |
| `/settings` | Settings placeholder (authenticated) |

## Authorization

HMG Graphics Server uses two authorization layers:

1. **Platform roles** (`owner`, `admin`, `user`) in `profiles` — control portal administration
2. **Project memberships** (`manager`, `operator`, `viewer`) in future `project_members` — control per-project access

Approved users receive general portal access only. They are not automatically assigned to any graphics project.

## Architecture

The platform separates reusable portal services from graphic-specific modules.

**Portal (shared):** authentication, access requests, user management, realtime state, display URLs, controllers, worker commands, monitoring, and event logging.

**Graphic modules:** each project type keeps its controller, display, validation, state, and worker logic under `src/graphics/[project-type]/` and `workers/[project-type]/`.

**Workers:** long-running data collectors (such as the BAG Puppeteer scraper) run outside Vercel on dedicated hosts.

See [docs/architecture.md](./docs/architecture.md) for the full architecture overview.

## Documentation

- [Architecture](./docs/architecture.md)
- [Design system](./docs/design-system.md)
- [Authentication](./docs/authentication.md)
- [Project types](./docs/project-types.md)
- [BAG-Graphics](./docs/bag-graphics.md)
- [Deployment](./docs/deployment.md)

## Current status

**Phase: interface design system and portal shell**

Completed:

- Next.js App Router scaffold with TypeScript, Tailwind, and ESLint
- Supabase email/password login, logout, and password reset
- Cookie-based sessions with Next.js 16 proxy session refresh
- Access request and admin invitation workflow
- Platform roles in `profiles` (`owner`, `admin`, `user`)
- Dark operational portal UI with sidebar, top bar, and mobile drawer
- Public and portal route-group layouts
- Protected routes for dashboard, projects, admin, users, activity, and settings

Not yet implemented:

- `projects` and `project_members` tables
- Functional project creation and persistence
- BAG controller, display, and worker migration
- Activity logging, workers, and displays monitoring
- Command palette

See [AGENTS.md](./AGENTS.md) for development guidelines and phase constraints.
