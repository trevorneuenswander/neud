# Deployment

HMG Graphics Server uses a split deployment model: the web portal on Vercel and background workers on separate hosts.

## Web application (Vercel)

The Next.js App Router application deploys to Vercel.

Responsibilities:

- Portal pages (login, dashboard, projects)
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
| Supabase Auth | User authentication (implemented) |
| Supabase Postgres | Projects, state, and event storage (planned) |
| Supabase Realtime | Live state updates to controllers and displays (planned) |

## Environment variables

Set these in Vercel project settings and in local `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Only public Supabase values are used by the web application. Never add the service-role key to Vercel environment variables for this app.

## Supabase redirect URLs

Configure these in the Supabase dashboard under **Authentication → URL Configuration**:

**Site URL**

- Local: `http://localhost:3000`
- Production: your deployed Vercel URL

**Redirect URLs**

```
http://localhost:3000/auth/confirm
http://localhost:3000/**
https://your-production-domain.com/auth/confirm
https://your-production-domain.com/**
```

See [authentication.md](./authentication.md) for full auth setup details.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the portal.

Worker development will use separate commands once the BAG worker is added.
