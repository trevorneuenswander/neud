# NEUD Alpha v0.3.2 — SEMA Fullscreen Display Implementation Report

**Branch:** `feature/v0.3.2-stability`  
**Phase 1 checkpoint:** `c4dbab769bba605d0b3a8afb4fd6200a123f1e7a`  
**App version (in-dev):** `0.3.2`  
**SEMA package baseline:** `10`  
**Status:** Implemented and validated locally. **Not committed, pushed, deployed, or packaged.**

---

## Summary

Added **SEMA Fullscreen Schedule** (`schedule-fullscreen-uhd`) as a fourth default SEMA package display at **3840 × 2160**, using approved **Option A** (vertical NOW / NEXT / LATER stack). It consumes the same `SemaScheduleService` → display-bridge payload as Schedule Ticker (no second Sheets poller, no duplicated progression timers).

---

## Files created or modified

### Created
| Path | Role |
|---|---|
| `desktop/src/displays/bundled/sema-schedule-fullscreen-uhd-v1.html` | Option A UHD display runtime |
| `desktop/scripts/test-neud-v0-3-2-sema-fullscreen-uhd.mjs` | Package / hydration / contract tests |
| `desktop/scripts/capture-sema-fullscreen-uhd-screenshots.mjs` | 3840×2160 visual capture |
| `docs/alpha-v0.3.2/screenshots/sema-fullscreen-uhd-*.png` | Review screenshots (4 scenes) |
| `docs/alpha-v0.3.2/screenshots/sema-fullscreen-uhd-metrics.json` | Overflow probe results |
| `docs/alpha-v0.3.2/sema-fullscreen-uhd-implementation-report.md` | This report |

### Modified
| Path | Change |
|---|---|
| `desktop/src/packages/sema-package-builder.ts` | Package v10 display + logo data-URI inject |
| `desktop/src/packages/builtin-package-catalog.ts` | `SEMA_PACKAGE_BASELINE_VERSION = 10` |
| `desktop/src/lib/bundled-display-sources.ts` | Register bundled HTML |
| `desktop/src/main.ts` | Required hydrate slug `schedule-fullscreen-uhd` |
| `desktop/src/packages/project-package-service.ts` | Install / reconcile validation for new HTML |
| `desktop/scripts/test-neud-v0-3-2-sema-clean-install-displays.mjs` | Expect 4 displays |
| `desktop/scripts/test-neud-v0-3-1-stabilization.mjs` | Allow in-dev `package.json` ahead of published catalog |
| Historical SEMA baseline asserts (`= 9` → `10` / include `10`) | Keep suite green without weakening published release catalog checks |
| `docs/alpha-v0.3.2/sema-fullscreen-uhd-design.md` | Status → implemented; Option A layout |

Unrelated dirty paths left untouched: `workers/data-engine/dist-local/package.json`, `docs/alpha-v0.3.1/windows-development-build-report.md`.

---

## Display architecture

| Item | Value |
|---|---|
| Name | SEMA Fullscreen Schedule |
| Slug / display key | `schedule-fullscreen-uhd` |
| Runtime adapter key | `sema-schedule-fullscreen-uhd` |
| Resolution | 3840 × 2160 (16:9) |
| Package path | `displays/schedule-fullscreen-uhd-v1.html` |
| Data | `SemaScheduleService.toDisplayPayload()` via existing project display-bridge SSE |
| Sync | Same `publishSemaDisplayChange` broadcast as ticker/pylon — shared revision / contentHash |

Hydration uses existing `SemaPackageDisplayHydration.ensureHydrated` over `manifest.displays[]`. Identity resolves from `runtimeAdapterKey` (no ticker-only hardcoding required for the new slug).

---

## Layout description (Option A)

Three full-width vertical sections inside a safe-margin stage:

1. **NOW** — flex ≈ 0.45; largest type; green accent; current item (title, description, time).
2. **NEXT** — flex ≈ 0.30; large type; blue accent; next item or empty state.
3. **LATER** — flex ≈ 0.25; readable type; orange accent, magenta when Highlight active; schedule later **or** Highlight title/description (heading remains **LATER**, matching ticker `laterLabel` policy).

Header: SEMA Live branding (packaged logo data URI with CSS wordmark fallback) + source / offline / stale pill. Dark confidence-monitor palette, high contrast, no scrollbars, minimal crossfade only (no independent poll timers).

---

## Screenshot paths

All PNGs are native **3840 × 2160**:

| Scene | Path |
|---|---|
| NOW / NEXT / LATER populated | `docs/alpha-v0.3.2/screenshots/sema-fullscreen-uhd-now-next-later.png` |
| Highlight in LATER | `docs/alpha-v0.3.2/screenshots/sema-fullscreen-uhd-highlight-active.png` |
| Empty NEXT / LATER | `docs/alpha-v0.3.2/screenshots/sema-fullscreen-uhd-empty-next-later.png` |
| Offline / stale cached | `docs/alpha-v0.3.2/screenshots/sema-fullscreen-uhd-stale-offline.png` |

Overflow metrics (`sema-fullscreen-uhd-metrics.json`): `stageScroll: false`, `bodyScroll: false`, `nowTitleOverflow: false`.

Visual review: clear section separation, readable hierarchy, empty slots clean, Highlight magenta treatment on LATER, offline pill visible. No clipping observed in automated probe or screenshot review.

---

## Installation and upgrade test results

| Check | Result |
|---|---|
| Clean install hydrates 4 slugs (ticker, pylon, editable, fullscreen) | PASS |
| Packaged HTML + logo asset present under package root | PASS |
| Display rows 3840×2160; published HTML contains fullscreen markers + logo data URI | PASS |
| Re-update does not duplicate display keys | PASS |
| Simulated v9 → v10 upgrade adds fullscreen once | PASS |
| Local URL path contract `/api/display/:projectId/schedule-fullscreen-uhd` | PASS (path assertion) |

Commands:

```text
node --test scripts/test-neud-v0-3-2-sema-fullscreen-uhd.mjs \
  scripts/test-neud-v0-3-2-sema-clean-install-displays.mjs \
  scripts/test-neud-v0-3-1-stabilization.mjs
→ 19 pass / 0 fail
```

---

## Runtime and synchronization test results

| Check | Result |
|---|---|
| Shared payload contract (now/next/later/highlightActive; no Sheets poll / setInterval) | PASS (source + contract tests) |
| Jump / Highlight / empty / offline payload shaping | PASS |
| SEMA schedule + Highlight unit suite (`npm run test:packages`) | PASS (48 tests) |
| Project-level bridge broadcast (ticker + fullscreen share one engine) | Confirmed by architecture (no second publisher) |

---

## TypeScript validation

```text
npx tsc -p tsconfig.json && node scripts/copy-runtime-assets.mjs
→ exit 0
```

Bundled HTML and logo assets copied into `desktop/dist/displays/bundled/`.

---

## Known limitations

1. **Screenshot capture** uses system Google Chrome when bundled Chrome-for-Testing frameworks are incomplete in local caches.
2. **Audience LATER label** stays “LATER” during Highlight (same as ticker); accent color switches to magenta.
3. Packaged installs inject the SEMA Live logo as a base64 data URI (verified by package tests); CSS wordmark is only a fallback when the asset is missing.
4. **No DeckLink / installer packaging** was run (per authorization). Output routing was not changed.
5. **Published download catalog** still advertises prior public releases; in-dev `package.json` is `0.3.2` (stabilization test asserts catalog does not mark unpublished app version as `current`).

---

## Manual Mac validation instructions

1. Run desktop from this branch after `npm run build -w @neud/desktop` (or existing dist).
2. Install or update the SEMA project package so baseline **10** hydrates.
3. Open **Displays** — confirm **SEMA Fullscreen Schedule** appears beside ticker/pylon/editable.
4. Preview the display; confirm canvas metadata 3840×2160 and Option A stack.
5. With Schedule Ticker open in another preview: change worksheet (DAY 1 / DAY 2), Jump, activate Highlight, wait for auto-expire — both previews must match NOW/NEXT/LATER.
6. Disconnect network / force sheet error with cached rows — offline/stale pill and last-known schedule remain.
7. Route through Output engine preview (no DeckLink required for local HTML preview).
8. Optional: re-run  
   `node desktop/scripts/capture-sema-fullscreen-uhd-screenshots.mjs`  
   and compare against `docs/alpha-v0.3.2/screenshots/`.

---

## Stop point

Implementation and testing complete. **No commit, push, deploy, or installer packaging performed.**
