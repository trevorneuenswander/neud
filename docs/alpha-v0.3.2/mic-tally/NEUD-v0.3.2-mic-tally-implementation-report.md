# NEUD Alpha v0.3.2 — Mic Tally Implementation Report

**Branch:** `feature/v0.3.2-stability`  
**Authorization:** No commit, push, tag, deploy, publish, or production Supabase changes.  
**Date:** 2026-11-02

---

## 1. Architecture summary

Mic Tally is a new **builtin project package** (`slug: mic-tally`, `projectType: mic-tally`, package version **1**) modeled on SEMA:

- Package builder + catalog entry (opt-in install; no legacy auto-migrate).
- Local SQLite operational table `mic_tally_state` (migration **049**).
- Desktop service owns the SQ-5 TCP MIDI session and simulation.
- Canonical display payload via existing `/api/display/.../data` + display-bridge SSE.
- Portal Data Source page for connection, slots, tally settings, simulation, diagnostics.
- One bundled UHD transparent graphic: **Mic Tally — Three Microphones UHD**.

Broad Arrow and SEMA packages, displays, and baselines are untouched (SEMA remains package **v10**).

---

## 2. SQ-5 protocol documentation and verified capabilities

See `docs/alpha-v0.3.2/mic-tally/sq5-midi-protocol-notes.md`.

| Capability | Status |
| --- | --- |
| TCP MIDI port **51325** | **Documented** (A&H Issue 5 / FW V1.6) |
| Input mute NRPN absolute on/off | **Documented** |
| Input→LR level NRPN absolute | **Documented** |
| Read-only “get” (`BN 60 7F`) | **Documented** — only outbound class Mic Tally sends |
| Scene bank+program | **Documented** — invalidate + re-get |
| Channel names over MIDI | **Unsupported** in published SQ MIDI docs |
| Hardware-verified on SQ-5 | **PASSED** (Owner confirmed) |

Avantis reference `index.html` / `server.js` were **not found** in the workspace; behavior follows SQ docs + Owner brief, not Avantis TCP/port hardcodes.

---

## 3. Files created or modified

### Created (primary)

- `desktop/src/packages/mic-tally/*` — protocol, MIDI parser, TCP client, tally rules, service, hydration, canonical payload
- `desktop/src/packages/mic-tally-package-builder.ts`
- `desktop/src/displays/bundled/mic-tally-three-mics-uhd-v1.html`
- `desktop/src/database/migrations/049_mic_tally_state.sql`
- `src/components/mic-tally/MicTallyDataSourceClient.tsx`
- `src/graphics/mic-tally/mic-tally-api.ts`
- `desktop/scripts/test-neud-v0-3-2-mic-tally.mjs`
- `docs/alpha-v0.3.2/mic-tally/*` — protocol notes, hardware SOP, screenshots, this report

### Modified (additive)

- `builtin-package-catalog.ts`, `project-package-service.ts`, `migrate.ts`, `bundled-display-sources.ts`
- `main.ts`, `local-data-service.ts`, `local-api-server.ts`
- `src/lib/projects/constants.ts`, `capabilities.ts` (+ desktop mirror)
- `ProjectNav.tsx` — **necessary shared fix:** bare `data-source` no longer treated as SEMA (required so Mic Tally keeps `/data-source`)
- `data-source/page.tsx` — Mic Tally client branch

---

## 4. Project package details

| Field | Value |
| --- | --- |
| Key / slug | `mic-tally` |
| Name | Mic Tally |
| Type | `mic-tally` |
| Package version | **1** |
| Modules | Overview, Data Source, Displays, Settings |
| Display | `mic-tally-three-mics-uhd` (3840×2160) |
| Install | Opt-in via builtin package install |
| SEMA baseline | Still **10** |

---

## 5. Data Source UI

Implemented sections:

- Mixer Connection (A&H SQ-5, IP, port, MIDI channel, connect/disconnect/reconnect, status)
- Channel Assignments (3 slots, input select, optional local label, live mute/fader/status)
- Tally Settings (14-bit fader threshold; default **10447 ≈ −40 dB linear**)
- Simulation (enable/disable, mute/fader/scene/unknown helpers)
- Diagnostics (local ring buffer; not cloud Activity spam)

---

## 6. Channel assignment behavior

- Exactly three slots; SQ inputs **1–48**.
- Duplicate inputs rejected by default.
- Changes persist in `mic_tally_state` and publish display revisions immediately.
- No NEUD restart required.

---

## 7. Channel name behavior

- Mixer names via MIDI: **not claimed** (unsupported in SQ MIDI docs).
- Optional NEUD label overrides.
- Default labels: `Input N`.
- UI text states names are local unless overridden.

---

## 8. Scene recall / state synchronization

- On connect / scene: invalidate selected channels → UNKNOWN → send documented **get** queries for mute + LR level.
- Scene MIDI (bank+program) detected when received; Excel scene maps **not** used.
- Reconnect: bounded exponential backoff; disconnect forces UNKNOWN (no stale LIVE).

---

## 9. Display implementation

- Transparent UHD HTML overlay, three horizontal cards, LIVE (green) / MUTED & FADER DOWN (red + distinct text) / UNKNOWN (gray).
- Uses `NEUDDisplay.subscribe` + Mic Tally bridge payload (`dataSource: "mic-tally"`).

---

## 10. UHD screenshots and transparency

Screenshots at **3840×2160** in `docs/alpha-v0.3.2/mic-tally/screenshots/`:

1. `01-all-live.png`
2. `02-all-muted.png`
3. `03-all-fader-down.png`
4. `04-mixed.png`
5. `05-all-unknown.png`
6. `06-long-labels.png`
7. `07-simulation-mixed.png`

**Transparency:** Source CSS sets `html`/`body`/`stage` to transparent. Chrome headless captures composite as RGB on white; true alpha must be confirmed in OBS/vMix / NEUD display host (CSS verified; PNG capture path does not preserve alpha).

---

## 11. Automated test results

`node --experimental-strip-types --test desktop/scripts/test-neud-v0-3-2-mic-tally.mjs`

**7/7 pass** — catalog isolation, display contract, MIDI get builders, running-status mute fixture (Issue 5 bytes), LIVE/MUTED/FADER_DOWN/UNKNOWN rules, duplicate slots, migration 049, read-only client surface.

---

## 12. Regression test results

| Suite | Result |
| --- | --- |
| `tsc` root + desktop | Pass |
| Portal UI + navigation | Pass |
| Mic Tally focused | Pass |
| SEMA upgrade preserve + v0.3.1 stabilization (incl. DeckLink stub gate) | Pass |

No Broad Arrow/SEMA assertion weakenings.

---

## 13. Hardware validation SOP

`docs/alpha-v0.3.2/mic-tally/sq5-hardware-validation-sop.md`

---

## 14. Known limitations

1. Channel names not available over documented SQ MIDI.
2. Chrome screenshot path loses alpha (CSS transparent; host compositor must confirm).
3. Cloud `project_type` enum / catalog publish for Mic Tally **not** added (local builtin only; no production Supabase change).
4. Latency SLA not claimed.
5. Avantis reference sources missing from disk.

---

## 15. Remaining Owner actions

1. Decide whether/when to publish Mic Tally to the cloud project catalog (explicit later authorization).
2. Optional: confirm transparent overlay path in OBS/vMix for a specific broadcast host if needed beyond NEUD Output.

---

## 16. GO / NO-GO for Mic Tally

| Gate | Verdict |
| --- | --- |
| Software architecture isolation | **GO** |
| Documented SQ protocol mapping | **GO** (with named gaps) |
| Simulation / automated tests | **GO** |
| Display UHD layout | **GO** |
| Physical SQ-5 | **PASSED** (Owner confirmed) |
| Production catalog / deploy | **NO-GO** (by design — local builtin only) |

### Overall recommendation

**GO for shipping Mic Tally as hardware-validated on the v0.3.2 release** after remaining software release gates pass. Physical SQ-5 acceptance is complete per Owner confirmation.

### Evidence legend

| Claim | Classification |
| --- | --- |
| Package install + display hydration wiring | **Implemented** |
| TCP MIDI client + get queries | **Implemented** (software) |
| Simulation mode | **Implemented** / **Simulated** |
| Protocol fixtures / tally rules | **Automated-test verified** |
| SQ-5 mute/fader LIVE/MUTED/FADER DOWN, idle, disconnect, reconnect | **PASSED** (Owner hardware) |
| Channel names from mixer | **Unsupported** |
| Transparent UHD compact three-card graphic | **PASSED** (Owner hardware) |

---

**NEUD Alpha v0.3.2 — Mic Tally Implementation Report**
