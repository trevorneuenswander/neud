# Architecture

HMG Graphics Server is a centralized web platform for HMG's live graphics projects. The platform is designed to support multiple graphics project types while keeping shared portal services reusable.

## High-level layout

```
┌─────────────────────────────────────────────────────────┐
│                  HMG Graphics Server                    │
│              (Next.js on Vercel)                        │
│                                                         │
│  Portal: auth, projects, controllers, displays, status  │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────▼────────┐      ┌────────▼────────┐
     │  bag-graphics   │      │  future types   │
     │  web modules    │      │  web modules    │
     └────────┬────────┘      └─────────────────┘
              │
     ┌────────▼────────┐
     │  bag-graphics   │
     │  worker         │
     │  (Node.js)      │
     └─────────────────┘
```

## Reusable platform services

The portal provides shared capabilities used by every graphics project type:

- Authentication
- User and project management
- Realtime project state
- Graphic display URLs
- Web controllers
- Worker commands
- Worker monitoring
- Event logging

## Code organization

| Area | Location | Purpose |
|------|----------|---------|
| Portal pages | `src/app/` | Routes for login, dashboard, projects, and future portal features |
| Shared UI | `src/components/` | Reusable layout and UI components |
| Shared utilities | `src/lib/` | Platform helpers, Supabase clients, and auth logic |
| Shared types | `src/types/` | Platform TypeScript types |
| Graphic modules | `src/graphics/[project-type]/` | Project-type-specific web code |
| Workers | `workers/[project-type]/` | Background data collection processes |

## Isolation rules

- Graphic-specific controller, display, validation, state, and worker logic must stay inside each project type's directories.
- Shared portal code must not assume every graphics project is an auction.
- Continuous Puppeteer processes must not run in Vercel Functions.

## Authentication

Supabase email/password authentication is implemented with:

- Browser and server Supabase clients in `src/lib/supabase/`
- Cookie-based sessions refreshed by `src/proxy.ts`
- Server-side route protection in `src/lib/auth/`
- Auth UI in `src/components/auth/`

Authentication is separate from future project authorization logic.

See [authentication.md](./authentication.md) for setup and route details.

## Planned data layer

Future phases will add:

- Supabase Postgres for projects and state
- Supabase Realtime for live updates
- Row Level Security for multi-user access
