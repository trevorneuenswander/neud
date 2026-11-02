# NEUD Alpha v0.3.2 — Release Candidate Validation Report

**Date:** 2026-11-02  
**Branch:** `feature/v0.3.2-stability` @ `8250561` (+ uncommitted RC docs/scripts)  
**Checkpoints:** Phase 1 `c4dbab7`; SEMA fullscreen `8250561`  
**Published `v0.3.1`:** `e7f792f` — **untouched**  
**Decision:** **NO-GO for publish** (Windows RC + DeckLink hardware + production egress proof incomplete)

No push, tag, deploy, publish, or billing change was performed. Owner Application Support data was not reset.

---

## 1. Development state

| Item | Result |
|---|---|
| Git branch / HEAD | `feature/v0.3.2-stability` / `8250561` |
| TypeScript (`desktop` tsc) | PASS |
| Uncommitted (intentional; no commit auth) | RC docs/scripts, assessment docs, `workers/data-engine/dist-local/package.json` noise (excluded from packaging judgment) |
| SEMA package baseline | **10** |

---

## 2. DeckLink SDK status

| Check | Result |
|---|---|
| SDK tree | Present at `~/DeckLinkSDK` → Blackmagic DeckLink SDK 16.0 |
| Desktop Video runtime | Installed; probe `sdkVersion` **16.4.0** |
| `NEUD_REQUIRE_REAL_DECKLINK=1` rebuild | PASS — `stub: false`, `isReal: true` |
| Packaged mac addon meta | `stub: false`, Electron **33.4.11**, arch **arm64** |
| Connected Blackmagic device | **None** (`endpointCount: 0`) |
| Windows SDK/MIDL on this host | **Unavailable** (darwin) — Windows real addon cannot be built here |

Hardware procedure: `docs/alpha-v0.3.2/rc-validation/decklink-hardware-validation-procedure.md`.

**Compile ≠ hardware validation.** Endpoint count 0 with SDK available = no device, not a stub failure.

---

## 3. Installer build results

### macOS Apple Silicon (local RC)

| Artifact | Path | Size | SHA-256 |
|---|---|---|---|
| DMG | `desktop/release/NEUD-0.3.2-arm64.dmg` | 269M | `a88001e836fa18c930836e4b6ffcea758d69f90ce159d68c757c1957bb1d6bc3` |
| ZIP | `desktop/release/NEUD-0.3.2-arm64.zip` | 261M | `e9950b6378ba8a59409399e8bf28d9084a2f85b511c80ba55560fbf429fcd0e6` |

| Field | Value |
|---|---|
| Native DeckLink | **Real** (`stub: false`) |
| Signing | **Ad hoc** (local RC; not Developer ID / notarized) |
| Version | **0.3.2** |
| Build log | `docs/alpha-v0.3.2/rc-validation/package-mac-0.3.2.log` |
| Published | **No** (local `latest-mac.yml` regenerated under `desktop/release/` only; not uploaded) |

### Windows x64

**BLOCKED on this Mac host.**  
`NEUD_REQUIRE_REAL_DECKLINK=1` correctly refuses stubs; Windows DeckLink headers require MIDL on **win32**. No Windows RC installer was produced (by design — not a silent stub build).

Record: `docs/alpha-v0.3.2/rc-validation/windows-package-blocker.txt`.

---

## 4. SEMA installation validation

Isolated temp DB only (Owner `%APPDATA%` / Application Support untouched).

| Scenario | Result |
|---|---|
| Clean install → four displays (ticker, pylon, editable, fullscreen UHD) | PASS |
| Fullscreen 3840×2160 + published HTML | PASS |
| Logo asset packaged under `displays/assets/` | PASS |
| Local URL path `/api/display/:projectId/schedule-fullscreen-uhd` | PASS (contract) |
| Update without duplicates | PASS |
| Simulated **v9 → v10**: schedule fields + custom display preserved; fullscreen added once | PASS |

Scripts: `test-neud-v0-3-2-sema-clean-install-displays.mjs`, `test-neud-v0-3-2-sema-fullscreen-uhd.mjs`, `test-neud-v0-3-2-sema-upgrade-preserves-data.mjs`.

---

## 5. Login and Activity

| Requirement | Evidence | Result |
|---|---|---|
| Login performance bar absent | `DesktopAppShell`: `showPerfBar = desktopActive && !isPublicAuthRoute` includes `/login` | PASS (source) |
| Perf diagnostics elsewhere | `PerformanceStatusBar` still rendered when not on public auth routes | PASS (source) |
| Routine SEMA advance/Jump/Highlight → not Activity | `appendSemaOpsLog` / `sema-ops.log`; `test-neud-v0-3-2-sema-activity-noise.mjs` | PASS |
| Admin sheet/source changes still Activity | `configureSemaSheet` / `setSemaSourceMode` still `recordActivity` | PASS (source) |
| Historical Activity deletion | Not performed | N/A |

---

## 6. Supabase optimization benchmark

**No production writes. Optimizations not deployed.**

### Code delta vs published v0.3.1 (`e7f792f`)

- Selective `DISPLAY_REVISION_METADATA_COLUMNS` + `fetchRevisionBodiesByIds` (new in v0.3.2).
- Idle display sync **60s → 180s**.

### Measured / modeled idle display-revision egress

Source: `docs/alpha-v0.3.2/rc-validation/display-sync-egress-model.json`  
Assumptions: 18 displays × 1 revision × 82 326 B HTML (prod avg).

| Build | Interval | Modeled monthly (1 always-on host, warm idle) |
|---|---|---|
| v0.3.1 (full HTML each cycle) | 60s | **~64 GB** (pathological upper bound if every cycle re-downloads HTML) |
| v0.3.2 (metadata warm; HTML cold only) | 180s | **~0.11 GB** display-sync alone |
| Model reduction | — | **~99.8%** for that path |

Fleet projection (display-sync model only): 1 → 0.11 GB; 5 → 0.54 GB; 10 → 1.08 GB — **before** Auth/Realtime/viewer RPC.

### Live production DB (unchanged clients)

`pg_stat_statements` still dominated by `display_revisions SELECT *` (~87k since 2026-10-21). **Do not attribute org GB reduction to undeployed code.**

### What was not run

- 30-minute instrumented network capture against production with a patched desktop (would require deliberate prod traffic).
- Startup / Users / Access / SEMA live byte traces with mitmproxy (optional follow-up on an isolated account).

---

## 7. Regression testing

| Suite | Result |
|---|---|
| Desktop tsc | PASS |
| SEMA package / fullscreen / upgrade / activity / DeckLink gates / stabilization | PASS |
| `npm run test:packages` (48) | PASS |
| Portal/desktop UI batch (`test-desktop-project-ui`, `test-portal-navigation`, …) | **5 FAIL** (UI string/structure expectations: `settingsOnly`, Advanced settings title, Webpage Scraper overview copy, Members label) — appears **pre-existing UI drift**, not introduced by SEMA fullscreen; still a release hygiene issue |
| Windows packaging | NOT RUN (host blocker) |
| Full `test:import` / packaged smoke matrix | NOT RUN (time/scope; mac RC built with package verify hooks) |
| DeckLink hardware Key/Fill | NOT TESTED (no device) |

---

## 8. Remaining issues

1. **Windows x64 RC** with real DeckLink — must be built on a Windows agent with SDK + MIDL.  
2. **DeckLink hardware** Key/Fill validation — no device on this Mac.  
3. **Notarized / Developer ID** signing — local RC is ad hoc only.  
4. **Production egress proof** after operators run v0.3.2 — still outstanding for Dec 1 Free-plan risk.  
5. **Portal UI regression tests** (5 failures) need update or product fix before calling full regression green.  
6. Do not treat local `latest-mac.yml` as a published feed.

---

## 9. Recommended GO / NO-GO

### **NO-GO for publish / tag / download feed**

Minimum to reconsider:

1. Windows RC with `stub: false` verified.  
2. At least one DeckLink hardware smoke (or explicit Owner waiver distinguishing “no hardware” from “stub”).  
3. Portal UI test failures triaged.  
4. Plan to ship egress fixes and re-measure Supabase org Usage within 7–14 days (Dec 1 risk).

### Conditional **GO for internal macOS RC distribution only**

Local `NEUD-0.3.2-arm64.dmg` / `.zip` are suitable for **closed** Mac testing of SEMA package 10 + real DeckLink *module*, with clear labels: ad hoc signed, not notarized, not published.

---

## Artifact index

- `docs/alpha-v0.3.2/rc-validation/package-mac-0.3.2.log`  
- `docs/alpha-v0.3.2/rc-validation/macos-artifacts.txt`  
- `docs/alpha-v0.3.2/rc-validation/windows-package-blocker.txt`  
- `docs/alpha-v0.3.2/rc-validation/display-sync-egress-model.json`  
- `docs/alpha-v0.3.2/rc-validation/decklink-hardware-validation-procedure.md`  
- `docs/alpha-v0.3.2/supabase-egress-and-billing-assessment.md`  
- `docs/alpha-v0.3.2/release-readiness-review.md`
