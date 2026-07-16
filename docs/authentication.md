# Authentication

HMG Graphics Server uses Supabase email/password authentication with cookie-based sessions and the `@supabase/ssr` package.

Public self-service signup is disabled. New users request access, are reviewed by a platform administrator, and receive an email invitation to set a password.

## Authorization model

### Layer 1: Platform roles (`profiles.role`)

| Role | Purpose |
|------|---------|
| `owner` | Full platform control; may access all projects (future) |
| `admin` | Platform administration; may access all projects (future) |
| `user` | General portal access only |

Platform roles control portal administration. They do **not** automatically grant access to individual graphics projects.

### Layer 2: Project memberships (future `project_members`)

| Access level | Purpose |
|--------------|---------|
| `manager` | Manage a specific graphics project |
| `operator` | Operate a specific graphics project |
| `viewer` | View a specific graphics project |

Newly invited users receive `profiles.role = 'user'` with **no** project memberships. They can sign in to the portal but cannot access any graphics project until an owner or admin assigns them.

Future server-side helpers:

- `requireProjectAccess(projectId)`
- `requireProjectRole(projectId, allowedRoles)`

Every project page, query, and Server Action must verify project membership on the server. Navigation visibility alone is not authorization.

## Environment variables

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

- Public keys are used by the browser and server session client.
- The service-role key is used only in server-only modules for access-request inserts and invitation sending.
- Never expose the service-role key to the browser.

## Database setup

### 1. Apply the migration

Run the SQL in `supabase/migrations/001_access_requests_and_profiles.sql` in the Supabase SQL editor.

### 2. Disable public signup

In **Authentication → Providers → Email**, disable public signups so only invited users can create accounts.

### 3. Create the first owner profile

After the owner account exists in `auth.users`, run:

```sql
insert into public.profiles (id, full_name, company, role)
values (
  'USER_UUID',
  'Owner Full Name',
  'Owner Company',
  'owner'
)
on conflict (id) do update
  set role = 'owner',
      full_name = excluded.full_name,
      company = excluded.company,
      updated_at = now();
```

Replace `USER_UUID` with the UUID from **Authentication → Users** in the Supabase dashboard. Do not hardcode email addresses in application source.

## Supabase dashboard configuration

### Redirect URLs

In **Authentication → URL Configuration**:

| Setting | Local development | Production |
|---------|-------------------|------------|
| Site URL | `http://localhost:3000` | Your deployed site URL |

Add these **Redirect URLs**:

```
http://localhost:3000/auth/confirm
http://localhost:3000/**
https://your-domain.com/auth/confirm
https://your-domain.com/**
```

### Email templates

HMG Graphics Server supports two invitation link formats. **This project uses Format A** (custom token-hash link in the **Invite user** template). Format B is also supported if you prefer Supabase's built-in `{{ .ConfirmationURL }}`.

Public self-service signup is disabled. Do not use the **Confirm signup** template for invitations.

#### Format A — custom token-hash link (recommended for this project)

Use the **Invite user** email template in **Authentication → Email Templates**.

`inviteUserByEmail()` sends `redirectTo` as:

```
{origin}/auth/confirm?next=/accept-invitation
```

The email template must supply the invitation token and type:

```html
<h2>You have been invited</h2>
<p>You have been invited to create a user on {{ .SiteURL }}.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invitation">
    Accept the invitation
  </a>
</p>
```

The application verifies the token at `/auth/confirm` with:

```ts
await supabase.auth.verifyOtp({
  token_hash,
  type: "invite",
});
```

Both `token_hash` and `type=invite` are required. The `type` must come from the email template, not from `redirectTo`.

#### Format B — Supabase `{{ .ConfirmationURL }}`

Alternatively, the **Invite user** template may use Supabase's generated confirmation URL:

```html
<h2>You have been invited</h2>
<p>You have been invited to create a user on {{ .SiteURL }}.</p>
<p><a href="{{ .ConfirmationURL }}">Accept the invitation</a></p>
```

Supabase verifies the token at `/auth/v1/verify`, then redirects the browser to the configured `redirectTo`:

```
{origin}/auth/confirm?next=/accept-invitation
```

Session tokens arrive in the URL hash fragment. `/auth/confirm` establishes the browser session client-side, sets the short-lived `hmg-invite-session` cookie, and redirects to `/accept-invitation`.

`inviteUserByEmail()` does not use PKCE for normal cross-browser invitation email links.

#### Password reset template

Use the **Reset password** template with a recovery token-hash link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/update-password">
  Reset password
</a>
```

Or use `{{ .ConfirmationURL }}` with `redirectTo` set to `{origin}/auth/confirm?next=/update-password`.

`{{ .SiteURL }}` is configured in **Authentication → URL Configuration**.

#### Invitation errors

| Login error | Meaning |
|-------------|---------|
| `invitation-invalid` | Invitation token missing, expired, or verification failed |
| `invite-required` | `/accept-invitation` opened without a valid invitation session |
| `confirmation-failed` | Non-invitation email confirmation or recovery verification failed |

## Access request workflow

1. Visitor submits the form at `/request-access`.
2. A server action validates input and inserts a `pending` row via the service-role client.
3. No Supabase Auth user is created. No password is collected.
4. A platform admin reviews requests at `/admin/access-requests`.
5. On approval, the server sends `inviteUserByEmail()` and marks the request `approved`.
6. On rejection, the request is marked `rejected` with no invitation sent.
7. The invited user opens the email link, verifies the token at `/auth/confirm`, and sets a password at `/accept-invitation`.
8. The user can then log in and access general portal routes. Project access is assigned separately in a future phase.

## Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/request-access` | Public | Submit an access request |
| `/request-access/submitted` | Public | Post-submission confirmation |
| `/signup` | Public | Redirects to `/request-access` |
| `/login` | Public | Sign in |
| `/forgot-password` | Public | Request password reset |
| `/auth/confirm` | Public | Verify invitation, recovery, or confirmation tokens |
| `/accept-invitation` | Invite session only | Set password after invitation |
| `/update-password` | Recovery session only | Set password after reset |
| `/admin/access-requests` | Owner or admin | Review, approve, and reject requests |
| `/dashboard`, `/projects/*` | Authenticated | General portal routes |

## Security notes

- Anonymous users cannot directly read or write `access_requests` via RLS.
- Admin pages and actions call `requireAdmin()`, which reads `profiles.role` from the database.
- Approval uses the service-role client only after verifying the current user is an owner or admin.
- If invitation sending fails, the request remains `pending`.
- The `next` query parameter is sanitized to internal paths only.

## Local testing sequence

1. Apply the migration.
2. Add all environment variables to `.env.local`.
3. Disable public signup in Supabase.
4. Configure invite and redirect URLs.
5. Create the first owner profile via SQL.
6. Run `npm run dev`.
7. Submit a request at `/request-access` — confirm no Auth user is created.
8. Log in as a regular user — confirm `/admin/access-requests` is blocked.
9. Log in as owner/admin — approve a request — confirm invitation email is sent.
10. Open the invitation link — set password at `/accept-invitation` — access `/dashboard`.
11. Reject a second request — confirm no invitation is sent.
12. Confirm `/signup` redirects to `/request-access`.
13. Confirm password reset still works for approved users.
