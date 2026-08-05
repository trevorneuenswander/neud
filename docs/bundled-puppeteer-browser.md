# Bundled Puppeteer Browser

Packaged NEUD Windows releases include a **Chrome for Testing** build compatible with the pinned Puppeteer version. The installed app never depends on system Chrome, Edge, or a developer-machine Puppeteer cache.

## Pinned versions

| Component | Source |
|-----------|--------|
| Puppeteer | `workers/data-engine/package.json` |
| Expected Chrome | Reported by `puppeteer` at staging time (currently Chrome **141.0.7390.54** with Puppeteer **24.23.0**) |

## Acquisition and staging

During `npm run build:desktop`, `desktop/scripts/stage-standalone.mjs` calls `stage-packaged-browser.mjs`, which:

1. Reads the Puppeteer version from the data-engine workspace.
2. Locates or downloads the matching Chrome for Testing build into the Puppeteer cache.
3. Copies the **complete** browser directory into:

```text
desktop/staging/puppeteer/chrome/chrome-win64/
```

electron-builder copies that directory into the installer via `extraResources`:

```yaml
extraResources:
  - from: staging/puppeteer/chrome
    to: puppeteer/chrome
```

## Installed location

```text
{InstallDir}\resources\puppeteer\chrome\chrome-win64\chrome.exe
```

The browser directory must remain **outside** `app.asar`.

## Path resolution

Central module: `workers/data-engine/src/browser/resolve-puppeteer-browser.js`

| Mode | Resolution |
|------|------------|
| Packaged production | `process.env.NEUD_RESOURCES_PATH` → `puppeteer/chrome/chrome-win64/chrome.exe` |
| Development | Puppeteer cache or controlled dev fallback (documented in module) |

Packaged production **never** falls back to system Chrome.

The desktop engine manager sets `NEUD_RESOURCES_PATH` and `NEUD_PACKAGED=1` when spawning scraper workers.

All scraper launches go through:

- `resolvePuppeteerBrowser()`
- `buildPuppeteerLaunchOptions()`

## Browser user data

Browser profiles and temporary files live under writable NEUD AppData paths, not under Program Files or packaged resources.

## Validation

```bash
npm run verify:bundled-browser
npm run smoke:packaged-app
npm run test:neud-packaged-browser
```

Validation confirms:

- Executable and supporting files exist
- Browser is outside `app.asar`
- Headless launch succeeds
- Resolver does not reference developer home directories or `node_modules/.cache` in production

## Diagnostics

When launch fails in packaged mode, errors include:

- Whether the app is packaged
- Expected browser path
- Whether the path exists
- Puppeteer version
- Application version
