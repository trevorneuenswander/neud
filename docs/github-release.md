# GitHub Release Procedures (NEUD Windows)

GitHub Releases are the canonical distribution source for:

- Initial Windows installer download (Vercel portal links here)
- `electron-updater` auto-update metadata (`latest.yml`, blockmap)
- Versioned installers for traceability

The Vercel-hosted portal does **not** store a second copy of the installer.

Repository: [trevorneuenswander/neud](https://github.com/trevorneuenswander/neud)

## Download URL strategy (Option A — stable asset filename)

The website uses a **stable GitHub Release asset name** so the portal does not need redeploying on every version bump:

```text
https://github.com/trevorneuenswander/neud/releases/latest/download/NEUD-Setup-latest-x64.exe
```

Each release also publishes:

- `NEUD-Setup-{version}-x64.exe` — versioned installer (updater + traceability)
- `NEUD-Setup-{version}-x64.exe.blockmap` — differential update blockmap
- `NEUD-Setup-latest-x64.exe` — stable alias copied from the versioned installer
- `latest.yml` — auto-update feed (references the **versioned** filename)

Override for emergencies or previews:

```bash
NEXT_PUBLIC_NEUD_WINDOWS_DOWNLOAD_URL=https://github.com/trevorneuenswander/neud/releases/download/v0.1.1/NEUD-Setup-0.1.1-x64.exe
```

## Initial release v0.1.1

1. Confirm working tree is clean and release tests pass locally.
2. Ensure root and `@neud/desktop` `package.json` both say `0.1.1`.
3. Commit and push source to `main`.
4. Create annotated tag locally (optional if using Actions only): `git tag -a v0.1.1 -m "NEUD Alpha v0.1.1"`
5. Build locally:

   ```bash
   npm run build:desktop
   npm run release:win
   node desktop/scripts/prepare-release-artifacts.mjs
   ```

6. Verify artifacts under `desktop/release/`:
   - `NEUD-Setup-0.1.1-x64.exe`
   - `NEUD-Setup-0.1.1-x64.exe.blockmap`
   - `NEUD-Setup-latest-x64.exe`
   - `latest.yml` (`version: 0.1.1`, `path: NEUD-Setup-0.1.1-x64.exe`)

7. **Option A — GitHub Actions (recommended):**
   - Actions → **Release Windows** → Run workflow
   - `version`: `0.1.1`
   - `release_visibility`: `draft`
   - `prerelease`: `true`
   - Review draft release assets on GitHub

8. **Option B — Manual upload:**
   - Create draft GitHub Release tag `v0.1.1`
   - Upload all four artifacts above

9. Install `NEUD-Setup-0.1.1-x64.exe` on a clean Windows machine and run acceptance checks ([windows-release-checklist.md](./windows-release-checklist.md)).

10. **Publish** the GitHub Release (draft → published). Installed clients and `/releases/latest/download/` only work against **published** releases, not drafts.

11. Verify Vercel portal **Download Desktop** downloads from GitHub (not through a Next.js API route).

12. On an installed copy: **Settings → About NEUD → Check for Updates** should report **Up to date** when running 0.1.1 against the published release.

## Future update v0.1.4 (auto-update validation)

1. Bump root and `desktop/package.json` to `0.1.4` (no automatic version scripts).
2. Run `npm run test:neud-release-version`.
3. Commit, push, and run **Release Windows** workflow with `version: 0.1.4`.
4. Review draft release assets:
   - `NEUD-Setup-0.1.4-x64.exe`
   - `latest.yml` says `0.1.4` and `path: NEUD-Setup-0.1.4-x64.exe`
   - blockmap present
   - `NEUD-Setup-latest-x64.exe` updated
5. Publish the GitHub Release.
6. On a machine with **published 0.1.3** installed:
   - Startup update check detects 0.1.4 automatically
   - **Later** keeps the user signed in
   - **Download Update** → **Restart and Install** upgrades to 0.1.4 and requires sign-in again
   - **About NEUD** shows Alpha 0.1.4
7. Verify Vercel download serves the new stable alias (same URL, new binary).

## Future update v0.1.2

1. Bump root and `desktop/package.json` to `0.1.2` (no automatic version scripts).
2. Run `npm run test:neud-release-version`.
3. Commit, push, and run **Release Windows** workflow with `version: 0.1.2`.
4. Review draft release assets:
   - `NEUD-Setup-0.1.2-x64.exe`
   - `latest.yml` says `0.1.2` and `path: NEUD-Setup-0.1.2-x64.exe`
   - blockmap present
   - `NEUD-Setup-latest-x64.exe` updated
5. Publish the GitHub Release.
6. On a machine with 0.1.1 installed:
   - **Check for Updates** (Settings or Help)
   - Confirm download progress
   - **Later** keeps app usable
   - **Restart and Install** upgrades to 0.1.2
   - **About NEUD** shows Alpha 0.1.2
7. Verify Vercel download serves the new stable alias (same URL, new binary).

## Rollback policy

- **Do not overwrite** published release assets with different binaries under the same version.
- Fix forward with a higher version (e.g. bad 0.1.2 → ship 0.1.3).
- Users can reinstall a saved older installer manually; `%APPDATA%\NEUD\` data is preserved by default uninstall settings.

## Windows Authenticode signing (v0.1.2+)

GitHub Actions release builds support optional Authenticode signing via workflow input **Require Authenticode signing** (default: **false** for Alpha).

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64-encoded PFX or secure URL to the code-signing certificate |
| `CSC_KEY_PASSWORD` | PFX password |

The workflow sets `NEUD_REQUIRE_CODE_SIGNING=1` only when that input is enabled, and fails if signing credentials are absent or signatures do not verify.

Signing method: **traditional OV/EV PFX certificate** via electron-builder (`CSC_LINK` / `CSC_KEY_PASSWORD`). Azure Artifact Signing can be adopted later with the same release gate pattern.

Timestamping: SHA-256 digest with RFC 3161 timestamp (`http://timestamp.digicert.com`).

Optional verification override:

```bash
NEUD_CODE_SIGNING_SUBJECT="Your Legal Entity Name"
```

The Windows **Publisher** shown in file properties comes from the certificate subject (legal entity), not the NEUD product branding.

### One-time external setup

1. Obtain a publicly trusted code-signing certificate (OV recommended if EV is unavailable).
2. Export as password-protected PFX (never commit to the repository).
3. Base64-encode the PFX for GitHub Actions `CSC_LINK`, or host at a secure URL electron-builder supports.
4. Add `CSC_LINK` and `CSC_KEY_PASSWORD` as repository secrets.
5. Run **Release Windows** as draft `0.1.2`, verify signatures in Windows Properties → Digital Signatures, then publish.

## Update logout (v0.1.2+)

After **Restart and Install** completes a real version change, NEUD clears authentication and shows the login page. **Later**, failed downloads, and normal restarts do not sign the user out.

Users on published **0.1.1** (missing packaged `app-update.yml`) must manually install signed **0.1.2** once. After that, auto-update works for 0.1.2 and later.

## Auto-update notes

- `electron-updater` reads `latest.yml`, installer, and blockmap from the **published** GitHub Release.
- Draft releases are invisible to the updater and to `/releases/latest/download/`.
- Unsigned builds may trigger Windows SmartScreen / Smart App Control warnings. This is expected until Authenticode signing (`CSC_LINK`, `CSC_KEY_PASSWORD` in Actions secrets) is configured.
- Do not embed GitHub tokens in the desktop app. Publishing uses `GITHUB_TOKEN` in Actions only.

## Local build defaults

- `npm run package:win` uses `--publish never`.
- `npm run publish:win -w @neud/desktop` publishes via electron-builder (CI/manual only; requires `GH_TOKEN`).

See also: [application-updates.md](./application-updates.md), [windows-release-checklist.md](./windows-release-checklist.md).
