# Design System

HMG Graphics Server uses a dark, operational interface inspired by broadcast control software. The design prioritizes clarity, status visibility, and consistency over decorative effects.

## Principles

1. **Operational first** — UI supports live production workflows, not marketing.
2. **No decorative noise** — Avoid gradients, glow, glassmorphism, and distracting animation.
3. **Status over decoration** — Show verified system state clearly; never imply services are online without proof.
4. **Consistency over novelty** — Reuse shared components and tokens across portal and public pages.
5. **Design for 1920×1080 first** — Optimize for control-room displays, then adapt to laptops, tablets, and mobile.

## Branding

### Logo

Canonical logo path:

```
public/branding/hmg-logo.png
```

Served at `/branding/hmg-logo.png`.

Requirements:

- Render with `next/image` via `HmgLogo` / `HmgLogoServer`
- Preserve original proportions — do not crop, stretch, redraw, recolor, or recreate
- Pair with the text **HMG Graphics Server** where space allows
- If the file is missing, `HmgLogoServer` falls back to a bordered **HMG** text mark

Use the logo in:

- Authenticated sidebar
- Public header
- Login page
- Request Access page

## Color tokens

Semantic CSS variables are defined in `src/app/globals.css`:

| Token | Variable | Default |
|-------|----------|---------|
| Background | `--background` | `#0B0F14` |
| Sidebar | `--sidebar` | `#10151C` |
| Surface | `--surface` | `#151B23` |
| Raised surface | `--surface-raised` | `#1B222C` |
| Border | `--border` | `#27303C` |
| Foreground | `--foreground` | `#F3F6FA` |
| Muted text | `--muted` | `#8B98A8` |
| Primary | `--primary` | `#3B82F6` |
| Success | `--success` | `#22C55E` |
| Warning | `--warning` | `#F59E0B` |
| Danger | `--danger` | `#EF4444` |

Use Tailwind semantic classes (`bg-background`, `text-muted`, `border-border`, etc.) rather than scattering raw hex values through components.

## Typography

Geist Sans and Geist Mono (loaded in the root layout) are the platform fonts.

## Layout architecture

Two route-group shells preserve all existing URLs:

### Public shell — `src/app/(public)/layout.tsx`

Used for unauthenticated and auth-flow pages:

- `/`
- `/login`
- `/signup` (redirects to `/request-access`)
- `/request-access`
- `/request-access/submitted`
- `/forgot-password`
- `/update-password`
- `/accept-invitation`

Includes `PublicHeader` and a lighter, less dense page layout via `PublicPage`.

### Portal shell — `src/app/(portal)/layout.tsx`

Used for authenticated portal pages:

- `/dashboard`
- `/projects`
- `/projects/new`
- `/admin/access-requests`
- `/users`
- `/activity`
- `/settings`

Includes `AppShell` with sidebar, top bar, and main content area.

`/auth/confirm` remains outside both shells at `src/app/auth/confirm/route.ts`.

## Portal shell structure

```
┌──────────────┬──────────────────────────────────────┐
│   Sidebar    │  Top bar (title, command affordance) │
│   (260px)    ├──────────────────────────────────────┤
│              │                                      │
│  Navigation  │  Main content                        │
│              │                                      │
│  User panel  │                                      │
└──────────────┴──────────────────────────────────────┘
```

### Sidebar navigation

| Item | Route | Visibility |
|------|-------|------------|
| Dashboard | `/dashboard` | All authenticated users |
| Projects | `/projects` | All authenticated users |
| Users | `/users` | Owner/admin only |
| Access Requests | `/admin/access-requests` | Owner/admin only |
| Activity | `/activity` | Owner/admin only |
| Settings | `/settings` | All authenticated users |

Navigation visibility is **not** authorization. Every route enforces access with server-side `requireUser()` or `requireAdmin()`.

Active routes use `aria-current="page"` on navigation links.

### Mobile navigation

Below the `lg` breakpoint:

- Sidebar becomes a slide-out `<dialog>` drawer (`MobileSidebar`)
- Top bar includes a menu button
- Drawer closes after navigation, on Escape, and on backdrop click
- Background scrolling is disabled while open
- `role="dialog"` and `aria-modal="true"` are set

### Top bar

Includes:

- Current page title
- Reserved non-interactive command palette affordance: `Search or jump to… Ctrl K` (planned, not implemented)
- Structure ready for future system status indicators

## Terminology

User-facing term: **Projects** (not Graphics).

A Project may later contain displays, controllers, workers, members, settings, and activity.

## Reusable components

### Layout (`src/components/portal/`, `src/components/layout/`)

- `AppShell` — authenticated layout wrapper
- `Sidebar` — desktop sidebar
- `MobileSidebar` — mobile drawer
- `TopBar` — page title and command affordance
- `SidebarNavItem` — navigation link with active state
- `SidebarUserPanel` — user info and logout
- `PageHeader` — portal page heading
- `PageSection` — titled content section
- `PublicHeader` — public site header
- `PublicPage` — centered public page wrapper

### UI (`src/components/ui/`)

- `Button`, `Card`, `StatCard`, `StatusBadge`, `EmptyState`, `Alert`
- `FormField`, `TextareaField`, `DataTable`

### Branding (`src/components/branding/`)

- `HmgLogo` — client-safe logo with `hasLogo` prop
- `HmgLogoServer` — server wrapper that checks file existence

## Status badges

Used on access requests and system status displays:

| Status | Color | Meaning |
|--------|-------|---------|
| Pending | Amber (`warning`) | Awaiting admin review |
| Approved | Green (`success`) | Request approved |
| Rejected | Muted red (`danger`) | Request rejected |

## System status

Dashboard and top bar reserve space for operational status. Only verified states are shown:

| Service | Connected | Not configured | Unavailable |
|---------|-----------|----------------|-------------|
| Authentication | User is authenticated | — | Not authenticated |
| Database | Lightweight `profiles` query succeeds | — | Query fails |
| Projects | — | Backend not implemented | — |
| Workers | — | Backend not implemented | — |
| Displays | — | Backend not implemented | — |

Do not show fake zeroes or claim services are online without verification.

## Accessibility

- Strong contrast on dark backgrounds
- Visible `:focus-visible` outlines using `--primary`
- `prefers-reduced-motion` disables transitions and animations
- Form errors use `role="alert"` via `Alert`
- Mobile drawer is keyboard accessible with Escape to close
- Active navigation uses `aria-current="page"`

## Command palette

A command palette (`Ctrl/Command + K`) is planned but **not implemented**. The top bar may show a disabled affordance only — do not imply the feature works.
