# NEUD Alpha v0.3.2 — Supabase Egress and Billing Assessment

**Date:** 2026-11-02  
**Org:** NEUD (`cdhdwiwlkjgkkfsjchhu`)  
**Production:** `abtvefbwnismoqweokqu` (neud, ACTIVE_HEALTHY, linked)  
**Preview:** `qiilpmtfurhtczizduwz` (NEUD Alpha Preview, ACTIVE_HEALTHY)  
**Method:** Read-only Supabase CLI (`inspect db calls`, `inspect db traffic-profile`, `db query`). No billing changes. No migrations. No production data writes.

---

## 1. Actual current usage

### Org billing egress (dashboard)

| Signal | Status |
|---|---|
| Owner-reported Free allowance | **5 GB** |
| Owner-reported usage | **~6.02 GB** (overage **~1.02 GB**) |
| Live org egress chart / service breakdown via CLI or MCP | **Not available** |

**Missing:** Supabase Management API org usage / billing egress bytes could not be retrieved in this session (no CLI access-token file; Supabase MCP authenticated only to unrelated org “Garden Trader”, and `get_organization` for NEUD returned permission denied). Re-open the Supabase Dashboard → Organization → Usage to confirm the live counter after December 1 planning.

Do **not** treat local desktop traffic as proof that the org counter has already fallen.

### Production database evidence (this inspection)

| Metric | Value |
|---|---|
| DB postmaster start | 2026-10-21 01:05 UTC (~12 days of `pg_stat_statements` accumulation) |
| `display_revisions` rows | 26 |
| Avg `html_content` length | **~82,326 bytes** |
| Max HTML | ~124 KB |
| Total HTML at rest | ~2.1 MB |
| `displays` (active) | ~19 |
| `activity_events` | 1,618 (~1.7 MB table) |

Lifetime

## 2. Production versus Preview breakdown

| Project | App traffic in `inspect db calls` | Role |
|---|---|---|
| **Production** `abtvefbwnismoqweokqu` | Dominant — hundreds of thousands of PostgREST hits on displays / revisions / RPCs | Primary egress source |
| **Preview** `qiilpmtfurhtczizduwz` | Near-idle (migration / housekeeping statements only in top calls) | Negligible for current overage |

Org Free quota is **shared**. Preview is not the current problem.

---

## 3. Identified high-traffic endpoints (production)

From `supabase inspect db calls --linked` (cumulative since 2026-10-21):

| Calls (approx) | Pattern | Egress implication |
|---|---|---|
| 589k | JWT / `set_config` per request | Per-request overhead |
| **87k** | `display_revisions` id-only by `display_id` | Smaller |
| **87k** | `displays` metadata by project+slug+type | Metadata |
| **87k** | `displays` metadata by slug+type | Metadata |
| **87k** | `display_revisions` **SELECT \*** by `display_id = ANY(...)` | **Dominant HTML egress** |
| **46k** | `display_revisions` **SELECT \*** by id | Full row / HTML |
| **33k** | `get_online_display_viewer_bundle` | Full viewer HTML RPC |
| **28k** | `register_hosted_project_for_desktop` | Repeated desktop registration |
| 22k | `profiles` select | Small |

### Order-of-magnitude byte estimate (historical, not billing invoice)

Using avg HTML ≈ 82 KB:

- 86.7k × 82 KB ≈ **~7.1 GB** attributable to full revision `SELECT *` alone over the stats window.
- 32.7k × ~80 KB ≈ **~2.6 GB** from online viewer bundle RPC (same window).

These are **database call × payload** estimates. They align with Free-plan overage magnitude but are **not** a substitute for the dashboard egress meter.

Traffic profile: `displays` write-heavy; `display_revisions` and `activity_events` read-heavy; Auth sessions/refresh write-heavy (expected).

---

## 4. Before / after Phase 1 optimizations

| Item | Finding |
|---|---|
| Phase 1 code on branch | Present locally (`c4dbab7` and later): selective revision metadata + body fetch, register cache, 180s display sync, Activity idle skip, SEMA ops off Activity |
| Published / production desktop installers | **Have not received these optimizations** (branch not pushed/released) |
| `pg_stat_statements` | Still dominated by `display_revisions` **SELECT \*** — consistent with **pre-optimization clients still running** and/or remaining `select("*")` call sites |
| Content-hash-only metadata selects | **Not** visible as a top call shape in current production stats |
| Attribution of org GB drop to Phase 1 | **Invalid until shipped** to real desktop instances and re-measured on the dashboard |

**Conclusion:** Phase 1 is **necessary but not yet proven sufficient in production**. Sufficiency cannot be claimed from local benchmarks.

---

## 5. Idle instances and SEMA controller traffic

| Source | Assessment |
|---|---|
| Idle desktop + display sync | Still the main risk while full revision pulls run ~per cycle. Interval lengthening (60→180s) helps only after deploy. |
| Hosted viewer status polling | `get_online_display_viewer_bundle` remains a major HTML RPC; needs metadata/status-only endpoint after deploy. |
| SEMA controller / Jump / Highlight / Sheets | Schedule state is **local SQLite + Google Sheets**. SEMA ops were redirected to local `sema-ops.log` in Phase 1 — **low Supabase impact once deployed**. SEMA is **not** the historical egress driver. |
| Activity sync | Small payloads vs revision HTML; further reduced after SEMA Activity suppression ships. |

---

## 6. Estimated monthly consumption (post-deploy, model only)

Assumptions: Phase 1 selective HTML + register cache + 180s sync **deployed**; occasional online viewer use; Broad Arrow + SEMA installed.

| Active always-on desktops | Est. monthly org egress | Free 5 GB realism |
|---|---|---|
| 1 | **0.5–2 GB** | Likely OK if viewer polling fixed |
| 5 | **2–8 GB** | Borderline — may exceed Free |
| 10 | **4–15 GB** | Unrealistic on Free without further cuts |

These are **forward estimates**, not measured post-deploy invoices.

---

## 7. Recommended additional optimizations

1. **Ship Phase 1** to production desktops; freeze a baseline dashboard egress screenshot the day of release.
2. Replace or throttle `get_online_display_viewer_bundle` polling with a **status/metadata** RPC (hash + enabled flags only).
3. Audit remaining `cloud-display-client` `select("*")` paths; ensure sync never uses the deprecated full-fetch helper in idle loops.
4. Cap or backoff `register_hosted_project_for_desktop` even harder (TTL already cached in Phase 1 — verify on real hosts).
5. Re-run `inspect db calls` 7–14 days after ship; confirm `SELECT *` revision calls drop by orders of magnitude.
6. If Free still trends >4 GB/month with 2–3 operators, upgrade to Pro.

---

## 8. Free versus Pro recommendation

**Stay on Free for now**, contingent on:

1. Publishing the Phase 1 egress fixes in the next desktop release, and  
2. Re-measuring org egress within 7–14 days.

**Upgrade to Pro** if, after those fixes are live:

- Org egress remains > ~4 GB/month with normal operator load, or  
- December 1 restrictions begin while the meter is still over allowance and ship date slips.

Do **not** upgrade solely based on historical pre-fix overage without giving the shipped optimizations a measured window.

---

## 9. December 1, 2026 restriction risk

| Factor | Risk |
|---|---|
| Already over Free allowance (owner report) | **Elevated** |
| Phase 1 not yet in published builds | Optimizations **do not** currently reduce production egress |
| Preview idle | Low contribution |
| Time to Dec 1 | Limited runway to ship + prove reduction |

**Risk rating:** **High until Phase 1 is released and the dashboard meter trends down.** Soft restriction / overage enforcement beginning December 1 remains plausible if nothing ships.

---

## 10. Information gaps (explicit)

Unable to obtain in this session:

- Live org Usage GB counter and service pie (Dashboard / Management API).
- Per-project egress split from billing (only DB call proxies).
- True before/after GB after Phase 1 deploy (not deployed).
- Edge / Storage CDN byte charts (Storage objects previously measured at 0 for packages).

---

*No Supabase plan change, migration, or production data mutation was performed.*
