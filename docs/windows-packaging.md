# Windows Packaging

NEUD ships as a Windows x64 NSIS installer built with **electron-builder**.

## Prerequisites (developers only)

- Node.js 20+
- npm 10+
- Windows 10/11 x64

Packaged end users do **not** need Node.js, npm, Git, or a separate Chrome installation.

## Build commands

```bash
npm ci
npm run build:desktop
npm run package:win
```

| Script | Purpose |
|--------|---------|
| `npm run build:desktop` | Web build, stage standalone assets, stage bundled Chrome, compile desktop TypeScript |
| `npm run package:win` | Full build plus NSIS installer generation |
| `npm run verify:bundled-browser` | Verify Chrome exists outside `app.asar` |
| `npm run verify:win-package` | Secret scan, installer artifact checks |
| `npm run smoke:packaged-app` | Headless launch of bundled Chrome |
| `npm run release:win` | Package + all verification scripts |

## Output artifacts

```text
desktop/release/win-unpacked/NEUD.exe
desktop/release/NEUD-Setup-<version>-x64.exe
desktop/release/latest.yml
desktop/release/*.blockmap
```

## Installer configuration

Configuration lives in `desktop/electron-builder.yml`:

- **App ID:** `com.hildreths.neud`
- **Product name:** NEUD
- **Target:** NSIS, x64
- **Install scope:** per-user (default)
- **Shortcuts:** Desktop and Start Menu
- **User data:** preserved on upgrade and uninstall (`deleteAppDataOnUninstall: false`)
- **ASAR:** enabled; bundled Chrome is **not** inside ASAR (see `extraResources`)

## Bundled resources

| Resource | Installed path |
|----------|----------------|
| Puppeteer Chrome | `resources/puppeteer/chrome/chrome-win64/` |
| Staged standalone runtime | `resources/staging/` |
| SQL.js WASM | `resources/database/assets/sql-wasm.wasm` |

## Code signing

Production releases should be Authenticode-signed. Unsigned local test builds are permitted but will trigger Windows SmartScreen warnings.

Configure signing through CI secrets or environment variables:

- `CSC_LINK` — path or base64-encoded certificate
- `CSC_KEY_PASSWORD` — certificate password

Do not commit certificate files or passwords to the repository.

When signing is required in CI, add a release-mode check that fails if signing was expected but did not occur.

## Publishing

electron-builder is configured for **draft** GitHub Releases:

```yaml
publish:
  provider: github
  owner: trevorneuenswander
  repo: neud
  releaseType: draft
```

Publishing is intentional and separate from local builds. No GitHub token is embedded in the installed application.

## Second-computer validation

See [windows-release-checklist.md](./windows-release-checklist.md) and [alpha-v0.1.1-packaging-validation.md](./alpha-v0.1.1-packaging-validation.md).
