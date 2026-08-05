# Production migration runbook — Alpha v0.1.1 (v0.1.0 application)

**Do not apply to production until non-production validation passes and this runbook is reviewed.**

Application version remains **0.1.0**. These migrations enable secure authenticated cloud sync and publishing.

## Scope

Migrations **016 → 021**:

| Migration | Purpose |
|-----------|---------|
| 016 | Publishing foundation tables |
| 017 | Publishing RPC baseline (historical service_role grants — superseded by 018) |
| 018 | Secure authenticated publishing RPCs |
| 019 | Display, activity, directory, desktop host authenticated authorization |
| 020 | Owner/manager self-service hosted project registration |
| 021 | Registration abuse controls + `can_create_cloud_project()` entitlement hook |

## Preflight (production)

1. **Confirm production identity** — verify Supabase project ref, dashboard URL, and backup target are the intended production project (not `abtvefbwnismoqweokqu` or other test refs).
2. **Backup** Supabase project (dashboard backup + logical export of `projects`, `project_members`, `profiles`, display tables).
3. Run preflight queries:

```sql
select count(*) as projects from public.projects;
select count(*) as members from public.project_members;
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and proname like '%publisher%';
select tablename from pg_tables where schemaname = 'public' and tablename like 'display%';
```

3. Confirm desktop fleet is on Slice 2.3+ build (no service-role in packaged app).
4. Confirm Vercel production has `SUPABASE_SERVICE_ROLE_KEY` for `/api/desktop/admin/invite-user` only.
5. Schedule maintenance window if display/publishing tables are large (DDL lock risk on policy creation).
6. Check migration history on production (via `_neud_validation_migrations` if present, or manual object inventory):

```sql
select tablename from pg_tables
  where schemaname = 'public'
    and tablename in ('project_publishing_settings', 'cloud_project_registration_audit');
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and proname in ('register_hosted_project_for_desktop', 'can_create_cloud_project');
```

7. **Never apply migrations from a developer desktop package.** Use Supabase SQL editor, CI migration job, or `npm run apply:live-migrations` from a controlled operator workstation with `.env.live-validation.local` — not from packaged `NEUD.exe`.

## Apply order (non-production first, then production)

Apply via Supabase SQL editor or `supabase db push` against a **dedicated test project** first:

```text
016_project_publishing_foundation.sql
017_project_publishing_rpcs.sql
018_project_publishing_secure_auth.sql
019_desktop_authenticated_cloud_auth.sql
020_owner_project_registration.sql
021_cloud_project_registration_hardening.sql
```

Record CLI/editor output and warnings for each file.

## Post-migration validation

Run `supabase/audits/post_019_security_audit.sql` and verify:

- Publishing RPCs granted to `authenticated`, not `anon` or inappropriate roles
- No duplicate insecure function overloads remain callable
- SECURITY DEFINER functions include `set search_path = public`
- Display RLS policies exist for member/operator/manager boundaries
- `register_hosted_project_for_desktop` uses `auth.uid()` and no longer requires platform admin for **new** projects

Execute live matrix in [slice-2.3-live-validation-report.md](./slice-2.3-live-validation-report.md).

## Existing projects without hosted membership

After 018/019, cloud access requires hosted `project_members` rows.

1. Export local project UUIDs from desktop SQLite.
2. For each production project, ensure matching `projects.id` and `project_members` rows exist.
3. Use `register_hosted_project_for_desktop` from an authenticated owner/manager desktop session to align new projects.
4. For legacy hosted projects, insert missing memberships before revoking any service_role desktop paths.

| 020 | Owner/manager self-service hosted project registration |
| 021 | Registration abuse controls + `can_create_cloud_project()` entitlement hook |

## Abort criteria

Stop the production apply if any of the following occur on non-production:

- Any migration file fails mid-apply
- Post-audit shows `service_role` can execute 018 publishing RPCs
- Anonymous client can call protected RPCs
- Cross-project RLS test fails
- Live matrix reports any critical authorization failure

Do not continue to production until the repository migration is fixed and non-production re-validated.

## Operator checklist

- [ ] Non-production backup completed
- [ ] Preflight queries recorded
- [ ] Desktop fleet on Slice 2.3+ installer
- [ ] `NEUD_TRUSTED_PORTAL_ORIGIN` configured on production desktop channel
- [ ] Vercel production env has service role (server only)
- [ ] Migrations 016–021 applied on non-production
- [ ] Audit SQL output archived (no secrets)
- [ ] Live matrix JSON archived
- [ ] `NEUD_BUILD_RELEASE=1` scan passed
- [ ] Stakeholder sign-off on [slice-2.3-live-validation-report.md](./slice-2.3-live-validation-report.md)

## Migration 017 supersession

Migration **017** grants publishing RPCs to `service_role`. Migration **018** must fully replace those function bodies and revoke `service_role` execute grants. Post-apply audit must confirm:

- Final function bodies match 018/019 definitions
- No stale 017 overload remains callable
- Desktop never depends on service-role publishing path

## Slug conflicts and local-only projects

- Local SQLite projects without cloud rows: operators register via desktop using `register_hosted_project_for_desktop` after sign-in.
- Slug conflicts return `slug_conflict` — resolve before retry.
- Reserved slugs (`admin`, `login`, etc.) return `slug_reserved` (migration 021).
- Registration limits (021): max 25 owned projects per user; max 3 successful registrations per 5 minutes.
- Existing hosted projects without memberships: insert `project_members` before enabling publishing.

## Maintenance window

Recommend a short maintenance window for production apply if `displays` or `display_revisions` are large (RLS policy DDL). Publishing table creation (016) is typically fast.

## Test-user smoke test (post-apply)

1. Sign in as project manager on desktop
2. Register hosted project
3. Enable publishing
4. Acquire lease and publish snapshot
5. Sync one display change
6. Submit one allowlisted activity event
7. Fetch directory for assigned project
8. Sign out — confirm cloud sync stops

## Rollback strategy

Rollback is **forward-fix preferred** (Supabase migrations are additive).

If 018–020 must be reversed on a test environment:

1. Re-grant 017 service_role publishing RPCs only on non-production (never re-enable desktop service role).
2. Drop 019 RLS policies if they block required operations.
3. Restore previous `register_hosted_project_for_desktop` body from 018 if needed.
4. Do **not** drop audit columns once populated.

Production rollback: restore Supabase backup; revert desktop fleet to previous installer only if cloud schema incompatible.

## Go / no-go criteria

| Check | Required |
|-------|----------|
| Non-production live matrix passed | Yes |
| `post_019_security_audit.sql` clean | Yes |
| Packaged desktop release scan passed | Yes |
| No desktop startup dependency on service role | Yes |
| Vercel invite route validated on preview | Yes |
| Completed displays regression passed | Yes |
| Version remains 0.1.0 | Yes |

## Expected duration

- Migrations 016–021: typically under 5 minutes on small/medium projects
- RLS policy creation: brief table locks on `displays` / revisions
- Desktop fleet rollout: independent of SQL apply once cloud validated

## Desktop compatibility

- Minimum desktop for 018+ cloud sync: **Slice 2.2+** (authenticated cloud coordinator, no packaged service role).
- Minimum desktop for Slice 2.3 packaging: local worker without `supabase.js`; trusted portal origin for admin invites.
- Desktop builds before Slice 2.2 **must not** be used against 018+ publishing RPCs.
- Packaged desktop must set `NEUD_TRUSTED_PORTAL_ORIGIN` to production portal URL before admin invite features are used.
