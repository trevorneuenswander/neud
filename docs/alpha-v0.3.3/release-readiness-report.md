# NEUD Alpha v0.3.3 — Release-Readiness Report

**Date:** 2026-11-02  
**Branch:** `feature/v0.3.3-fixes`  
**Base:** `main` @ `b8adb45` (published **v0.3.2**)  
**RC commit:** `9a78398c6edc73f8639bfa3139c67989f2d052a5` — *NEUD v0.3.3 release candidate*  
**Canonical version:** **0.3.3**  
**Decision:** **GO for Owner publish gate** / **NO-GO until** merge, Windows CI, tag, upload, and catalog flip are explicitly authorized

No merge into `main`, tag, push, GitHub release publish, Vercel deploy, installer upload, or update-feed publish was performed.

---

## 1. Release-candidate commit SHA

| Item | Value |
|---|---|
| Branch | `feature/v0.3.3-fixes` (no upstream) |
| Commit | `9a78398c6edc73f8639bfa3139c67989f2d052a5` |
| Message | `NEUD v0.3.3 release candidate` |
| Merge-base with `main` | `b8adb45` |
| Excluded from commit | `workers/data-engine/dist-local/package.json` (local noise) |

---

## 2. Version consistency

| Surface | Value |
|---|---|
| Root `package.json` | **0.3.3** |
| `desktop/package.json` | **0.3.3** |
| Packaged `Info.plist` `CFBundleShortVersionString` / `CFBundleVersion` | **0.3.3** |
| `latest-mac.yml` `version` | **0.3.3** (local only; not uploaded) |
| `src/lib/releases/neud-releases.ts` | Still **0.3.2** — **untouched** |
| Docs: latest **published** | **v0.3.2** |
| Docs: current package | **v0.3.3** (RC) |

---

## 3. Release scope included

1. **Mic Tally colors** — LIVE `#FF2020`, MUTED/FADER DOWN `#527D65`, UNKNOWN `#777777` + safe upgrade hash  
2. **Simultaneous UltraStudio / DeckLink sessions** — `gSessions`, endpoint-scoped start/stop/push/metrics, LIVE health reconcile  
3. **Output rename focus** — NeudModal mount-only focus; LIVE rename continuity  
4. **SEMA Ticker marquee** — 57/52 fonts, 40px/s, highlight-stable controllers  
5. **SEMA Fullscreen marquee** — per-slot fonts preserved, highlight-stable  
6. **Fullscreen speed** — **50px/s** (ease 1s, holds 4s unchanged)  
7. **Hydration delivery** — allowlist intermediate ticker `bede95a1…` and fullscreen 40px/s `48da36be…`

No production SQL migrations added. Migration 039 **test fixture** only.

---

## 4. Final regression results

### Critical / v0.3.3-focused — PASS

| Suite | Result |
|---|---|
| Batch A (Output Engine, DeckLink, Mic Tally, rename, SEMA ticker/fullscreen/hydration, release-version, modal) | **115/115** |
| `test-output-engine.mjs` alone | **35/35** (039 fixture PASS) |
| SEMA Batch B (fullscreen UHD, clean install, upgrade, activity noise, redesign, visibility/highlight, directory) | **40/40** |
| `desktop` `test:packages` | **48/48** |
| Auth / BA / activity sample Batch C | **76 pass / 0 fail / 1 skipped** |
| Root + desktop `tsc --noEmit` | **PASS** |

### Pre-existing failures (not introduced by v0.3.3)

| Test | Baseline evidence | Risk |
|---|---|---|
| `test-broad-arrow-controller-ui.mjs` — 3 fails (`onPollIntervalChange`, poll-interval copy, Advanced settings title) | Reconfirmed **29/32**; controller UI **not** in v0.3.3 diff | **Low** — track separately |
| Packaged-browser / DisplayCard order / v0.3.1 stabilization catalog pairing (prior readiness) | Darwin host / stale expectations; not Owner-validated paths | **Low–Medium** — do not block RC publish of validated fixes |

---

## 5. macOS packaging results — **PASS**

Built locally with `NEUD_REQUIRE_REAL_DECKLINK=1` and `NEUD_DECKLINK_SDK=$HOME/DeckLinkSDK` (SDK 16.0 headers; Desktop Video runtime 16.4.0).

| Artifact | Size | SHA-256 |
|---|---|---|
| `desktop/release/NEUD-0.3.3-arm64.dmg` | 269M (`282064698` bytes) | `c9e6363dd80ab66af9f2ce8cee69cd0911d1b0a4235eee07b85931faacee01bf` |
| `desktop/release/NEUD-0.3.3-arm64.zip` | 261M (`273494739` bytes) | `1e45e958b1052fefea308902df4f86fb4fc8cf38cdb5863612e0d7ad72dadcef` |
| `NEUD-0.3.3-arm64.dmg.blockmap` / `.zip.blockmap` | present | — |
| `latest-mac.yml` | local only | version **0.3.3** |

### Native DeckLink (packaged Electron runtime)

| Check | Result |
|---|---|
| `neud_decklink.meta.json` | `stub: false`, Electron **33.4.11**, arch **arm64** |
| `verify-packaged-decklink-addon.mjs --packaged` | **PASS** `stub: false` |
| `verify-decklink-addon-load.mjs --packaged` | **PASS** — loads packaged `.node` in Electron; `discoverOk`; `endpointCount: 2`; SDK runtime **16.4.0** |
| Multi-session marker | Packaged binary contains `endpointId` string; source uses `gSessions` |
| Silent stub fallback | **Not observed** |
| App version in bundle | `CFBundleShortVersionString` / `CFBundleVersion` = **0.3.3** |

### Public availability

`https://github.com/trevorneuenswander/neud/releases/download/v0.3.3/NEUD-0.3.3-arm64.dmg` → **HTTP 404** (not published).

---

## 6. Windows packaging results — **BLOCKED pending push approval**

| Item | Status |
|---|---|
| Local win32 build on this Darwin host | **Not possible** (real Windows DeckLink/MIDL required) |
| Branch upstream | **None** — `feature/v0.3.3-fixes` has never been pushed |
| CI workflows | `build-windows-dev.yml` / `release-windows.yml` are `workflow_dispatch` with `NEUD_REQUIRE_REAL_DECKLINK=1` |
| Action taken | **Stopped** — a push is required before Windows CI can build; Owner approval requested before any push |

Required Windows CI checks after authorized push:

1. Dispatch `build-windows-dev` (or `release-windows`) on `feature/v0.3.3-fixes` / RC SHA  
2. Confirm packaged `neud_decklink.meta.json` `stub: false`  
3. `verify-packaged-decklink-addon.mjs --packaged` + `verify-decklink-addon-load.mjs --packaged`  
4. `verify-packaged-no-decklink-sdk.mjs`  
5. Confirm installer reports **0.3.3**; retain local `latest.yml` without uploading  

---

## 7. Upgrade and hydration safety

| Path | Status |
|---|---|
| Mic Tally prior packaged hash allowlist | Present |
| SEMA ticker prior hashes | v0.3.2 `9a86a7fb…` + intermediate `bede95a1…` |
| SEMA fullscreen prior hashes | v0.3.2 `b5ad9fad…` + 40px/s `48da36be…` |
| Hydration delivery test | **PASS** — stuck intermediate ticker upgrades to highlight-stable build  
| Customized displays | Still preserved (unknown hashes not auto-upgraded) |
| v0.3.2 user data / Output routes | No new SQLite migration; preserved by design |

---

## 8. Artifact inventory (completed)

| Platform | Filename | Size | SHA-256 | Build env | DeckLink | Smoke |
|---|---|---|---|---|---|---|
| macOS arm64 | `NEUD-0.3.3-arm64.dmg` | 269M | `c9e6363d…acee01bf` | Darwin 25.5 / local `package:mac` | Real, packaged load **PASS** | Packaged addon + version gates **PASS** |
| macOS arm64 | `NEUD-0.3.3-arm64.zip` | 261M | `1e45e958…72dadcef` | same | same | same |
| Windows x64 | `NEUD-Setup-0.3.3-x64.exe` | — | — | **Not built** | Pending CI | Pending |

---

## 9. Remaining publication steps (Owner-gated)

1. Approve **push** of `feature/v0.3.3-fixes` for Windows CI (if desired before merge).  
2. Complete Windows RC build + DeckLink `stub:false` verification.  
3. Optional packaged smoke: Mic Tally colors, dual UltraStudio, rename, SEMA ticker after relaunch hydration.  
4. Authorize **merge to `main`**.  
5. Authorize **tag `v0.3.3`**, upload installers, flip `neud-releases.ts`, publish GitHub release notes, update feeds.  
6. Do **not** deploy unrelated Vercel/Supabase changes as part of this release.

---

## 10. Final GO / NO-GO

### **GO (release candidate)**

- Version **0.3.3** committed on `feature/v0.3.3-fixes` @ `9a78398`  
- Owner-validated six-item scope + SEMA hydration delivery included  
- Critical regressions green; production SQL untouched  
- macOS Apple Silicon RC DMG/ZIP built with **real** DeckLink addon verified in packaged Electron  

### **NO-GO (publish)**

- Not merged / not tagged / not pushed  
- Windows x64 RC installer **not yet built**  
- Catalog, feeds, and GitHub release assets must not move without explicit Owner publish authorization  

**Stop here. Await Owner approval before push, Windows CI, merge, tag, or publish.**
