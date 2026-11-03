# NEUD Alpha v0.3.3 — Release-Readiness Report

**Date:** 2026-11-02 (final RC after SQ-5 lifecycle hardware PASS)  
**Branch:** `feature/v0.3.3-fixes` → `origin/feature/v0.3.3-fixes`  
**Base:** `main` @ `b8adb45` (published **v0.3.2**)  
**Final product RC commit:** `125316a720d92c4f9ec7b6cbed93d553db7644b5`  
**Canonical version:** **0.3.3**  
**Decision:** **GO for Owner publication authorization** / **NO-GO until** merge, tag, installer upload, and catalog/feed flip are explicitly authorized

No merge into `main`, no tag, no GitHub Release publish, no production Vercel deploy, no public installer upload, and no update-feed publish were performed.

---

## 0. Superseded prior RC artifacts

All earlier v0.3.3 RC installers are **superseded** by this rebuild (post SQ-5 connection lifecycle + Mic Tally layout). Do not publish or distribute them.

| Platform | Filename | Prior SHA-256 (superseded) | Provenance |
|---|---|---|---|
| macOS arm64 | `NEUD-0.3.3-arm64.dmg` | `c9e6363d…acee01bf` | Pre-layout local RC |
| macOS arm64 | `NEUD-0.3.3-arm64.zip` | `1e45e958…72dadcef` | Pre-layout local RC |
| Windows x64 | `NEUD-Setup-0.3.3-x64.exe` | `6de7bff3…0902a47f` | Run `41547932549` @ `cb1d689` |
| macOS arm64 | `NEUD-0.3.3-arm64.dmg` | `368d3bdc…064e70211` | Post-layout local RC @ `1d9f70b` |
| macOS arm64 | `NEUD-0.3.3-arm64.zip` | `c082218e…14bcc6446c` | Post-layout local RC @ `1d9f70b` |
| Windows x64 | `NEUD-Setup-0.3.3-x64.exe` | `10ed8291…501bc8ee` | Run `41554595231` @ `1d9f70b` |

**Final installers must be built from `125316a`.**

---

## 1. Final release-candidate commits

| Item | Value |
|---|---|
| Branch | `feature/v0.3.3-fixes` |
| **Final product RC** | **`125316a`** — *NEUD v0.3.3: fix SQ-5 connection lifecycle and stale tally state* |
| Mic Tally layout | `1d9f70b` — left/right visual swap (Owner visual PASS) |
| Prior product RC | `9a78398` — colors, DeckLink multi-session, rename focus, SEMA |
| Merge-base with `main` | `b8adb45` |
| Excluded from commits | `workers/data-engine/dist-local/package.json` |

### Push safety

| Check | Result |
|---|---|
| Auto-trigger `build-windows-dev` on feature push | **No** (only `workflow_dispatch` + push to `develop`) |
| Auto-trigger `release-windows` / `release-macos` | **No** (`workflow_dispatch` only) |
| Public catalog / feeds / GitHub Release | Untouched |
| Vercel production | Not deployed |

Windows CI for this final RC: manual `workflow_dispatch` only (`NEUD_REQUIRE_REAL_DECKLINK=1`).

---

## 2. Version consistency

| Surface | Value |
|---|---|
| Root / `@neud/desktop` | **0.3.3** |
| macOS Info.plist | **0.3.3** |
| Windows `build-info.json` `appVersion` | **0.3.3** |
| Windows `build-info.json` `gitCommit` | `125316a720d92c4f9ec7b6cbed93d553db7644b5` |
| Windows installer | `NEUD-Setup-0.3.3-x64.exe` |
| `neud-releases.ts` catalog | Still **0.3.2** — untouched |
| Latest published GitHub release | **v0.3.2** |

---

## 3. Release scope included

1. Mic Tally colors — LIVE `#FF2020`/`#ff2020`, MUTED/FADER DOWN `#527D65`/`#527d65`, UNKNOWN `#777777`  
2. Simultaneous UltraStudio / DeckLink native sessions (`gSessions`, endpoint-scoped API)  
3. Output rename focus (NeudModal mount-only focus)  
4. SEMA Ticker marquee — 57/52 @ **40px/s**, highlight-stable  
5. SEMA Fullscreen marquee — per-slot fonts, highlight-stable @ **50px/s**  
6. Hydration allowlists (ticker intermediate, fullscreen prior, Mic Tally pre-swap)  
7. Mic Tally visual order **slot 3 | 2 | 1** (Owner visual PASS)  
8. **SQ-5 connection lifecycle** — quit disconnects silently; startup never restores Connected; stale tallies → UNKNOWN; settings preserved (Owner hardware PASS)

No production SQL migrations added.

---

## 4. Owner hardware acceptance

| Check | Result |
|---|---|
| Mic Tally left/right layout | **PASS** (visual) |
| Dual UltraStudio / DeckLink multi-session | **PASS** (prior Owner hardware) |
| SQ-5 connect → quit → restart Disconnected + no stale tallies | **PASS** (physical SQ-5) |
| Unexpected disconnect invalidates live tallies | Covered by engineering + Owner lifecycle confirmation |

---

## 5. Final regression (engineering @ `125316a`)

| Suite | Result |
|---|---|
| SQ-5 connection lifecycle | **7/7** |
| Mic Tally colors / layout / health / blockers / base | Included in pre-commit **44/44** |
| Combined final pack (lifecycle, colors, rename, SEMA×3, blockers, health, Output Engine, DeckLink, hydration, DeckLink macOS gates) | **125/125** |
| Root + desktop `tsc --noEmit` | **PASS** |
| Windows CI targeted regressions + ProRes/H.264 smokes | **PASS** (run `41558076159`) |

### Known outstanding / pre-existing

| Item | Notes |
|---|---|
| Pre-existing BA controller UI failures | Previously recorded **3 fails** — unrelated to v0.3.3; not claimed fixed |
| Dual UltraStudio on physical **Windows** | Not re-run in this CI step; prior Owner PASS stands for dual sessions |
| Migration 039 | Test fixture only; production SQL unchanged |

Failing suites were **not** silently suppressed.

---

## 6. macOS packaging — **PASS** (final RC @ `125316a`)

| Artifact | Size | Bytes | SHA-256 |
|---|---|---|---|
| `desktop/release/NEUD-0.3.3-arm64.dmg` | 269M | `282097714` | `99e4c76f7c70c1e359403621a28aefa381e2bfe5f10c336e83ecbbca1a86985b` |
| `desktop/release/NEUD-0.3.3-arm64.zip` | 261M | `273678700` | `d04131ed0451474a55e4d8f61c347daed7517136930c1eebbe94987d4f1376fd` |

### Verification

| Check | Result |
|---|---|
| Application version | **0.3.3** |
| Packaged DeckLink | **`stub: false`**, Electron load PASS, `endpointCount: 2` on Owner Mac |
| Multi-session | Present (`gSessions` / `endpointId` in packaged asar) |
| Mic Tally layout 3/2/1 | CSS `2775` / `1495` / `215` present |
| Approved colors | `#ff2020` / `#527d65` / `#777777` present |
| SQ-5 lifecycle | `reconcileStaleTransportOnStartup` / `markProcessDisconnected` / `Application exit` present in packaged asar |
| SEMA bundles | Present |
| Bundled deps | Packaged Chrome + FFmpeg paths present |
| Production publishing | **None** (`--publish never`) |
| GitHub `v0.3.3` download | **404** |

---

## 7. Windows CI packaging — **PASS** (final RC @ `125316a`)

| Item | Value |
|---|---|
| Workflow | **Build Windows Development** (`build-windows-dev.yml`) |
| Run | https://github.com/trevorneuenswander/neud/actions/runs/41558076159 |
| Conclusion | **success** (~8m49s job) |
| Head SHA | `125316a720d92c4f9ec7b6cbed93d553db7644b5` |
| Env | `NEUD_REQUIRE_REAL_DECKLINK=1`, `NEUD_WITH_FFMPEG=1` |
| Publishing | CI **artifact upload only** — no `gh release`, no public feed |

### Windows installer

| Field | Value |
|---|---|
| Filename | `NEUD-Setup-0.3.3-x64.exe` |
| Size | **444M** (`465492533` bytes) |
| SHA-256 | `c621ec9e1e9f3f07292b7cb518c43d62a7d21230261399ac9341892cde0d2f1a` |
| Type | PE32 Nullsoft Installer (x64 NSIS) |
| Artifact name | `neud-windows-dev-activity-sync-aliases-1-125316a720d92c4f9ec7b6cbed93d553db7644b5` |

### Native DeckLink (Windows)

| Check | Result |
|---|---|
| `neud_decklink.meta.json` | `stub: false`, arch **x64**, Electron **33.4.11** |
| CI packaged verify + load | **PASS** (`stub: false`; `endpointCount: 0` on runner) |
| Multi-session source | Present in `125316a` |
| Silent stub fallback | **Not observed** under `NEUD_REQUIRE_REAL_DECKLINK=1` |

### Bundled dependencies

| Dependency | Evidence |
|---|---|
| LGPL FFmpeg | Artifact DLLs + ProRes/H.264 smokes **PASS** |
| Packaged Chrome | Synced profiles; resolver tests **PASS** |
| SQ-5 lifecycle | Built from `125316a` (`build-info.json` matches) |

### Public availability

- GitHub release tag `v0.3.3` → **404**  
- Latest published release remains **v0.3.2**

---

## 8. Upgrade / hydration safety

| Path | Status |
|---|---|
| Mic Tally prior-hash allowlist (incl. pre-swap `40597dd3…`) | Present |
| SEMA ticker / fullscreen prior-hash allowlists | Present |
| Customized displays | Not auto-overwritten |
| SQ-5 connection status | Transient — never restored as Connected without live socket |
| Saved mixer IP/port/slots/labels/`auto_connect` | Preserved across restart |
| Launch auto-connect | **Not introduced** (setting preserved only) |
| v0.3.2 local data / Output routes | No new SQLite migration |

---

## 9. Final artifact inventory

| Platform | Filename | Size | SHA-256 | Env | DeckLink | Notes |
|---|---|---|---|---|---|---|
| macOS arm64 | `NEUD-0.3.3-arm64.dmg` | 269M / 282097714 B | `99e4c76f…1a86985b` | Local `package:mac` @ `125316a` | Real, load PASS | **Final RC** |
| macOS arm64 | `NEUD-0.3.3-arm64.zip` | 261M / 273678700 B | `d04131ed…4f1376fd` | Local | Real | **Final RC** |
| Windows x64 | `NEUD-Setup-0.3.3-x64.exe` | 444M / 465492533 B | `c621ec9e…de0d2f1a` | GH Actions `41558076159` | Real `stub:false` | **Final RC**; CI artifact only |

---

## 10. Remaining Owner-gated publication steps

1. Optional: short Windows packaged smoke on Owner hardware.  
2. Authorize **merge to `main`**.  
3. Authorize **tag `v0.3.3`**, upload **final** macOS + Windows installers (hashes in §9), flip `neud-releases.ts`, publish GitHub release notes + update feeds.  
4. Do not deploy unrelated Vercel/Supabase changes as part of this release.

---

## 11. Final GO / NO-GO

### **GO (engineering + packaging + Owner hardware)**

- Final product RC `125316a` committed and pushed for CI only  
- Mic Tally layout + SQ-5 lifecycle Owner hardware PASS  
- macOS Apple Silicon **final** RC verified with real DeckLink  
- Windows x64 **final** RC verified in CI with **`stub: false`**, version **0.3.3**  
- Prior RC installers explicitly **superseded**  
- No public release assets or feeds updated  

### **NO-GO (publication)**

Until Owner authorizes merge, tag, public installer upload, catalog flip, and update-feed publish.

**Stop here. Await Owner publication approval.**
