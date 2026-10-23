# NEUD release milestones

This document tracks **product milestones** separately from SQLite migration numbers.

## Published vs in development

| Label | Version | Notes |
| --- | --- | --- |
| **Latest published release** | **v0.3.0** | Output Engine, Record to Disk, native video, Performance Monitor; Windows x64 + Apple Silicon |
| **Current release** | **v0.3.0** | Same as latest published |

There is **no** published v0.1.5 release. Historical update paths:

```text
v0.1.4 → v0.2.0 → v0.2.1 → v0.2.2 → v0.2.3 → v0.2.4 → v0.3.0
```

Expected packaged artifacts for v0.3.0:

```text
NEUD-Setup-0.3.0-x64.exe
NEUD-Setup-0.3.0-x64.exe.blockmap
NEUD-Setup-latest-x64.exe
latest.yml
NEUD-0.3.0-arm64.dmg
NEUD-0.3.0-arm64.zip
latest-mac.yml
```

Canonical application version is **`0.3.0`** in root and `@neud/desktop` `package.json`. Apple Silicon only. Intel Macs are not supported.

## Alpha v0.3.0

Output Engine foundation: external display output, DeckLink Key/Fill, output routing and stacking, global LIVE/REC tally, Record to Disk on macOS (H.264 MP4, ProRes 422 HQ, ProRes 4444), native ProRes video displays, Performance Monitor, graphics workflow refinements, on-air safety guards, and the new official application icon. Includes all v0.2.4 functionality.

**Not included:** Display Transforms, IN/OUT Transitions, Stream Deck integration, LAN-accessible local display hosting (deferred).

## Alpha v0.2.4

Reliability and workflow update: live graphic media transitions, macOS Chrome recovery, manual value clearing, sign-out while a data engine is running, collapsed sidebar, project team names, Activity table layout, display enabled state and order across installations, and Local URL background parity. Includes all v0.2.3 functionality.

## Alpha v0.2.3

Historical artifacts:

```text
NEUD-Setup-0.2.3-x64.exe
NEUD-0.2.3-arm64.dmg
NEUD-0.2.3-arm64.zip
```

Reliability hotfix for fresh installations and cross-device display synchronization. Published graphics templates recover after cloud sync without a manual republish. Includes all v0.2.2 functionality.

## Alpha v0.2.2

Historical artifacts:

```text
NEUD-Setup-0.2.2-x64.exe
NEUD-0.2.2-arm64.dmg
NEUD-0.2.2-arm64.zip
```

Cross-platform hardening release: Apple Silicon macOS desktop, packaged Chrome for Testing on macOS, native application menu / in-window title bar parity, fresh-install display output hydration, packaged event-driven live-data transport, data-engine transport diagnostics, and packaged worker/build identity diagnostics. Includes all v0.2.1 functionality.

## Alpha v0.2.1

Shipped scope includes activity/teams/owner access fixes, persistent pinned display stacking, collapsible desktop navigation, and initial large-format LED graphics support at 9216×1536. Existing live graphics templates and data-engine architecture remain compatible.

Expected packaged installer name for v0.2.1 (historical):

```text
NEUD-Setup-0.2.1-x64.exe
```

## Alpha v0.2.0 (published)

Desktop-first polish and operational features on the v0.1.4 foundation (pinned viewer, display transport, publishing lease hardening, access/sync improvements, data-collection performance instrumentation, and related tests). This milestone **does not** include LAN-wide local display hosting or modular project package downloads.

## Future milestones (planned — not started)

### Next development version (post-0.3.0)

Locked roadmap after v0.3.0:

- Globally saved Display Transforms
- Numeric controls in Display Settings
- Visual transform editing in pinned displays
- Separate IN/OUT transition configuration (Cut, Dissolve, Slide, Wipe)
- Independent video playback and on-air visibility
- Pinned previews remain visible while OFF AIR
- All displays reset OFF AIR on application restart
- Stream Deck integration after transitions

### Later — LAN-accessible local display hosting

**Previously planned under the v0.3.0 number.** Deferred when v0.3.0 shipped as the Output Engine milestone.

Goal: make local display URLs reachable from other machines on the LAN under controlled, project-scoped rules. **Not implemented** in v0.2.x or v0.3.0.

### v0.4.0 — NEUD core + modular project packages

**Previously discussed as the milestone after LAN hosting.**

Goal: a smaller NEUD core with independently downloadable/versioned project packages or modules. **Not started.**

## Historical references

- **v0.1.5** may appear only as informal development history or third-party dependency versions. It is not a NEUD published release version.
- Alpha **v0.1.0** display baseline and **v0.1.1** delivery baseline remain documented in their respective alpha docs.
