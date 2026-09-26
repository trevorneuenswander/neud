# NEUD Release Versioning

NEUD uses semantic versions during Alpha.

## Displayed format

```text
Alpha MAJOR.MINOR.PATCH
```

Example: `Alpha 0.2.2`

## Published vs current development

- **Latest published release:** v0.2.2 (see [release-milestones.md](./release-milestones.md))
- **Current version:** v0.2.2 (canonical `package.json` version)

There is no published v0.1.5. Historical update path: **v0.2.0 → v0.2.1 → v0.2.2**.

## Canonical source of truth

The release version is defined once in the root package metadata:

- Root `package.json` → `"version": "0.2.2"` (**canonical**)
- `@neud/desktop` `package.json` → synchronized from root during desktop build
- `desktop/dist/package.json` → written during desktop build for Electron runtime metadata

Before publishing a packaged desktop release, update the root `package.json` version once. Desktop build scripts synchronize the desktop and dist package files automatically.

The renderer reads the root package version at Next.js startup/build time through `NEXT_PUBLIC_NEUD_APP_VERSION` in `next.config.ts`.

The desktop main process resolves the same release version from `desktop/package.json` through `getCanonicalReleaseVersion()` and exposes it to the renderer via `neud:app:getVersion`.

Do not maintain separate UI, installer, updater, or diagnostics version strings.

## What does not change the displayed version

The displayed release version must **not** change because of:

- local source edits
- `npm run dev:desktop`
- local development builds
- test runs
- Git commits
- timestamps, build dates, Git hashes, or commit counts

The version changes only when Trevor intentionally updates the canonical package version for a new packaged release.

## Release workflow

Before publishing a packaged release:

1. Choose the new semantic version.
2. Update the canonical package version once in root and `@neud/desktop` `package.json`.
3. Build and validate the packaged application.
4. Publish the installer/update.
5. Confirm the installed app displays the new Alpha version.

Do not add automatic version bumps to normal development or build scripts.

## Semantic meaning during Alpha

### PATCH

Bug fixes or small improvements that do not materially change workflows.

### MINOR

New features or meaningful workflow additions during Alpha.

### MAJOR

Large compatibility, architecture, or product-stage changes.

## Implementation map

| Layer | Source |
| --- | --- |
| Canonical release version | Root `package.json` |
| Formatting | `src/lib/version/app-version.ts` → `getDisplayVersion()` |
| Renderer fallback | `NEXT_PUBLIC_NEUD_APP_VERSION` from root `package.json` |
| Desktop runtime | `getCanonicalReleaseVersion()` → `neud:app:getVersion` |
| Electron metadata | `desktop/dist/package.json` synchronized on desktop build |

## Out of scope for this document

- Detailed installer publishing steps — see [windows-packaging.md](./windows-packaging.md)
- Update delivery mechanics — see [application-updates.md](./application-updates.md)
