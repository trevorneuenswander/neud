# NEUD release milestones

This document tracks **product milestones** separately from SQLite migration numbers.

## Published vs in development

| Label | Version | Notes |
| --- | --- | --- |
| **Latest published release** | **v0.2.1** | Last shipped Windows-only release before v0.2.2 |
| **Current release** | **v0.2.2** | Cross-platform Windows x64 + macOS Apple Silicon; packaged Faye parity, display hydration, Mac shell parity |

There is **no** published v0.1.5 release. Historical update paths:

```text
v0.1.4 → v0.2.0 → v0.2.1 → v0.2.2
```

Expected packaged artifacts for v0.2.2:

```text
NEUD-Setup-0.2.2-x64.exe
NEUD-0.2.2-arm64.dmg
NEUD-0.2.2-arm64.zip
```

Canonical application version is **`0.2.2`** in root and `@neud/desktop` `package.json`.

## Alpha v0.2.2

Cross-platform hardening release: Apple Silicon macOS desktop, packaged Chrome for Testing on macOS, native application menu / in-window title bar parity, fresh-install display output hydration, packaged Faye/event-driven Broad Arrow transport, scraper transport diagnostics, and packaged worker/build identity diagnostics. Includes all v0.2.1 functionality.

## Alpha v0.2.1

Shipped scope includes activity/teams/owner access fixes, persistent pinned display stacking, collapsible desktop navigation, and the initial Broad Arrow LED Display (Quail) at 9216×1536. Stream Bid / Stream Ticker visuals and scraper architecture are unchanged.

Expected packaged installer name for v0.2.1 (historical):

```text
NEUD-Setup-0.2.1-x64.exe
```

## Alpha v0.2.0 (published)

Desktop-first polish and operational features on the v0.1.4 foundation (pinned viewer, display transport, publishing lease hardening, access/sync improvements, scraper performance instrumentation, and related tests). This milestone **does not** include LAN-wide local display hosting or modular project package downloads.

## Future milestones (planned — not started)

### v0.3.0 — LAN-accessible local display hosting

**Previously planned under the v0.2.0 number.** Renumbered when v0.2.0 was promoted to the current substantial release candidate.

Goal: make local display URLs reachable from other machines on the LAN under controlled, project-scoped rules. **Not implemented** in v0.2.0 or v0.2.1.

### v0.4.0 — NEUD core + modular project packages

**Previously discussed as the milestone after LAN hosting.**

Goal: a smaller NEUD core with independently downloadable/versioned project packages or modules. **Not started.**

## Historical references

- **v0.1.5** may appear only as informal development history or third-party dependency versions. It is not a NEUD published release version.
- Alpha **v0.1.0** display baseline and **v0.1.1** delivery baseline remain documented in their respective alpha docs.
