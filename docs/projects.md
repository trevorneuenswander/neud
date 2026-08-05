# Projects

Projects are the top-level production workspaces in NEUD. A Project may later contain displays, controllers, workers, members, settings, and activity.

The user-facing term is **Projects** (not Graphics).

## Identifiers

Each Project has three identifiers with different purposes:

| Identifier | Example | Purpose |
|------------|---------|---------|
| **UUID** (`id`) | `a1b2c3d4-...` | Database relationships, authorization, Server Actions, RLS, workers, and displays. Never shown in user-facing URLs. |
| **Project number** (`project_number`) | `14` | Human-readable sequential label for operators and UI display only, e.g. **Project 14**. Not used for authorization. |
| **Slug** (`slug`) | `broad-arrow-las-vegas` | Stable URL segment for user-facing routes, e.g. `/projects/broad-arrow-las-vegas`. |

Project numbers come from `public.project_number_seq`. Slugs are generated server-side from the Project name at creation and do not change automatically when the name changes.

## Data type enum

The user-facing term is **Data Type**. Values are stored in the PostgreSQL `project_type` enum column (internal name unchanged for compatibility):

```sql
-- Migration 002
create type public.project_type as enum ('bag-graphics');

-- Migration 003
alter type public.project_type add value 'webpage-scraper';
alter type public.project_type add value 'json-ingest';
alter type public.project_type add value 'google-sheet-ingest';
```

| Stored value | User-facing label |
|--------------|-------------------|
| `webpage-scraper` | Webpage Scraper |
| `json-ingest` | JSON Ingest |
| `google-sheet-ingest` | Google Sheet Ingest |
| `bag-graphics` | BAG-Graphics (legacy; retained for existing Projects) |

New Project creation offers only the three data-ingestion types. Adding a new data type requires an explicit enum migration.

## Schema

### `projects`

Key columns:

- `project_number` — sequential display number
- `owner_id` — references `auth.users`
- `name`, `slug`, `description`
- `project_type` — `public.project_type` enum (user-facing label: **Data type**)
- `status` — `draft`, `active`, `maintenance`, or `archived`
- `display_token` — internal UUID for future read-only OBS display URLs (not shown in general UI)
- Branding: `theme`, `logo_url`, `primary_color`, `secondary_color`, `icon`
- `settings` — JSON default `{"workers": {}}`
- `metadata` — JSON default `{}`
- `archived_at` — set when status is `archived`

Constraints enforce name length, slug format, status values, and optional hex branding colors (`#RRGGBB`).

### `project_members`

Composite primary key `(project_id, user_id)` with `access_level`:

| Level | Purpose |
|-------|---------|
| `manager` | Manage Project settings and members |
| `operator` | Operate Project controllers (future) |
| `viewer` | View Project data (future) |

The `admin` access level is a **server-side authorization sentinel** for platform owners/admins. It is not stored in `project_members`.

## Branding fields

Branding fields remain in the schema for future displays but are **not exposed** on the New Project form. Creation supplies safe defaults internally:

- `theme` → `default`
- `icon` → `folder`
- `logo_url`, `primary_color`, `secondary_color` → `null`

Existing Projects retain any stored branding values. The overview page may display configured branding metadata.

## Authorization layers

### Platform roles (`profiles`)

Owners and admins may access all Projects and bypass membership checks. They receive access level `admin` in server-side helpers.

### Project memberships (`project_members`)

Regular users require a `project_members` row to access a Project. Approved portal users are **not** automatically assigned to any Project when invited.

### Server-side helpers

`src/lib/projects/authorization.ts`:

- `getProjectAccess(slug)` — resolve Project and return access context, or `null`
- `requireProjectAccess(slug)` — `notFound()` when unauthorized (does not reveal private Projects)
- `requireProjectRole(slug, roles)` — role-gated access
- `canManageProjectMembers(slug)` — whether current user may manage members
- `requireProjectMemberManagement(slug)` — manager or platform admin only
- `requireProjectCreationAccess()` — platform owner/admin only

Never trust slug, UUID, membership level, or target user ID from the browser. Resolve and verify everything on the server against Supabase.

## Row Level Security

RLS is enabled on `projects` and `project_members`.

### `projects`

| Operation | Allowed |
|-----------|---------|
| SELECT | Platform owner/admin, or Project member |
| INSERT | Platform owner/admin only |
| UPDATE | Platform owner/admin, or Project manager |
| DELETE | No direct policy (archive instead of hard delete) |

### `project_members`

| Operation | Allowed |
|-----------|---------|
| SELECT | Platform owner/admin (all); managers (all for their Projects); operators/viewers (own row only) |
| INSERT / UPDATE / DELETE | Platform owner/admin, or Project manager |

All mutations are subject to last-manager protection.

### Database helpers

- `is_project_member(project_id)`
- `get_project_access_level(project_id)`
- `is_project_manager(project_id)`
- `count_project_managers(project_id)`

## Transactional Project creation

`create_project_with_manager()`:

1. Verifies caller is platform owner/admin
2. Inserts Project with `owner_id = auth.uid()`
3. Inserts creator as `manager` in `project_members`
4. Rolls back on any failure

Called from the `createProject` Server Action. Normal users cannot access `/projects/new`.

## Last-manager protection

A Project must always retain at least one `manager`:

- **Application layer** — Server Actions count managers before demotion or removal
- **Database layer** — `enforce_project_manager_minimum()` trigger blocks deleting or demoting the final manager

## Slug generation

Slugs are generated server-side from the Project name:

1. Lowercase and trim
2. Replace spaces and separators with hyphens
3. Remove unsupported characters
4. Collapse repeated hyphens
5. Remove leading/trailing hyphens
6. Append numeric suffix if needed (`-2`, `-3`, …) for uniqueness

The creation form does not accept a browser-supplied slug.

## URL structure

```
/projects                          — list (authorized Projects only)
/projects/new                      — create (owner/admin only)
/projects/[slug]                   — overview
/projects/[slug]/members           — member management
/projects/[slug]/displays          — placeholder
/projects/[slug]/controllers       — placeholder
/projects/[slug]/workers           — placeholder
/projects/[slug]/activity          — placeholder
/projects/[slug]/settings          — placeholder
```

Search: `?q=` or `?query=` on `/projects`.

## Creation flow

1. Owner/admin opens `/projects/new`
2. Submits Project name, description, and **Data type**
3. Server validates input and generates a unique slug
4. Branding defaults are applied internally (`theme`, `icon`, null colors/logo)
5. `create_project_with_manager()` creates Project and manager membership
6. Redirect to `/projects/[slug]`

No displays, workers, controllers, or ingestion records are created in this phase.

## Future: display token

`display_token` is unique and internal. It will eventually support read-only OBS/vMix display URLs. It is not shown on list pages in this phase.

## Future: BAG-Graphics relationship

A Project with `project_type = 'bag-graphics'` will later connect to BAG-specific controllers, displays, and workers under `src/graphics/bag-graphics/` and `workers/bag-graphics/`. This phase stores the type and workspace only.

## Migration

Apply in order:

```
supabase/migrations/001_access_requests_and_profiles.sql
supabase/migrations/002_projects_and_members.sql
supabase/migrations/003_project_data_types.sql
```

See [authentication.md](./authentication.md) for Supabase setup.
