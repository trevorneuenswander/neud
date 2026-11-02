# NEUD Alpha v0.3.3 — Release-Readiness Report

**Date:** 2026-11-02  
**Branch:** `feature/v0.3.3-fixes`  
**Base:** `main` @ `b8adb45` (published **v0.3.2**)  
**Canonical version:** **0.3.3**  
**Decision:** **GO for release-candidate packaging** / **NO-GO for publish** (await Owner authorization for merge, tag, upload, catalog flip)

No merge, tag, push, deploy, installer upload, or update-feed publish was performed in this phase unless separately noted.

---

## 1. Final commit / branch state

| Item | Value |
|---|---|
| Branch | `feature/v0.3.3-fixes` |
| Merge-base with `main` | `b8adb45` |
| Upstream | **None** (local-only until Owner approves push) |
| Canonical `package.json` version | **0.3.3** |
| `@neud/desktop` version | **0.3.3** |
| Public catalog (`neud-releases.ts`) | Still lists **0.3.2** — **untouched** (correct until publish) |

### Release scope (six Owner-validated items + hydration)

1. Mic Tally colors — LIVE `#FF2020`, MUTED/FADER DOWN `#527D65`, UNKNOWN `#777777`
2. Simultaneous UltraStudio / DeckLink native sessions (endpoint-scoped)
3. Output rename focus (NeudModal mount-only focus)
4. SEMA Ticker marquee — 57/52 fonts, 40px/s, highlight-stable
5. SEMA Fullscreen marquee — original per-slot fonts, highlight-stable
6. Fullscreen marquee speed — **50px/s**
7. Safe hydration allowlists for intermediate SEMA ticker (`bede95a1…`) and fullscreen 40px/s (`48da36be…`)

### Explicitly excluded from commit

| Path | Note |
|---|---|
| `workers/data-engine/dist-local/package.json` | Generated local noise |

No Supabase migrations, `.env`, credentials, or published download catalog files are included.

---

## 2. Regression results (RC gate)

### Critical / v0.3.3-focused — **PASS**

| Suite | Result |
|---|---|
| `test-output-engine.mjs` | **35/35** (incl. migration 039 fixture) |
| `test-decklink-output.mjs` | included in Batch A **115/115** aggregate |
| `test-neud-v0-3-3-mic-tally-colors.mjs` | **PASS** |
| `test-neud-v0-3-3-output-rename-focus.mjs` | **PASS** |
| `test-neud-v0-3-3-sema-ticker-marquee.mjs` | **PASS** |
| `test-neud-v0-3-3-sema-fullscreen-marquee.mjs` | **PASS** |
| `test-neud-v0-3-3-sema-ticker-hydration-delivery.mjs` | **PASS** (upgrades stuck intermediate) |
| `test-neud-release-version.mjs` | **PASS** at **0.3.3** |
| `test-neud-modal-close.mjs` | **PASS** |
| Batch A aggregate | **115/115** |

### SEMA / packages / TypeScript — **PASS**

| Suite | Result |
|---|---|
| SEMA v0.3.2 + redesign + visibility/highlight/directory | **40/40** |
| `desktop` `test:packages` | **48/48** |
| Root + desktop `tsc --noEmit` | **PASS** |

### Auth / Broad Arrow / activity sample — **PASS** (with skip)

| Suite | Result |
|---|---|
| Batch C sample (bag scraper, offline auth, no-service-role, BA config/sync, activity) | **76 pass / 0 fail / 1 skipped** |

### Pre-existing failures (not introduced by v0.3.3)

| Test | Evidence | Risk |
|---|---|---|
| `test-broad-arrow-controller-ui.mjs` — 3 failures (`onPollIntervalChange`, poll-interval copy, Advanced settings title) | Reconfirmed **29/32**; Broad Arrow controller UI **not** in v0.3.3 diff | **Low** for this RC — unrelated UI test drift |
| Packaged-browser / DisplayCard order / v0.3.1 stabilization catalog pairing (from prior readiness run) | Failures observed on Darwin host / stale expectations; not re-blocking Owner-validated fixes | **Low–Medium** track separately; do not block Mic/DeckLink/SEMA RC |

### Migration 039

| Item | Detail |
|---|---|
| Production SQL | **Unchanged** |
| Test fixture | Stubs `projects` + `displays` so pending migrations after a 1–38 “applied” marker can run |
| Result | `migration 039 registers output_routes and a route survives reload` **PASS** |

---

## 3. Version / update-feed readiness

| Item | Status |
|---|---|
| Root + desktop version **0.3.3** | **Done** |
| `docs/release-milestones.md` / `docs/release-versioning.md` / `AGENTS.md` current version | **Updated** (published remains **0.3.2**) |
| Draft GitHub notes | `docs/releases/v0.3.3-github-release-notes.md` |
| `neud-releases.ts` catalog | **Deferred** until publish |
| Auto-update feeds upload | **Forbidden** until Owner publish authorization |

---

## 4. Packaging status

Filled after local macOS RC build and Windows path decision:

| Platform | Status |
|---|---|
| macOS Apple Silicon DMG/ZIP | *Pending in this run* |
| Windows x64 installer | Requires win32 CI; **push approval needed** (no upstream) |

---

## 5. Final GO / NO-GO

### **GO for local RC commit + macOS packaging**

### **NO-GO for publish**

Until Owner authorizes: merge to `main`, tag `v0.3.3`, installer upload, catalog flip, update feeds, and any remote push required for Windows CI.
