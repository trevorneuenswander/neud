# Changelog

## 0.3.0 — 2026-10-22

NEUD Alpha 0.3.0.

### Added

- Output Engine: external display routing, DeckLink Key/Fill, display stacking, output lifecycle, global LIVE/REC tally
- Record to Disk on macOS (H.264 MP4, ProRes 422 HQ MOV, ProRes 4444 MOV)
- Native ProRes video displays with alpha-capable playback and stack sync
- Performance Monitor (CPU, GPU, RAM, macOS memory pressure, output/recording diagnostics)
- On-air safety prompts for quit, sign-out, stack changes, and display delete/archive/disable
- Official NEUD application icon (macOS `.icns`, Windows `.ico`)

### Changed

- Graphics template typography, layout consistency, and manual data management controls
- Application lifecycle and pinned display layout polish
- Canonical application version display: **Alpha 0.3.0**

### Upgrade

- Supported path: **0.2.1 → 0.3.0** (also covers intermediate 0.2.x installs)
- Local SQLite migrations apply on launch; projects, displays, credentials, and settings are preserved

### Known limitations

- Record to Disk validated on macOS only in this release
- DeckLink hardware not validated in CI
- macOS builds may be unsigned / not notarized until Developer ID secrets are configured
- Display Transforms, IN/OUT Transitions, and Stream Deck are not included

See [docs/releases/v0.3.0-github-release-notes.md](./releases/v0.3.0-github-release-notes.md).

## 0.2.4 — 2026-10-01

Reliability and workflow polish. See [docs/releases/v0.2.4-github-release-notes.md](./releases/v0.2.4-github-release-notes.md).
