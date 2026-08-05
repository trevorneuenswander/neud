# Alpha v0.1.1 — Manual Validation Checklist

Use this checklist after applying migration **024** locally in the repository and before production promotion. Only steps that require your credentials, live services, or visual judgment are listed here.

## A. Supabase manual steps

1. Confirm `.env.local` (or your live validation env file) points at the **non-production** Supabase project — not production.
2. Apply pending migrations including 024:

```powershell
cd C:\Users\Trevor\Desktop\Neud
npm run apply:live-migrations
```

3. Run the post-migration security audit:

```powershell
cd C:\Users\Trevor\Desktop\Neud
npm run audit:live-security
```

4. Run the live validation matrix (RPC authorization, publishing, activity allowlist):

```powershell
cd C:\Users\Trevor\Desktop\Neud
npm run test:live-validation
```

5. In Supabase SQL Editor (non-production), spot-check:
   - `get_online_display_viewer_bundle` returns `not_found` for a private display when called as anon.
   - Same RPC returns `viewer_ready` for an enabled **public** display with `online_published_revision_id` set.
   - `list_online_project_displays` fails for anon and succeeds for a project Viewer.

## B. Desktop manual steps

1. Start the desktop app against non-production Supabase:

```powershell
cd C:\Users\Trevor\Desktop\Neud
npm run dev:desktop
```

2. Sign in with a project Operator account.
3. Open a project display editor and enable **Online Viewer** on **one** display only.
4. Confirm other displays remain unavailable in the hosted portal listing.
5. Toggle **Private** vs **Public** and confirm Activity shows:
   - `display.online_viewer_enabled` / `display.online_viewer_disabled`
   - `display.online_visibility_changed` (when applicable)
6. Confirm local display preview and Broad Arrow Stream Bid / Stream Ticker outputs are unchanged.
7. Confirm `/projects/{slug}/canonical` still redirects to project overview (Public Canonical JSON deferred).
8. Disable Online Viewer and confirm hosted viewer returns “not published” on next load.

## C. Vercel Preview manual steps

### Why Preview is deployed from the local working tree (temporary)

Alpha v0.1.1 still contains substantial uncommitted work in the local repository. GitHub `main` currently points at an older baseline that does **not** include the hosted portal viewer routes, Online Viewer UI, and related migrations. Deploying with `npx vercel --archive=tgz` uploads the **exact local tree** you are validating without promoting unfinished work to GitHub or production.

- Production is **not** changed during this validation pass.
- Preview URLs must match the deployment you just uploaded — update `NEUD_TRUSTED_PORTAL_ORIGIN` and `NEXT_PUBLIC_NEUD_TRUSTED_PORTAL_ORIGIN` to that Preview origin after each deploy.
- Do **not** treat manual local uploads as the permanent release workflow.

### Intended workflow once Alpha v0.1.1 is stable

1. Finish feature work locally
2. Run tests and builds (`npm run build`, desktop build, validation suites)
3. Commit to an Alpha v0.1.1 feature/release branch
4. Push the branch to GitHub
5. Let Vercel create an automatic Preview from the branch
6. Validate Preview against the same checklist below
7. Merge after approval
8. Deploy production only after explicit sign-off

### Deploy and verify Preview

1. Ensure preview env has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set; **`NEUD_USE_LOCAL_DATA` must be unset** on hosted preview.
2. Deploy **Preview only** (not production):

```powershell
cd C:\Users\Trevor\Desktop\Neud
npx vercel --archive=tgz
```

3. Do **not** pass `--prod`.
4. On the preview URL, verify:
   - `/` marketing home loads
   - `/login` → `/portal` after sign-in
   - Desktop-only routes (e.g. `/projects/.../data-engines`) redirect to `/portal`
   - Private viewer: `/portal/projects/{slug}/displays/{displaySlug}` requires auth
   - Public viewer: `/view/{projectSlug}/{displaySlug}` works without login for a public display
5. Visual check: hosted display renders at correct aspect ratio (1920×1080 or 3840×2160), transparent background, live updates without full iframe reload on each poll, stale banner when desktop publishing stops.

## D. Production promotion gate

Do **not** promote until all items below are true:

- [ ] Non-production Supabase: migrations 016–024 applied; `audit:live-security` clean; `test:live-validation` passed
- [ ] Vercel Preview: hosted portal, public/private viewers, and stale/offline states validated visually
- [ ] Desktop packaged build tested with online viewer enable/disable/sync
- [ ] Application version remains **0.1.0** until explicit release sign-off
- [ ] Broad Arrow finalized display visuals verified unchanged
- [ ] Public Canonical JSON route remains deferred
- [ ] Remote browser control remains deferred to Beta
- [ ] Installer delivery still pending (separate milestone)
- [ ] Production migration runbook reviewed: [production-migration-runbook-v0.1.1.md](./production-migration-runbook-v0.1.1.md)

Production deploy (when approved):

```powershell
cd C:\Users\Trevor\Desktop\Neud
npx vercel --archive=tgz --prod
```

Only run the production command after explicit approval — **not** as part of Alpha v0.1.1 preview validation.
