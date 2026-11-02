# SEMA Fullscreen UHD Display — Design Only (v0.3.2)

**Status:** Design proposal only. Do not implement or generate graphics in this milestone.

## Goal

Add a fourth SEMA package display for a dedicated 3840×2160 fullscreen monitor, sharing the same live worksheet / schedule position / Highlight behavior as Schedule Ticker, without changing the existing 280px ticker.

## Product requirements

| Requirement | Approach |
|---|---|
| Resolution 3840×2160 | Manifest `width`/`height` 3840×2160; fullscreen-friendly CSS (no 280px band) |
| NOW / NEXT / LATER | Same fields as Schedule Ticker from `SemaScheduleService` payload |
| Large readable type | Distance-oriented type scale (roughly 3–5× ticker); high contrast |
| Same worksheet / position | Same SSE / display-bridge channel; no second schedule state |
| Same Highlight | Reuses `highlight` overlay that replaces on-air LATER |
| Canonical data source | Existing SEMA schedule service + Google Sheets / Manual Controller |
| Real-time updates | Existing display-bridge SSE |
| Local display URL | Standard `/api/display/:projectId/:slug` after package hydration |
| Auto-include on install | Add definition to `buildSemaPackageV1` + bundled HTML; `SemaPackageDisplayHydration` already maps `manifest.displays` |
| Existing ticker unchanged | New slug/runtime key only; do not edit `sema-schedule-ticker-v1.html` |

## Proposed visual layout

Single full-bleed composition (no cards, no dashboard chrome):

```
┌──────────────────────────────────────────────────────────────┐
│  [optional brand mark]                         worksheet title │
│                                                                │
│                         NOW                                    │
│                    ────────────────                            │
│                 Large title (primary)                          │
│                 Time · description                             │
│                                                                │
│     NEXT (secondary)              LATER / HIGHLIGHT            │
│     Medium title                  Medium title                 │
│     Description                   Description                  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

- Background: solid dark or transparent (OBS-friendly), matching SEMA brand tokens already used by the ticker.
- NOW occupies ~55–60% of vertical space; NEXT and LATER share the lower band.
- When Highlight is active, LATER column shows Highlight label + title/description (same semantics as ticker).
- Safe margins ≥ 80px from edges for monitor bezel / overscan.

## Technical implementation plan (future)

1. **Bundled asset**  
   `desktop/src/displays/bundled/sema-schedule-fullscreen-uhd-v1.html`  
   Runtime adapter key: `sema-schedule-fullscreen-uhd`  
   Slug: `schedule-fullscreen-uhd`

2. **Package builder**  
   Extend `sema-package-builder.ts` manifest `displays[]` and file map; bump `SEMA_PACKAGE_BASELINE_VERSION`.

3. **Hydration**  
   No special-case required if identity resolution treats unknown SEMA slugs via `runtimeAdapterKey` (verify `resolveDisplayIdentity` covers the new key).

4. **Bridge payload**  
   Reuse the same schedule JSON the ticker consumes (NOW/NEXT/LATER + highlight). Prefer shared payload builder over forking.

5. **Install / upgrade**  
   Clean install + update hydrate via existing `ensureHydrated` (hash-gated, no duplicates).

6. **Tests**  
   Clean-install asserts fourth slug; ticker HTML hash unchanged; Highlight parity unit test.

## Non-goals for this design

- No redesign of Schedule Ticker / Pylon / Editable.
- No cloud-only packaging (builtin package remains source of truth).
- No separate schedule engine or worksheet cursor.
