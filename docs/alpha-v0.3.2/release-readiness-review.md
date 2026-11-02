# NEUD Alpha v0.3.2 — Release-readiness review

**Date:** 2026-11-02  
**Branch:** `feature/v0.3.2-stability`  
**Checkpoint commits:** Phase 1 `c4dbab7`; SEMA fullscreen `8250561`  
**Published tag:** `v0.3.1` @ `e7f792f` (untouched)  
**Status:** Review only — **do not begin release.**

## Classification legend

- **PASS** — validated on this branch with evidence  
- **FAIL** — known gap that blocks a confident release  
- **NOT TESTED** — required for release confidence but not executed yet  

| Area | Status | Notes |
|---|---|---|
| DeckLink SDK compilation in actual installers | **NOT TESTED** | Phase 1 added macOS real-addon / `NEUD_REQUIRE_REAL_DECKLINK` gates in source/CI; **no v0.3.2 Windows/macOS installer** built or verified in this cycle. Distinguishes from hardware. |
| DeckLink hardware validation | **NOT TESTED** | No DeckLink hardware exercised. Absence of hardware ≠ software failure. |
| Windows packaging | **NOT TESTED** | No `package:win` / NSIS run for v0.3.2. |
| macOS packaging | **NOT TESTED** | Existing `desktop/release` artifacts are **v0.3.0**-era; no v0.3.2 DMG/zip produced. |
| SEMA fullscreen display | **PASS** | Option A UHD display implemented; header removed per Owner feedback; screenshots + automated tests pass; Owner manual test confirmed function. |
| SEMA clean-install behavior | **PASS** | Automated clean-install + v9→v10 upgrade + no-duplicate tests pass; package baseline **10**. |
| Activity logging | **PASS** (code) / **NOT TESTED** (packaged field) | Phase 1 routes routine SEMA ops to `sema-ops.log`; unit/source coverage exists. Packaged production behavior not re-validated in installer. |
| Login page | **PASS** (code) | Login performance bar gated off auth routes in Phase 1; no regression campaign this cycle. |
| Supabase traffic optimization | **PASS** (code) / **FAIL** (production proof) | Optimizations exist on branch but **not deployed**; production `pg_stat_statements` still shows dominant `display_revisions SELECT *`. Cannot claim Free-plan safety yet. |
| Regression testing | **NOT TESTED** | Focused SEMA/package/Phase 1 suites run; full `test:import` / packaged smoke / cross-platform matrix not run for v0.3.2. |

## Prioritized release checklist (do not start yet)

1. **Ship egress fixes in a build operators actually run** — then capture Supabase org Usage before/after (Dec 1 risk).  
2. **Windows x64 installer** with real DeckLink addon gates (`NEUD_REQUIRE_REAL_DECKLINK`) — build + unpack verification.  
3. **macOS arm64 installer** with real DeckLink addon — build + unpack verification.  
4. **DeckLink hardware** Key/Fill smoke on at least one validated host (separate from compile PASS).  
5. **SEMA package 10** field check: clean Windows install + existing Mac upgrade path (four displays, no duplicates, ticker unchanged).  
6. **Fullscreen UHD** Owner sign-off on final headerless layout (screenshots already refreshed).  
7. **Activity / login** quick packaged smoke.  
8. **Broader regression** (BAG displays, Output Engine, auto-update config) before tagging.  
9. **Only then** tag / publish / deploy — not before checklist items 1–3 have evidence.

## Non-blockers for continuing development

- SEMA fullscreen layout refinement (done).  
- Local checkpoint commits (done; not pushed).
