# Alpha v0.1.1 Packaging Validation

This document records the packaging milestone that follows the completed Alpha v0.1.1 functional baseline.

## Completed Alpha v0.1.1 (functional baseline)

- Local-first Electron desktop application
- SQLite runtime and local HTTP API
- Broad Arrow scraper workflow and four locked displays
- Secure cloud publishing without desktop service-role keys
- Hosted portal online delivery (Alpha v0.1.1 online slices)

## Current release milestone

| Item | Status |
|------|--------|
| Windows x64 NSIS installer | Implemented |
| Bundled Puppeteer-compatible Chrome | Implemented |
| Centralized browser path resolver | Implemented |
| Packaged browser verification scripts | Implemented |
| Packaged app smoke test | Implemented |
| electron-updater auto-update | Implemented |
| Settings Check for Updates | Implemented |
| Help menu Check for Updates | Implemented |
| GitHub draft release configuration | Implemented |
| GitHub Actions release workflow | See `.github/workflows/release-windows.yml` |
| README NEUD migration | Implemented |
| Code-signing preparation | Configured; signing optional for local tests |

## Beta (deferred)

These items are **not** part of the current milestone:

- Online JSON Viewer (full product feature)
- Browser-based controller
- Multi-computer synchronization
- macOS support

## Automated validation commands

```bash
npm run test:neud-release-version
npm run test:neud-packaged-browser
npm run test:neud-auto-update
npm run test:neud-readme-branding
npm run verify:bundled-browser
npm run verify:win-package
npm run smoke:packaged-app
```

With release security gate:

```bash
set NEUD_BUILD_RELEASE=1
npm run test:neud-release-security
```

## Expected bundled browser proof

After `npm run package:win`:

```text
desktop/release/win-unpacked/resources/puppeteer/chrome/chrome-win64/chrome.exe
```

Smoke test launches this binary headlessly and verifies page content.

## Version canonical source

`package.json` (root) version **0.1.1** is canonical. Desktop build synchronizes `@neud/desktop` and `desktop/dist/package.json`.

Next release example: bump to **0.1.2** once, rebuild, publish draft GitHub Release artifacts.

## Remaining risks

- Unsigned installers trigger SmartScreen until Authenticode signing is configured
- Update feed requires a published GitHub Release with `latest.yml`
- Full second-computer validation requires manual execution on hardware without dev tools
