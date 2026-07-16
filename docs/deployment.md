# Deployment

HMG Graphics Server uses a split deployment model: the web portal on Vercel and background workers on separate hosts.

## Web application (Vercel)

The Next.js App Router application deploys to Vercel.

Responsibilities:

- Portal pages (login, dashboard, projects, access requests)
- Web controllers
- Graphic display URLs for OBS
- API routes for project and worker coordination (future)

Vercel Functions are suitable for request/response work only. They must not run continuous Puppeteer or long-polling scrapers.

## Workers (separate Node.js hosts)

Graphics workers run outside Vercel as long-lived Node.js processes.

Responsibilities:

- Continuous data collection (e.g. Puppeteer scraping for BAG-Graphics)
- Writing state updates to the database
- Reporting health and status to the portal

Worker location in this repository: `workers/[project-type]/`

## Services

| Service | Role |
|---------|------|
| Vercel | Hosts the Next.js web application |
| Supabase Auth | User authentication and invitations |
| Supabase Postgres | Profiles, access requests, and future project data |
| Supabase Realtime | Live state updates to controllers and displays (planned) |

## Environment variables

Set these in Vercel project settings and in local `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- Public keys are used by the browser and server session client.
- The service-role key is used only in server-only modules.
- Never expose the service-role key to the browser or client bundles.

## Database migration

Before deploying, apply `supabase/migrations/001_access_requests_and_profiles.sql` in the Supabase SQL editor.

Then create the first owner profile using the SQL in [authentication.md](./authentication.md).

## Supabase configuration

### Disable public signup

In **Authentication → Providers → Email**, disable public signups.

### Redirect URLs

Configure under **Authentication → URL Configuration**:

```
http://localhost:3000/auth/confirm
http://localhost:3000/**
https://your-production-domain.com/auth/confirm
https://your-production-domain.com/**
```

### Invite email template

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invitation">
  Accept the invite
</a>
```

See [authentication.md](./authentication.md) for full setup and testing steps.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the portal.

Worker development will use separate commands once the BAG worker is added.
