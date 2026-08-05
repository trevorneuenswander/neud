# NEUD Access Management — Current Architecture (Diagnosis)

Generated for Alpha v0.1.1 root-cause analysis. Describes **today’s** behavior, not a target design.

## Summary

| Surface | Route | UI | Backend |
|---------|-------|-----|---------|
| **Desktop** | `/users` | `LocalUsersAccessClient` — Teams, Users, Project Access, Invitations tabs | Electron local API `/api/access/*` → SQLite |
| **Hosted portal** | `/portal/users` | `HostedUsersDirectory` — read-only list + permission disclosure | Supabase RPC `get_platform_users_directory` |
| **Legacy hosted (blocked on Vercel)** | `/users` | `InviteUserForm` + `UsersTable` | Server actions in `src/lib/users/actions.ts` |

The hosted portal **never shipped** the tabbed access UI. `/users` is marked desktop-only in `hosted-routes.ts` and redirects on Vercel.

---

## Desktop Implementation

### UI

**Component:** `src/components/users/LocalUsersAccessClient.tsx`

**Tabs:** `teams` | `users` | `projects` | `invitations`

| Tab | Owner | Team admin | Capabilities |
|-----|-------|------------|--------------|
| Teams | Yes | Hidden | Create, rename, deactivate teams |
| Users | Yes | Scoped teams | List, invite, activate/deactivate users in scope |
| Project Access | Yes | Scoped teams | Link teams to projects; assign/remove project user roles |
| Invitations | Yes | Scoped teams | View/resend pending local invitations |

**Data load:** `localGetAccessDirectory()` → `GET /api/access/directory`

**Detail route:** `/users/[userId]` → `UserDetailsClient` (desktop only)

### Local API (`desktop/src/services/local-api-server.ts`)

Delegated to `AccessManagementService` (`desktop/src/services/access-management-service.ts`).

| Endpoint | Action |
|----------|--------|
| `GET /api/access/directory` | Full directory (teams, users, projects, invitations) |
| `POST /api/access/teams` | Create team |
| `PATCH /api/access/teams/:id` | Update team |
| `POST /api/access/invite` | Invite user (local record + optional Supabase auth invite) |
| `POST /api/access/team-members` | Upsert team membership |
| `POST/DELETE /api/access/project-assignments` | Project user roles |
| `PUT /api/access/projects/teams` | Project ↔ team links |
| `GET/PATCH /api/access/users/:id` | User detail / activate-deactivate |
| `POST /api/access/sync-users` | Pull Supabase directory into SQLite |

**Authorization:** `AccessAuthorizationService` (`desktop/src/services/access-authorization-service.ts`)

- **Platform role** (`local_users.platform_role`): `owner` | `user`
- **Team role** (`team_memberships.role`): `admin` | `operator` | `viewer`
- Owner: all teams, all projects, create teams
- Team admin: manage users/access within assigned teams and their projects
- Operator/viewer: project-scoped via team + `project_team_assignments`

### Desktop SQLite schema

| Migration | Tables |
|-----------|--------|
| `014_teams_and_access.sql` | `teams`, `team_memberships`, `project_memberships`, `local_invitations`, `local_users` |
| `015_project_team_assignments.sql` | `project_team_assignments` |

Teams are **first-class entities** locally.

---

## Hosted Portal Implementation

### UI

**Route:** `src/app/portal/users/page.tsx`

- `requireAdmin()` — Supabase `profiles.role` must be `owner` or `admin`
- `getPlatformUsersDirectory()` → RPC `get_platform_users_directory`
- Renders `HostedUsersDirectory` (search, filters, expandable Team/Project permission panels)

**No tabs.** No invite form. No team CRUD. No project-team matrix. No invitations list.

### Hosted nav

`src/lib/portal/hosted-navigation.ts` → Users link to `/portal/users` only when `isAdmin()` (platform owner/admin).

Team admins (desktop concept) **do not exist** in Supabase model — they never see Users nav on hosted.

---

## Supabase Schema (cloud)

**Highest migration:** `031_project_display_sort_order.sql`

### Relevant tables

| Table | Notes |
|-------|-------|
| `profiles` | Platform role: `owner` \| `admin` \| `operator` \| `viewer`. **`team text`** — display label only (migration 015), not normalized membership |
| `project_members` | `access_level`: `manager` \| `operator` \| `viewer` — direct user ↔ project, no team scope |
| `access_requests` | Self-service requests |
| `auth_audit_log` | Audit events |

**Missing in Supabase:** `teams`, `team_memberships`, `project_team_assignments`, `invitations` (pending invite table).

### Read RPCs

| RPC | Gate | Used by |
|-----|------|---------|
| `get_platform_users_directory()` | `is_platform_admin()` | Hosted users page |
| `get_authorized_users_directory()` | `is_platform_admin()` | Desktop user sync |
| `get_accessible_project_users_directory()` | Project member | Desktop sync (non-admin) |
| `get_project_members_directory(p_project_id)` | Admin or project manager | Project pages |
| `get_assignable_users_for_project(p_project_id)` | Admin or project manager | Assignment UI |

**No mutation RPCs** for teams, invitations, or team-scoped access.

### Hosted mutation paths (flat model)

| Action | Path |
|--------|------|
| Invite user | Server action `invitePlatformUser` — admin client, flat role + text `team` field |
| Assign project | `assignUserToProject` / `removeUserFromProject` — direct `project_members` |
| Change role | `updatePlatformUserRole` |
| Delete user | `deletePlatformUser` |
| Desktop bridge invite | `POST /api/desktop/admin/invite-user` — service role on Vercel, verified desktop session |

---

## Permission Models Compared

### Supabase (hosted)

| Role | Admin? | User mgmt | Project access |
|------|--------|-----------|----------------|
| Owner | Yes | Full | All projects |
| Admin | Yes | Invite; edit operator/viewer | All projects |
| Operator | No | None | Via `project_members` only |
| Viewer | No | None | Via `project_members` only |

Project level: `manager` can manage members for that project.

### Desktop (local)

| Layer | Values |
|-------|--------|
| Platform | `owner` \| `user` |
| Team | `admin` \| `operator` \| `viewer` |

Team admin can manage users within team scope without being platform admin.

**These models are not equivalent.**

---

## Permission Matrix (intended product vs today)

Legend: **Y** = supported today, **N** = not supported, **P** = partial

| Action | Owner | Admin | Operator | Viewer | Enforcement today |
|--------|-------|-------|----------|--------|-------------------|
| List teams | P (desktop) | P (desktop) | N | N | Local API only |
| Create team | Y (desktop owner) | N | N | N | Local API |
| Invite user | Y | Y (hosted flat) | N | N | Local API / server action |
| Assign platform role | Y | P (not owner) | N | N | Server action + RLS |
| Assign team role | Y (desktop) | P (team admin) | N | N | Local API only |
| Assign project | Y | Y | N | N | Server action / local API |
| Change project role | Y | Y | N | N | `project_members` |
| Remove project access | Y | Y | N | N | Server action |
| Revoke invitation | Y (desktop local) | N (hosted) | N | N | Local invitations only |
| Deactivate user | Y | P | N | N | Local PATCH / server action |

---

## Mutation Path Inventory

| Path | Client | Auth | Service role? |
|------|--------|------|---------------|
| Local `/api/access/*` | Desktop Electron | Session + local authz | No |
| Server actions `src/lib/users/actions.ts` | Hosted (admin pages) | Cookie session + admin check | Yes (admin client) |
| `POST /api/desktop/admin/invite-user` | Desktop → Vercel | Verified desktop session | Yes |
| Supabase RPCs (029–031) | Authenticated | SECURITY DEFINER + membership | No |

---

## Recommended Shared Architecture (future — not implemented)

1. **Cloud source of truth:** Add Supabase `teams`, `team_memberships`, `project_team_assignments`, `invitations`.
2. **Shared read RPC:** `get_access_directory()` scoped by caller (owner sees all; team admin sees teams).
3. **Shared mutation RPCs:** Team CRUD, membership, project links — mirror `AccessManagementService` rules.
4. **Clients:** Refactor `LocalUsersAccessClient` to use `@/lib/access/cloud-api.ts` on hosted; desktop syncs SQLite from cloud.
5. **Invites:** Trusted server route for `auth.admin.inviteUserByEmail`; persist team context in `invitations` table.
6. **No service role in Electron renderer.**

### Proposed additive migration sequence (after 031)

| # | Name | Scope |
|---|------|-------|
| 032 | `teams_foundation.sql` | `teams`, `team_memberships`, RLS |
| 033 | `project_team_assignments.sql` | Project ↔ team M:N |
| 034 | `cloud_invitations.sql` | Pending invitations |
| 035 | `access_directory_rpcs.sql` | Scoped directory read |
| 036 | `access_mutation_rpcs.sql` | Team/membership/project mutations |
| 037 | `profiles_team_normalization.sql` | Optional text → relational migration |

---

## Security Requirements (for future implementation)

- SECURITY DEFINER RPCs with explicit `auth.uid()` checks
- Grants: authenticated only; revoke anon/service_role on user-facing RPCs
- Team admin scope: no cross-team leakage
- Last-owner protection on role demotion
- Invitation replay / expiry handling
- Activity events for every mutation
- Service role only on Vercel server routes for Auth Admin operations

---

## Root Cause (why hosted lacks tabs)

1. Tabbed UI is bound to **local-only API** (`@/lib/local/access-api.ts`).
2. Supabase has **no team entities** — only `profiles.team` text.
3. Hosted Alpha scope shipped **read-only user directory** for platform admins.
4. Legacy `/users` management is **redirected away** on Vercel.
5. Desktop and cloud use **different permission hierarchies**.

Closing the gap requires schema + RPCs + UI refactor — not a styling pass.
