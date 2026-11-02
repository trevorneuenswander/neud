# Supabase egress audit — NEUD Alpha v0.3.2 Phase 1

**Date:** 2026-11-02 (inspection)  
**Org Free allowance:** 5 GB (reported used ~6.02 GB, overage ~1.02 GB)  
**Production:** `abtvefbwnismoqweokqu`  
**Preview:** `qiilpmtfurhtczizduwz`  
**Method:** Read-only `supabase db query --linked`, `supabase inspect db traffic-profile`, `supabase inspect db calls`. No billing changes. No production migrations.

## Phase A — Measured inventory (production)

| Signal | Value |
|---|---|
| `activity_events` rows | 1,618 (~1.7 MB table; ~442 KB payload text) |
| Peak activity days | 2026-10-21: 83 events (~24 KB); 2026-10-27: 94 (~25 KB) |
| Storage objects | **0** (project packages are not the egress source) |
| Auth users / profiles | 2 / 2 |
| Cloud `displays` / `display_revisions` | 18 / 26 |
| Avg `display_revisions.html_content` | **~82 KB** (max ~124 KB; total HTML ~2.1 MB at rest) |

### Top PostgREST call counts (`inspect db calls`)

| Approx calls | Query pattern | Egress implication |
|---|---|---|
| 585k | JWT/`set_config` per request | Overhead on every API hit |
| **86.6k** | `display_revisions` SELECT `*` by `display_id` | **Dominant** — full HTML each sync |
| 86.6k | `displays` by project+slug+type | Metadata (smaller) |
| 86.6k | `displays` by slug+type | Metadata |
| 46k | `display_revisions` by id | Often full row |
| **32.7k** | `get_online_display_viewer_bundle` | Full viewer HTML for hosted/online |
| **27.8k** | `register_hosted_project_for_desktop` | Repeated idempotent RPC from display sync |
| 22k | `profiles` select | Small |

### Rough byte estimate (production historical)

- 86.6k × ~82 KB ≈ **~7.1 GB** attributable to full revision HTML pulls alone (order-of-magnitude; matches Free overage).
- 32.7k × ~80 KB ≈ **~2.6 GB** from online viewer bundle RPC (hosted portal / status polling).
- Activity sync payloads are **negligible** vs display revision HTML.
- Preview project could not be queried in the same CLI session without re-linking; treat Preview as a secondary contributor until measured separately. Org quota is shared.

### Traffic profile highlights

- `public.displays`: write-heavy  
- `public.activity_events`: read-heavy (pulls)  
- Auth `sessions` / `refresh_tokens`: write-heavy (expected session keep-alive)

## Phase B — Architecture findings

1. Display sync pulled **all revision HTML** every cycle via `select("*")`.
2. `reconcileHostedProjectAndDisplayIdentity` called `register_hosted_project_for_desktop` on every display pull path (~1/min/display historically).
3. Hosted status hook `useHostedDisplayBundleStatus` polls `get_online_display_viewer_bundle` at display refresh rate (full HTML).
4. Activity sync interval 45s + Realtime; routine SEMA `manual.override` events previously amplified push volume (small absolute bytes, still unnecessary).
5. Project package Storage is empty — **not** an egress culprit.

## Phase C — Optimizations implemented (code)

1. **Selective revision body fetch** — metadata first (`content_hash` only), HTML only when local missing/mismatch (`cloud-display-client.ts`, `display-sync-pull.ts`).
2. **Register RPC session cache** — skip repeat success for same project id (`hosted-identity-reconciliation.ts`).
3. **Display sync periodic** 60s → **180s**.
4. **Activity periodic idle pull skip** when no pending/failed and last pull &lt; 3 minutes.
5. **Stop recording routine SEMA ops as Activity** (local `sema-ops.log` only) — reduces future push chatter.

## Phase D — Projection (post-fix, estimate)

Assumptions: one always-on desktop instance, Broad Arrow + SEMA, online viewer used occasionally.

| Scenario | Idle monthly (est.) | Notes |
|---|---|---|
| 1 desktop | **0.3–1.5 GB** | After selective HTML; Auth + Realtime + occasional pulls |
| 5 desktops | **1.5–6 GB** | Linear with open sessions; may still press Free cap |
| 10 desktops | **3–12 GB** | Likely needs Pro if always-on + hosted viewers |

**Recommendation:** Do **not** upgrade yet; ship these optimizations, re-measure org egress after 7–14 days. If still &gt;4 GB/month with 2–3 operators, upgrade to Supabase Pro (~$25/mo + egress) with justification from measured display-sync/viewer traffic.

## Limitations

- Supabase dashboard service-level byte charts were not available via CLI; call counts + payload sampling used instead.
- Preview project attribution incomplete without a separate linked inspection pass.
- Hardware/online viewer load tests not run in this phase.
