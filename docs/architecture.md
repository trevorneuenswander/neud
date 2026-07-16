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

- Authentication and access requests
- User and project management
- Realtime project state
- Graphic display URLs
- Web controllers
- Worker commands
- Worker monitoring
- Event logging

## Authorization model

HMG Graphics Server uses two independent authorization layers.

### Layer 1: Platform roles (`profiles`)

| Role | Access |
|------|--------|
| `owner` | Full platform control; may access all projects (future) |
| `admin` | Platform administration; may access all projects (future) |
| `user` | General portal access only |

Platform roles are stored in `profiles` and checked by `requireAdmin()` / `isAdmin()` on the server. They control portal administration, not project-specific access.

### Layer 2: Project memberships (`project_members`, future)

| Access level | Purpose |
|--------------|---------|
| `manager` | Manage a specific graphics project |
| `operator` | Operate a specific graphics project |
| `viewer` | View a specific graphics project |

An approved portal user with `profiles.role = 'user'` does **not** automatically receive access to any graphics project. Project access requires a separate `project_members` record.

Future helpers:

- `requireProjectAccess(projectId)`
- `requireProjectRole(projectId, allowedRoles)`

Owners and platform admins may access all projects. Regular users may only access projects where they have a membership record. Every project page, query, and Server Action must verify membership on the server.

## Code organization

| Area | Location | Purpose |
|------|----------|---------|
| Public pages | `src/app/(public)/` | Landing, login, request access, and auth flows |
| Portal pages | `src/app/(portal)/` | Dashboard, projects, admin, users, activity, settings |
| Auth routes | `src/app/auth/` | Token confirmation (`/auth/confirm`) |
| Shared UI | `src/components/` | Layout shells, portal navigation, and UI primitives |
| Shared utilities | `src/lib/` | Platform helpers, Supabase clients, auth, and access requests |
| Shared types | `src/types/` | Platform TypeScript types |
| Graphic modules | `src/graphics/[project-type]/` | Project-type-specific web code |
| Workers | `workers/[project-type]/` | Background data collection processes |
| Migrations | `supabase/migrations/` | Database schema and RLS policies |

## UI layout

The application uses two route-group shells. See [design-system.md](./design-system.md) for tokens, components, and responsive behavior.

**Public shell** (`src/app/(public)/layout.tsx`) — lighter layout with `PublicHeader` for marketing and auth pages.

**Portal shell** (`src/app/(portal)/layout.tsx`) — dark operational layout with `AppShell` (sidebar, top bar, mobile drawer).

Navigation visibility is not authorization. Portal routes enforce access with `requireUser()` or `requireAdmin()` on the server.

## Isolation rules

- Graphic-specific controller, display, validation, state, and worker logic must stay inside each project type's directories.
- Shared portal code must not assume every graphics project is an auction.
- Continuous Puppeteer processes must not run in Vercel Functions.
- Platform authorization must remain separate from project authorization.

## Authentication and access requests

Supabase email/password authentication is implemented with:

- Browser and server Supabase clients in `src/lib/supabase/`
- Server-only admin client for access-request inserts and invitations
- Cookie-based sessions refreshed by `src/proxy.ts`
- Server-side route protection in `src/lib/auth/`
- Access request workflow in `src/lib/access-requests/`

Public self-service signup is disabled. New users request access, are reviewed by a platform administrator, and receive an email invitation.

See [authentication.md](./authentication.md) for setup and route details.

## Planned data layer

Future phases will add:

- `projects` table and graphics project data
- `project_members` table for per-project access control
- Supabase Realtime for live updates
- Row Level Security for project data
