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

## Planned services

| Service | Role |
|---------|------|
| Vercel | Hosts the Next.js web application |
| Supabase Auth | User authentication |
| Supabase Postgres | Projects, state, and event storage |
| Supabase Realtime | Live state updates to controllers and displays |

## Environment variables (future)

When Supabase and workers are configured, secrets such as service-role keys must remain server-side only. Never expose service-role keys to the browser.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the portal.

Worker development will use separate commands once the BAG worker is added.
