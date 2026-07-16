# Authentication

HMG Graphics Server uses Supabase email/password authentication with cookie-based sessions and the `@supabase/ssr` package.

## Environment variables

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Only public Supabase values belong in the browser application. Never add the service-role key.

## Supabase dashboard configuration

### 1. Enable email provider

In **Authentication → Providers**, ensure **Email** is enabled.

Keep **Confirm email** enabled so new accounts must verify their address before logging in.

### 2. Configure redirect URLs

In **Authentication → URL Configuration**, set:

| Setting | Local development | Production |
|---------|-------------------|------------|
| Site URL | `http://localhost:3000` | Your deployed site URL |

Add these **Redirect URLs**:

```
http://localhost:3000/auth/confirm
http://localhost:3000/**
```

For production, add the equivalent URLs using your deployed domain:

```
https://your-domain.com/auth/confirm
https://your-domain.com/**
```

Supabase sends confirmation and password-reset links to `/auth/confirm`, which verifies the token and sets the session cookie.

### 3. Email templates (optional)

You can customize confirmation and password-reset emails under **Authentication → Email Templates**.

## How sessions work

1. Auth forms call server actions in `src/lib/auth/actions.ts`.
2. Supabase stores the session in HTTP-only cookies.
3. `src/proxy.ts` runs on each request, calls `getClaims()`, and refreshes expired tokens.
4. Protected pages call `requireAuth()` on the server.
5. The proxy also redirects unauthenticated users away from protected routes.

## Authentication routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/signup` | Public | Create account (confirmation email sent) |
| `/login` | Public | Sign in with email and password |
| `/forgot-password` | Public | Request password reset email |
| `/update-password` | Recovery session only | Set a new password after reset link |
| `/auth/confirm` | Public (token exchange) | Verify email confirmation or recovery tokens |
| `/dashboard` | Authenticated | Protected portal page |
| `/projects` | Authenticated | Protected portal page |
| `/projects/new` | Authenticated | Protected portal page |

## Password reset flow

1. User submits email on `/forgot-password`.
2. Supabase sends a reset email linking to `/auth/confirm`.
3. `/auth/confirm` verifies the recovery token, sets the auth session, and sets a short-lived recovery cookie.
4. User is redirected to `/update-password`.
5. `/update-password` requires both a valid auth session and the recovery cookie.
6. After updating the password, the user is signed out and redirected to `/login`.

## Redirect safety

The `next` query parameter is sanitized server-side. Only same-site relative paths (starting with `/`) are allowed. External URLs are rejected.

## What is not included yet

- `profiles` table
- Application/project database tables
- Row Level Security for project data
- Project authorization logic

Authentication code lives under `src/lib/auth/` and is separate from future project access control.
