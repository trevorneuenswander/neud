# NEUD

**A professional live graphics and data integration platform built for broadcast and live production.**

NEUD is a **local-first** desktop application for integrating external data, controlling live graphics, and delivering professional video output. Its product tagline is **The Ultimate Data Stripper.**

Current public release: **Alpha 0.3.0**

## Core capabilities

NEUD Alpha focuses on reliable desktop operation for production teams:

- Live HTML graphics and display management
- Configurable external data sources and collection runtimes
- Manual data controls for on-air operation
- Layered graphics, stacking, and pinned multi-display workflows
- Local display delivery, with online published viewers where enabled
- Professional video output and DeckLink integration
- Native video playback (including alpha-capable formats where supported)
- Record to Disk on supported platforms (macOS in Alpha 0.3.0)
- Global LIVE/REC output monitoring
- System and application performance monitoring
- Projects, teams, and access management
- Offline-first desktop operation with optional cloud authentication and sync

Only features that ship in the current Alpha are listed above. Planned Beta capabilities (for example browser-based controllers and multi-computer synchronization) are not yet released.

## Supported platforms

| Platform | Architecture | Notes |
| --- | --- | --- |
| Windows | x64 | Installer: `NEUD-Setup-0.3.0-x64.exe` |
| macOS | Apple Silicon (arm64) | Disk image: `NEUD-0.3.0-arm64.dmg` |

Intel Macs are not supported. Record to Disk is validated on **macOS** in Alpha 0.3.0; Windows recording is not claimed in this release.

Download installers from [neud.io/download](https://neud.io/download) or the [GitHub Releases](https://github.com/trevorneuenswander/neud/releases) page.

## Installation

1. Download the installer for your platform from [neud.io/download](https://neud.io/download).
2. Install and launch NEUD.
3. Sign in with an authorized account.

**Alpha limitations**

- Windows builds may show SmartScreen warnings when unsigned.
- macOS CI builds may be unsigned / not notarized; Gatekeeper may require manual approval on first open.
- DeckLink Key/Fill requires compatible Blackmagic hardware.

See [docs/releases/v0.3.0-installation.md](./docs/releases/v0.3.0-installation.md).

## Architecture

NEUD combines:

- **Electron** desktop host
- **Next.js** portal and local HTTP runtime
- **TypeScript** application code
- **SQLite** local project database
- **Node.js** data-collection runtimes (including packaged browser automation where configured)
- **Supabase** authentication and authorized cloud services

The desktop app remains locally operational when cloud services are unavailable, subject to existing authentication and session rules.

Packaged releases include a compatible Chrome for Testing build. End users do not need Node.js, npm, Git, or a separate Chrome installation.

Application data lives under the NEUD application data directory (for example `%APPDATA%\NEUD\` on Windows).

## Development setup

### Prerequisites

- Node.js 20+
- npm 10+
- Platform-appropriate tooling for desktop packaging (Windows x64 and/or macOS Apple Silicon)

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

### Packaging (summary)

```bash
npm ci
npm run build:desktop
npm run package:win   # Windows host
npm run package:mac   # macOS host
```

See [docs/windows-packaging.md](./docs/windows-packaging.md), [docs/github-release.md](./docs/github-release.md), and [docs/application-updates.md](./docs/application-updates.md).

## Current release status

| Item | Status |
| --- | --- |
| **Latest public release** | Alpha **0.3.0** |
| **Next development milestone** | Alpha **0.3.1** stabilization |
| **Production readiness** | Not yet publicly production-ready |

Alpha 0.3.0 includes the Output Engine, Record to Disk (macOS), native video playback, Performance Monitor, and related desktop workflow improvements. See [docs/releases/v0.3.0-github-release-notes.md](./docs/releases/v0.3.0-github-release-notes.md) and [docs/CHANGELOG.md](./docs/CHANGELOG.md).

## Known limitations

- Alpha software; expect SmartScreen / Gatekeeper prompts on unsigned builds
- Record to Disk claimed for macOS only in 0.3.0
- DeckLink hardware not validated in automated CI
- Display transforms, IN/OUT transitions, and Stream Deck integration are planned for later releases
- macOS auto-update is available but treat as preview until signing is verified in production

## Roadmap

Public roadmap items remain high-level:

- Alpha 0.3.1 stabilization
- Display transform and transition tooling
- Stream Deck integration after transitions
- Broader Beta surfaces (for example browser-based control and multi-computer synchronization)

Public materials describe platform capabilities only. See [docs/public-documentation-policy.md](./docs/public-documentation-policy.md).

## Security notes

- No Supabase **service-role** key ships in the desktop app.
- No release credentials or GitHub tokens are embedded in installers.
- Local SQLite data, downloads, browser profiles, and credentials remain on the machine.

## Documentation

- [docs/public-documentation-policy.md](./docs/public-documentation-policy.md) — public vs internal documentation rules
- [docs/desktop.md](./docs/desktop.md)
- [docs/windows-packaging.md](./docs/windows-packaging.md)
- [docs/application-updates.md](./docs/application-updates.md)
- [docs/release-milestones.md](./docs/release-milestones.md)
- [AGENTS.md](./AGENTS.md) — internal contributor / agent instructions

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:desktop` | Next.js + Electron development |
| `npm run build:desktop` | Stage standalone resources and build desktop host |
| `npm run package:win` | Build Windows x64 NSIS installer |
| `npm run package:mac` | Build macOS Apple Silicon package |
| `npm run verify:bundled-browser` | Verify bundled Chrome in unpacked output |
| `npm run verify:win-package` | Verify installer artifacts and secret scan |
| `npm run test:neud-release-version` | Verify version metadata consistency |
| `npm run test:neud-auto-update` | Updater configuration tests |
| `npm run test:neud-github-release` | GitHub release + download URL tests |

## License and support

NEUD is proprietary software operated for authorized users. For access, installation, or support questions, contact your NEUD administrator or the project maintainers listed on the repository.
