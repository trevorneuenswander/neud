# NEUD

NEUD is a local-first desktop platform for live auction data extraction, workflow control, and HTML broadcast graphics. Its tagline is **The Ultimate Data Stripper.**

The first implemented project is **Broad Arrow Auctions**, operated by the **Hildreth Media Group** team inside NEUD. NEUD itself is the application name; HMG remains a team within the platform, not a separate product.

## Project status

| Phase | Scope |
|-------|--------|
| **Completed Alpha v0.1.1** | Local desktop app, SQLite runtime, Broad Arrow scraper workflow, four locked Broad Arrow displays, secure cloud publishing, hosted portal delivery |
| **Current release milestone** | Windows x64 installer, bundled Puppeteer Chrome, packaged validation, automatic updates, GitHub release workflow |
| **Beta (planned)** | Online JSON Viewer, browser-based controller, multi-computer synchronization, macOS support, additional graphics packages |

NEUD is not yet publicly production-ready. Unsigned Windows builds will show SmartScreen warnings until Authenticode signing is configured.

## Architecture

NEUD combines:

- **Electron** desktop host
- **Next.js** portal and local HTTP runtime
- **TypeScript** application code
- **SQLite** local project database
- **Puppeteer** Broad Arrow scraper workers
- **Supabase** authentication and authorized cloud services

The desktop app remains locally operational when cloud services are unavailable, subject to existing authentication and session rules.

Packaged Windows releases include a **compatible Chrome for Testing build** bundled with the installer. End users do not need Node.js, npm, Git, or a separate Chrome installation.

## Development setup

### Prerequisites

- Node.js 20+
- npm 10+
- Windows 10/11 x64 for desktop packaging validation

### Install and run

```bash
npm install
npm run dev:desktop
```

Development uses the local Next.js server at [http://127.0.0.1:3000](http://127.0.0.1:3000).

Health endpoint:

```text
http://127.0.0.1:3000/api/health
```

Local API and desktop data live under:

```text
%APPDATA%\NEUD\
%APPDATA%\NEUD\data\neud.sqlite
```

Broad Arrow downloaded auction assets live under the project’s local data directories inside `%APPDATA%\NEUD\`.

## Windows packaging

Build the staged desktop app and NSIS installer:

```bash
npm ci
npm run build:desktop
npm run package:win
```

Validation:

```bash
npm run verify:bundled-browser
npm run verify:win-package
npm run smoke:packaged-app
```

Release gate:

```bash
npm run release:win
```

Installer output:

```text
desktop/release/NEUD-Setup-0.1.1-x64.exe
desktop/release/NEUD-Setup-latest-x64.exe
desktop/release/latest.yml
```

See [docs/github-release.md](./docs/github-release.md) for publishing to GitHub Releases and wiring the Vercel download button.

Bundled browser location inside an installed app:

```text
{InstallDir}\resources\puppeteer\chrome\chrome-win64\chrome.exe
```

## Automatic updates

Packaged NEUD builds use `electron-updater` with GitHub Releases as the initial provider. Updates are checked in the background after startup and manually from:

- **Settings → About NEUD → Check for Updates**
- **Help → Check for Updates**

Updates never run in development mode or unpackaged Electron sessions. Restart is always user-initiated.

Publishing a new release such as **0.1.2**:

1. Bump the root `package.json` version once.
2. Run `npm run release:win`.
3. Publish the generated installer, `latest.yml`, and blockmap to a GitHub Release.
4. Validate update detection from an installed 0.1.1 build.

See [docs/application-updates.md](docs/application-updates.md).

## Security notes

- No Supabase **service-role** key ships in the desktop app.
- No release credentials or GitHub tokens are embedded in installers.
- Local SQLite data, downloads, browser profiles, and credentials remain on the machine.
- Unsigned local test builds are expected to trigger Windows SmartScreen until signing is configured.

## Documentation

- [docs/desktop.md](docs/desktop.md)
- [docs/windows-packaging.md](docs/windows-packaging.md)
- [docs/bundled-puppeteer-browser.md](docs/bundled-puppeteer-browser.md)
- [docs/application-updates.md](docs/application-updates.md)
- [docs/windows-release-checklist.md](docs/windows-release-checklist.md)
- [docs/alpha-v0.1.1-packaging-validation.md](docs/alpha-v0.1.1-packaging-validation.md)
- [AGENTS.md](AGENTS.md)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:desktop` | Next.js + Electron development |
| `npm run build:desktop` | Stage standalone resources and build desktop host |
| `npm run package:win` | Build Windows x64 NSIS installer |
| `npm run verify:bundled-browser` | Verify bundled Chrome in unpacked output |
| `npm run verify:win-package` | Verify installer artifacts and secret scan |
| `npm run smoke:packaged-app` | Launch bundled Chrome from packaged resources |
| `npm run test:neud-release-version` | Verify version metadata consistency |
| `npm run test:neud-packaged-browser` | Bundled browser resolver tests |
| `npm run test:neud-auto-update` | Updater configuration tests |
| `npm run test:neud-github-release` | GitHub release + download URL tests |
| `npm run test:neud-release-security` | Desktop secret and packaging scan |
