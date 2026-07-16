# HMG Graphics Server Development Instructions

## Project purpose

HMG Graphics Server is the central web platform for HMG's live graphics projects.

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

The current phase is **Projects foundation**.

Completed foundation:

- Supabase authentication with cookie-based sessions
- Access request and admin invitation workflow
- Platform roles in `profiles` (`owner`, `admin`, `user`)
- Dark operational portal UI with public and authenticated shells
- Protected routes for dashboard, projects, admin, users, activity, and settings
- `projects` and `project_members` tables with RLS
- Functional Project creation, list, overview, and member management
- Slug-based Project URLs and sequential Project numbers

Use [docs/design-system.md](./docs/design-system.md) for tokens, components, layout rules, and terminology.
Use [docs/projects.md](./docs/projects.md) for Projects schema, authorization, and URL structure.

User-facing term remains **Projects** (not Graphics).

Do not add the following until explicitly requested:

- BAG controller, display, and worker migration
- Puppeteer and BAG scraper code
- Functional graphics controllers and displays
- Public OBS/vMix display routes using `display_token`
- Activity logging and audit events
- Command palette (`Ctrl/Command + K`)
- Billing, organizations, and team permissions
- Project archive/restore UI
- Logo file uploads and Supabase Storage buckets

