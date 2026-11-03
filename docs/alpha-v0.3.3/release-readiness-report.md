# NEUD Alpha v0.3.3 — Release-Readiness Report

**Date:** 2026-11-02 (final RC rebuild)  
**Branch:** `feature/v0.3.3-fixes` → `origin/feature/v0.3.3-fixes`  
**Base:** `main` @ `b8adb45` (published **v0.3.2**)  
**Final product RC commit:** `1d9f70b13c65c5f8c4d302b60a62f59791eed66a`  
**Canonical version:** **0.3.3**  
**Decision:** **GO for Owner publication authorization** / **NO-GO until** merge, tag, installer upload, and catalog/feed flip are explicitly authorized

No merge into `main`, no tag, no GitHub Release publish, no production Vercel deploy, no public installer upload, and no update-feed publish were performed.

---

## 0. Superseded prior RC artifacts

The following earlier v0.3.3 RC packaging results are **superseded** by this final rebuild (post Mic Tally left/right layout acceptance). Do not publish or distribute them.

| Platform | Filename | Prior SHA-256 (superseded) | Prior provenance |
|---|---|---|---|
| macOS arm64 | `NEUD-0.3.3-arm64.dmg` | `c9e6363dd80ab66af9f2ce8cee69cd0911d1b0a4235eee07b85931faacee01bf` | Local `package:mac` @ pre-layout tip |
| macOS arm64 | `NEUD-0.3.3-arm64.zip` | `1e45e958b1052fefea308902df4f86fb4fc8cf38cdb5863612e0d7ad72dadcef` | Local |
| Windows x64 | `NEUD-Setup-0.3.3-x64.exe` | `6de7bff3f142b2d2bc79560c58806efad5534d56cca899449c669fbe0902a47f` | GH Actions run `41547932549` @ `cb1d689` |

Product commits before the layout swap (`9a78398`, docs tips `cb1d689` / `943b7f5`) remain historical; **final installers must be built from `1d9f70b`**.

---

## 1. Final release-candidate commits

| Item | Value |
|---|---|
| Branch | `feature/v0.3.3-fixes` (tracking `origin/feature/v0.3.3-fixes`) |
| Product RC (final) | `1d9f70b` — *NEUD v0.3.3: swap Mic Tally left and right layout* |
| Prior product RC | `9a78398` — *NEUD v0.3.3 release candidate* (colors, DeckLink multi-session, rename focus, SEMA) |
| Merge-base with `main` | `b8adb45` |
| Excluded from commits | `workers/data-engine/dist-local/package.json` |

### Push safety (reconfirmed before final push)

| Check | Result |
|---|---|
| Auto-trigger `build-windows-dev` on feature push | **No** (only `workflow_dispatch` + push to `develop`) |
| Auto-trigger `release-windows` / `release-macos` | **No** (`workflow_dispatch` only; release steps require inputs) |
| Push creates GitHub Release / uploads to release assets | **No** |
| Public catalog / feeds | Untouched |
| Vercel production | Not deployed |

Windows CI for the final RC was started via **manual** `workflow_dispatch` of **Build Windows Development** only (`NEUD_REQUIRE_REAL_DECKLINK=1` in workflow env).

---

## 2. Version consistency

| Surface | Value |
|---|---|
| Root / `@neud/desktop` | **0.3.3** |
| macOS Info.plist | **0.3.3** |
| Windows `build-info.json` `appVersion` | **0.3.3** |
| Windows `build-info.json` `gitCommit` | `1d9f70b13c65c5f8c4d302b60a62f59791eed66a` |
| Windows installer filename | `NEUD-Setup-0.3.3-x64.exe` |
| `neud-releases.ts` catalog | Still **0.3.2** — untouched |
| Latest published GitHub release | **v0.3.2** |

---

## 3. Release scope included

1. Mic Tally colors — LIVE `#FF2020` / `#ff2020`, MUTED/FADER DOWN `#527D65` / `#527d65`, UNKNOWN `#777777`  
2. Simultaneous UltraStudio / DeckLink native sessions (`gSessions`, endpoint-scoped API)  
3. Output rename focus (NeudModal mount-only focus)  
4. SEMA Ticker marquee — 57/52 @ **40px/s**, highlight-stable  
5. SEMA Fullscreen marquee — per-slot fonts, highlight-stable  
6. Fullscreen speed — **50px/s**  
7. Hydration allowlists for intermediate ticker `bede95a1…`, fullscreen 40px/s `48da36be…`, and Mic Tally pre-swap RC `40597dd3…`  
8. **Mic Tally left/right visual layout swap** — CSS `left` positions yield visual order **slot 3 | slot 2 | slot 1**; `data-slot` / microphone assignments unchanged (Owner visual PASS)

No production SQL migrations added.

---

## 4. Final regression (engineering @ `1d9f70b`)

| Suite | Result |
|---|---|
| Mic Tally colors + safe-upgrade + layout markers | **PASS** (included in v0.3.3 suite bundle) |
| Output rename focus | **PASS** |
| SEMA Ticker marquee | **PASS** |
| SEMA Fullscreen marquee | **PASS** |
| SEMA ticker hydration delivery | **PASS** |
| Combined v0.3.3 focused suites (5 files) | **22/22** |
| Output Engine + DeckLink multi-session (combined with above) | **91/91** |
| Mic Tally hardware blockers | **PASS** (part of extra / more suites) |
| Fresh-install published hydration + DeckLink macOS gates | **17/17** |
| Root + desktop `tsc --noEmit` | **PASS** |
| Windows CI targeted release regressions + ProRes/H.264 smokes | **PASS** (run `41554595231`) |

### Known outstanding / pre-existing (unchanged)

| Item | Notes |
|---|---|
| Pre-existing BA controller UI failures | Previously recorded **3 fails** — unrelated to v0.3.3 scope; not re-claimed as fixed |
| Dual UltraStudio on physical **Windows** hardware | Not re-run in this CI step; Owner hardware PASS remains the prior evidence for dual sessions |
| Migration 039 | Test fixture only; production SQL unchanged |

Failing suites were **not** silently suppressed.

---

## 5. macOS packaging — **PASS** (final RC @ `1d9f70b`)

| Artifact | Size | Bytes | SHA-256 |
|---|---|---|---|
| `desktop/release/NEUD-0.3.3-arm64.dmg` | 269M | `282057712` | `368d3bdc955e0a8b3a61d8f4375ab3a1aaff761d878d0c858924b5a064e70211` |
| `desktop/release/NEUD-0.3.3-arm64.zip` | 261M | `273549717` | `c082218e0883024a3d2ba06b8ec8bf1200b093a36d8a0b4706722b14bcc6446c` |

### Verification

| Check | Result |
|---|---|
| Application version | **0.3.3** |
| Packaged DeckLink | **`stub: false`**, Electron load PASS, `endpointCount: 2` on Owner Mac |
| Multi-session | Present (`gSessions` / `endpointId`) |
| Mic Tally HTML | Packaged hash `19298312826b183d608d12cbee2a6d368c6cb90d303b26e88a3c800d6a914f8a` matches source; CSS `left` **2775 / 1495 / 215** (visual right/center/left = slots 1/2/3) |
| Approved colors | LIVE `#ff2020`, MUTED/FADER_DOWN `#527d65`, UNKNOWN `#777777` |
| SEMA Ticker / Fullscreen bundles | Present under staging displays |
| Bundled deps | Packaged Chrome staging + FFmpeg path present |
| Production publishing | **None** (`--publish never` / local only) |
| GitHub `v0.3.3` download | **404** |

---

## 6. Windows CI packaging — **PASS** (final RC @ `1d9f70b`)

| Item | Value |
|---|---|
| Workflow | **Build Windows Development** (`build-windows-dev.yml`) |
| Run | https://github.com/trevorneuenswander/neud/actions/runs/41554595231 |
| Conclusion | **success** (~8m44s job) |
| Head SHA | `1d9f70b13c65c5f8c4d302b60a62f59791eed66a` |
| Env | `NEUD_REQUIRE_REAL_DECKLINK=1`, `NEUD_WITH_FFMPEG=1` |
| Publishing | CI **artifact upload only** — no `gh release`, no public feed |

### Windows installer

| Field | Value |
|---|---|
| Filename | `NEUD-Setup-0.3.3-x64.exe` |
| Size | **444M** (`465492270` bytes) |
| SHA-256 | `10ed829133e6c2672f9defb30bf33895a734b49ca2f8fdeb333d5132501bc8ee` |
| Type | PE32 Nullsoft Installer (x64 NSIS) |
| Also in artifact | `NEUD-Setup-latest-x64.exe` (identical hash; **not** uploaded to public feeds) |
| Artifact name | `neud-windows-dev-activity-sync-aliases-1-1d9f70b13c65c5f8c4d302b60a62f59791eed66a` |

### Native DeckLink (Windows packaged path)

| Check | Result |
|---|---|
| Artifact `neud_decklink.meta.json` | `stub: false`, arch **x64**, Electron **33.4.11**, real SDK root on runner |
| CI `verify-packaged-decklink-addon.mjs --packaged` | **PASS** (`stub: false`) |
| CI `verify-decklink-addon-load.mjs --packaged` | **PASS** (`stub: false`; `endpointCount: 0` on runner — **no Desktop Video hardware**) |
| Multi-session source | Present in final RC commit (`gSessions` / `endpointId` API) |
| Silent stub fallback | **Not observed** under `NEUD_REQUIRE_REAL_DECKLINK=1` |

### Bundled dependencies (artifact / CI)

| Dependency | Evidence |
|---|---|
| LGPL FFmpeg | Artifact includes `dist/platform/windows/ffmpeg/*.dll` + provenance; ProRes/H.264 smokes **PASS** |
| Packaged Chrome | Build synced packaged Chrome profiles; packaged-browser resolver tests **PASS** |
| `build-info.json` | `appVersion: 0.3.3`, `gitCommit: 1d9f70b…`, `withFfmpegLgpl: true` |

### Mic Tally in Windows build

Updated Mic Tally HTML is in commit `1d9f70b` (source hash above); Windows package builds from that commit. Layout/colors verified in macOS packaged tree and unit tests.

### Distinction: CI build vs physical Windows hardware

| Claim | Status |
|---|---|
| Windows x64 installer builds with real DeckLink addon (`stub: false`) | **Verified in CI** |
| Packaged addon loads under Electron on the Windows runner | **Verified in CI** |
| Dual UltraStudio / Key/Fill on a physical Windows machine | **Not re-run in this CI step** — prior Owner hardware PASS stands |

### Public availability

- GitHub release tag `v0.3.3` → **404**  
- Installer download URL for `v0.3.3` → **404**  
- Latest published release remains **v0.3.2**

---

## 7. Upgrade / hydration safety

| Path | Status |
|---|---|
| Mic Tally prior-hash allowlist includes v0.3.3 RC pre-swap `40597dd3…` | **Present** — stock RC upgrades; customized displays remain protected |
| SEMA ticker / fullscreen prior-hash allowlists | Present |
| Intermediate ticker delivery test | **PASS** |
| Customized displays | Not auto-overwritten |
| v0.3.2 local data / Output routes | No new SQLite migration |

---

## 8. Mic Tally visual acceptance

| Item | Status |
|---|---|
| Owner visual confirmation of left/right layout swap | **PASS** |
| Visual order | Slot **3** (left) / Slot **2** (center) / Slot **1** (right) |
| Microphone assignments | Unchanged |
| Approved tally colors | Unchanged |

---

## 9. Final artifact inventory

| Platform | Filename | Size | SHA-256 | Env | DeckLink | Notes |
|---|---|---|---|---|---|---|
| macOS arm64 | `NEUD-0.3.3-arm64.dmg` | 269M / 282057712 B | `368d3bdc…064e70211` | Local `package:mac` @ `1d9f70b` | Real, packaged load PASS | **Final RC** |
| macOS arm64 | `NEUD-0.3.3-arm64.zip` | 261M / 273549717 B | `c082218e…14bcc6446c` | Local | Real | **Final RC** |
| Windows x64 | `NEUD-Setup-0.3.3-x64.exe` | 444M / 465492270 B | `10ed8291…501bc8ee` | GH Actions run `41554595231` | Real `stub:false` | **Final RC**; CI artifact only |

---

## 10. Remaining Owner-gated publication steps

1. Optional: short Windows packaged smoke (Mic Tally layout / Outputs / SEMA) on Owner hardware.  
2. Authorize **merge to `main`**.  
3. Authorize **tag `v0.3.3`**, upload **final** macOS + Windows installers (hashes in §9), flip `neud-releases.ts`, publish GitHub release notes + update feeds.  
4. Do not deploy unrelated Vercel/Supabase changes as part of this release.

---

## 11. Final GO / NO-GO

### **GO (engineering + packaging verification)**

- Final product RC `1d9f70b` committed and pushed for CI only  
- Mic Tally layout Owner visual PASS  
- macOS Apple Silicon **final** RC artifacts verified with real DeckLink  
- Windows x64 **final** RC installer verified in CI with **`stub: false`**, version **0.3.3**, Chrome/FFmpeg present  
- Prior RC installers explicitly **superseded**  
- No public release assets or feeds updated  

### **NO-GO (publication)**

Until Owner authorizes merge, tag, public installer upload, catalog flip, and update-feed publish.

**Stop here. Await Owner publication approval.**
