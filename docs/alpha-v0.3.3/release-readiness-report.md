# NEUD Alpha v0.3.3 — Release-Readiness Report

**Status:** **RELEASED**  
**Date:** 2026-11-03  
**Final product RC commit:** `125316a720d92c4f9ec7b6cbed93d553db7644b5`  
**Main merge commit:** `04e0ce2aa16d3c17acad142c77b717fda3ec2704`  
**Release tag:** `v0.3.3` → `04e0ce2aa16d3c17acad142c77b717fda3ec2704`  
**GitHub Release:** https://github.com/trevorneuenswander/neud/releases/tag/v0.3.3  
**Canonical version:** **0.3.3**

---

## Publication results

| Step | Result |
|---|---|
| Merge `feature/v0.3.3-fixes` → `main` | **PASS** — `04e0ce2` (contains `125316a`) |
| Annotated tag `v0.3.3` | **PASS** — points at merge commit |
| GitHub Release publish | **PASS** — public |
| Artifact SHA-256 verification before upload | **PASS** |
| Public download of published assets | See post-publication verification |
| Catalog flip `neud-releases.ts` → 0.3.3 current | **PASS** (follow-up commit on `main`) |
| Auto-update feeds `latest.yml` / `latest-mac.yml` | Uploaded on GitHub Release |
| Vercel production deploy | See deployment section |
| v0.3.2 rollback availability | **Preserved** |

### Final published artifacts

| Platform | Filename | Bytes | SHA-256 |
|---|---|---|---|
| Windows x64 | `NEUD-Setup-0.3.3-x64.exe` | 465492533 | `c621ec9e1e9f3f07292b7cb518c43d62a7d21230261399ac9341892cde0d2f1a` |
| macOS arm64 | `NEUD-0.3.3-arm64.dmg` | 282097714 | `99e4c76f7c70c1e359403621a28aefa381e2bfe5f10c336e83ecbbca1a86985b` |
| macOS arm64 | `NEUD-0.3.3-arm64.zip` | 273678700 | `d04131ed0451474a55e4d8f61c347daed7517136930c1eebbe94987d4f1376fd` |

Also published: `NEUD-Setup-latest-x64.exe`, `latest.yml`, `latest-mac.yml`, and blockmaps.

Windows CI source: https://github.com/trevorneuenswander/neud/actions/runs/41558076159

### Owner acceptance (pre-publish)

| Item | Result |
|---|---|
| Mic Tally layout 3/2/1 | PASS |
| SQ-5 connection lifecycle (physical) | PASS |
| Dual UltraStudio | PASS (prior) |
| Final regression | 125/125 |

### Superseded RCs

All pre-`125316a` v0.3.3 RC installers remain superseded and were **not** published.

### Notes

- Feed-level auto-update verification (latest.yml / latest-mac.yml version `0.3.3`) is performed publicly.
- Installed-app upgrade from a running v0.3.2 binary was **not** executed in this publication pass.
- Windows `NEUD-Setup-0.3.3-x64.exe.blockmap` was regenerated locally with `app-builder blockmap` from the verified installer (CI engineering artifact omitted blockmaps).
