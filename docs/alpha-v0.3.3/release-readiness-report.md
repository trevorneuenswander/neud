# NEUD Alpha v0.3.3 — Release-Readiness Report

**Date:** 2026-11-02  
**Branch:** `feature/v0.3.3-fixes` → `origin/feature/v0.3.3-fixes`  
**Base:** `main` @ `b8adb45` (published **v0.3.2**)  
**Product RC commit:** `9a78398c6edc73f8639bfa3139c67989f2d052a5`  
**Docs tip at Windows CI:** `cb1d68916825ab32a80fde340d8c282bffd3adf3`  
**Canonical version:** **0.3.3**  
**Decision:** **GO for Owner publication authorization** / **NO-GO until** merge, tag, installer upload, and catalog/feed flip are explicitly authorized

No merge into `main`, no tag, no GitHub Release publish, no production Vercel deploy, no public installer upload, and no update-feed publish were performed.

---

## 1. Release-candidate commits

| Item | Value |
|---|---|
| Branch | `feature/v0.3.3-fixes` (tracking `origin/feature/v0.3.3-fixes`) |
| Product RC | `9a78398` — *NEUD v0.3.3 release candidate* |
| Readiness (pre-Windows) | `cb1d689` — packaging gate docs |
| Windows CI head SHA | `cb1d68916825ab32a80fde340d8c282bffd3adf3` |
| Merge-base with `main` | `b8adb45` |
| Excluded from commits | `workers/data-engine/dist-local/package.json` |

### Push safety (performed before Windows CI)

| Check | Result |
|---|---|
| Auto-trigger `build-windows-dev` on feature push | **No** (only `workflow_dispatch` + push to `develop`) |
| Auto-trigger `release-windows` / `release-macos` | **No** (`workflow_dispatch` only; release steps require inputs) |
| Push creates GitHub Release / uploads to release assets | **No** |
| Public catalog / feeds | Untouched |
| Vercel production | Not deployed; preview may exist for the feature branch (non-production) |

Windows CI was started via **manual** `workflow_dispatch` of **Build Windows Development** only.

---

## 2. Version consistency

| Surface | Value |
|---|---|
| Root / `@neud/desktop` | **0.3.3** |
| macOS Info.plist | **0.3.3** |
| Windows `build-info.json` `appVersion` | **0.3.3** |
| Windows installer filename | `NEUD-Setup-0.3.3-x64.exe` |
| `neud-releases.ts` catalog | Still **0.3.2** — untouched |
| Latest published GitHub release | **v0.3.2** |

---

## 3. Release scope included

1. Mic Tally colors — LIVE `#FF2020`, MUTED/FADER DOWN `#527D65`, UNKNOWN `#777777`  
2. Simultaneous UltraStudio / DeckLink native sessions (`gSessions`, endpoint-scoped API)  
3. Output rename focus (NeudModal mount-only focus)  
4. SEMA Ticker marquee — 57/52 @ **40px/s**, highlight-stable  
5. SEMA Fullscreen marquee — per-slot fonts, highlight-stable  
6. Fullscreen speed — **50px/s**  
7. Hydration allowlists for intermediate ticker `bede95a1…` and fullscreen 40px/s `48da36be…`

No production SQL migrations added.

---

## 4. Regression (engineering)

| Suite | Result |
|---|---|
| Critical Batch A | **115/115** |
| SEMA Batch B | **40/40** |
| `desktop` `test:packages` | **48/48** |
| Auth/BA sample | **76 pass / 1 skip** |
| Root + desktop `tsc --noEmit` | **PASS** |
| Pre-existing BA controller UI | **3 fails** (unrelated to v0.3.3) |
| Migration 039 | Test fixture only; production SQL unchanged |

---

## 5. macOS packaging — **PASS** (preserved)

| Artifact | Size | SHA-256 |
|---|---|---|
| `desktop/release/NEUD-0.3.3-arm64.dmg` | 269M | `c9e6363dd80ab66af9f2ce8cee69cd0911d1b0a4235eee07b85931faacee01bf` |
| `desktop/release/NEUD-0.3.3-arm64.zip` | 261M | `1e45e958b1052fefea308902df4f86fb4fc8cf38cdb5863612e0d7ad72dadcef` |

Packaged DeckLink: **`stub: false`**, loads in Electron, hardware `endpointCount: 2` on Owner Mac. GitHub `v0.3.3` download → **404**.

---

## 6. Windows CI packaging — **PASS** (build verification)

| Item | Value |
|---|---|
| Workflow | **Build Windows Development** (`build-windows-dev.yml`) |
| Run | https://github.com/trevorneuenswander/neud/actions/runs/41547932549 |
| Conclusion | **success** (~9m17s job) |
| Head SHA | `cb1d68916825ab32a80fde340d8c282bffd3adf3` |
| Env | `NEUD_REQUIRE_REAL_DECKLINK=1`, `NEUD_WITH_FFMPEG=1` |
| Publishing | CI **artifact upload only** — no `gh release`, no public feed |

### Windows installer

| Field | Value |
|---|---|
| Filename | `NEUD-Setup-0.3.3-x64.exe` |
| Size | **444M** (`465491603` bytes) |
| SHA-256 | `6de7bff3f142b2d2bc79560c58806efad5534d56cca899449c669fbe0902a47f` |
| Type | PE32 Nullsoft Installer (x64 NSIS) |
| Also in artifact | `NEUD-Setup-latest-x64.exe` (identical hash; **not** uploaded to public feeds) |

### Native DeckLink (Windows packaged path)

| Check | Result |
|---|---|
| Artifact `neud_decklink.meta.json` | `stub: false`, arch **x64**, Electron **33.4.11**, real SDK root on runner |
| CI `verify-packaged-decklink-addon.mjs --packaged` | **PASS** (`stub: false`) |
| CI `verify-decklink-addon-load.mjs --packaged` | **PASS** (`stub: false`; `endpointCount: 0` on runner — **no Desktop Video hardware**; not a physical dual-UltraStudio claim) |
| Multi-session source | Present in RC commit (`gSessions` / `endpointId` API) |
| Silent stub fallback | **Not observed** under `NEUD_REQUIRE_REAL_DECKLINK=1` |

### Bundled dependencies (artifact / CI)

| Dependency | Evidence |
|---|---|
| LGPL FFmpeg | Artifact includes `dist/platform/windows/ffmpeg/*.dll` + provenance; ProRes/H.264 smokes **PASS** |
| Packaged Chrome | Build synced packaged Chrome profiles; targeted packaged-browser resolver tests **PASS** |
| `build-info.json` | `appVersion: 0.3.3`, `gitCommit: cb1d689…`, `withFfmpegLgpl: true`, `developmentBuildId: activity-sync-aliases-1` (workflow env label only) |

### Distinction: CI build vs physical Windows hardware

| Claim | Status |
|---|---|
| Windows x64 installer builds with real DeckLink addon (`stub: false`) | **Verified in CI** |
| Packaged addon loads under Electron on the Windows runner | **Verified in CI** |
| Dual UltraStudio / Key/Fill on a physical Windows machine | **Not re-run in this CI step** — Owner hardware PASS was previously recorded for dual UltraStudio; recommend a short Windows packaged smoke before public publish if desired |

### Public availability

- GitHub release tag `v0.3.3` → **404**  
- Installer download URL for `v0.3.3` → **404**  
- Latest published release remains **v0.3.2**

---

## 7. Upgrade / hydration safety

| Path | Status |
|---|---|
| Mic Tally / SEMA ticker / SEMA fullscreen prior-hash allowlists | Present in RC |
| Intermediate ticker delivery test | **PASS** |
| Customized displays | Not auto-overwritten |
| v0.3.2 local data / Output routes | No new SQLite migration |

---

## 8. Artifact inventory

| Platform | Filename | Size | SHA-256 | Env | DeckLink | Notes |
|---|---|---|---|---|---|---|
| macOS arm64 | `NEUD-0.3.3-arm64.dmg` | 269M | `c9e6363d…acee01bf` | Local `package:mac` | Real, packaged load PASS | Preserved locally |
| macOS arm64 | `NEUD-0.3.3-arm64.zip` | 261M | `1e45e958…72dadcef` | Local | Real | Preserved locally |
| Windows x64 | `NEUD-Setup-0.3.3-x64.exe` | 444M / 465491603 B | `6de7bff3…0902a47f` | GH Actions run `41547932549` | Real `stub:false` | CI artifact only |

---

## 9. Remaining Owner-gated publication steps

1. Optional: short Windows packaged smoke (Mic Tally / Outputs / SEMA) on Owner hardware.  
2. Authorize **merge to `main`**.  
3. Authorize **tag `v0.3.3`**, upload macOS + Windows installers, flip `neud-releases.ts`, publish GitHub release notes + update feeds.  
4. Do not deploy unrelated Vercel/Supabase changes as part of this release.

---

## 10. Final GO / NO-GO

### **GO (engineering + packaging verification)**

- v0.3.3 RC committed and pushed for CI only  
- macOS Apple Silicon RC artifacts verified with real DeckLink  
- Windows x64 RC installer verified in CI with **`stub: false`**, version **0.3.3**, Chrome/FFmpeg present  
- No public release assets or feeds updated  

### **NO-GO (publication)**

Until Owner authorizes merge, tag, public installer upload, catalog flip, and update-feed publish.

**Stop here. Await Owner publication approval.**
