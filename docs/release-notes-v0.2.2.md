# NEUD v0.2.2

**Canonical source:** highlight text and platform metadata live in [`src/lib/releases/neud-releases.ts`](../src/lib/releases/neud-releases.ts). Use `formatGitHubReleaseBody(getCurrentNeudRelease())` (or copy from the catalog) so GitHub Releases and neud.io stay aligned.

**Release date:** September 26, 2026

## Highlights

- Added Apple Silicon macOS support
- Restored Faye/event-driven Broad Arrow transport in packaged builds
- Added explicit scraper transport and fallback diagnostics
- Improved packaged Chrome resolution on Windows and macOS
- Improved fresh-install display output hydration
- Added macOS-native application menu/window behavior
- Improved packaged runtime / worker validation
- Continued LED Display (Quail) support and compatibility

## Supported platforms

- **Windows:** x64 (`NEUD-Setup-0.2.2-x64.exe`, stable alias `NEUD-Setup-latest-x64.exe`)
- **macOS:** Apple Silicon arm64 (`NEUD-0.2.2-arm64.dmg`) — **unsigned CI build** until Developer ID signing and notarization are configured in release CI

## Known limitations

- Alpha software; Windows SmartScreen may warn on unsigned builds.
- Intel Macs are not supported.
- macOS Gatekeeper may require manual approval for unsigned builds.
- macOS auto-update metadata (`latest-mac.yml`) is published with CI builds; treat Mac in-app updater as preview until signing is verified.

## Downloads

GitHub Release tag: [v0.2.2](https://github.com/trevorneuenswander/neud/releases/tag/v0.2.2)

## Known v0.2.1 impact

Published v0.2.1 Windows packages could run legacy scrape polling instead of Faye in packaged mode. v0.2.2 includes the packaged transport parity fix.
