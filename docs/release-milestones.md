# NEUD release milestones

This document tracks **product milestones** separately from SQLite migration numbers.

## Published vs in development

| Label | Version | Notes |
| --- | --- | --- |
| **Latest published release** | **v0.1.4** | Last shipped Windows installer / GitHub release baseline |
| **Current release candidate** | **v0.2.0** | Unreleased development milestone (substantial scope formerly tracked informally as v0.1.5) |

There is **no** published v0.1.5 release. The intended auto-update path to validate after v0.2.0 ships:

```text
v0.1.4 → v0.2.0
```

Expected packaged installer name for the next release (when published):

```text
NEUD-Setup-0.2.0-x64.exe
```

Canonical application version during development is **`0.2.0`** in root and `@neud/desktop` `package.json`.

## Alpha v0.2.0 (current — not yet published)

In-flight scope includes desktop-first polish and operational features developed on the v0.1.4 foundation (pinned viewer, display transport, publishing lease hardening, access/sync improvements, scraper performance instrumentation, and related tests). This milestone **does not** include LAN-wide local display hosting or modular project package downloads unless explicitly implemented and documented elsewhere.

## Future milestones (planned — not started)

### v0.3.0 — LAN-accessible local display hosting

**Previously planned under the v0.2.0 number.** Renumbered when v0.2.0 was promoted to the current substantial release candidate.

Goal: make local display URLs reachable from other machines on the LAN under controlled, project-scoped rules. **Not implemented** in v0.2.0.

### v0.4.0 — NEUD core + modular project packages

**Previously discussed as the milestone after LAN hosting.**

Goal: a smaller NEUD core with independently downloadable/versioned project packages or modules. **Not started.**

## Historical references

- **v0.1.5** may appear only as informal development history or third-party dependency versions. It is not a NEUD published release version.
- Alpha **v0.1.0** display baseline and **v0.1.1** delivery baseline remain documented in their respective alpha docs.
