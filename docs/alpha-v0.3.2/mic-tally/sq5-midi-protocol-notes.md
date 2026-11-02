# Allen & Heath SQ-5 MIDI protocol notes (Mic Tally)

**Status:** Software review of published documentation. Physical SQ-5 Mic Tally validation **PASSED** (Owner confirmed for v0.3.2).

## Sources

1. [SQ MIDI Protocol Issue 5 (PDF)](https://www.allen-heath.com/content/uploads/2023/11/SQ-MIDI-Protocol-Issue5.pdf)
2. [SQ MIDI Protocol – Firmware V1.6 (support article)](https://support.allen-heath.com/hc/en-gb/articles/47793519540497-SQ-MIDI-Protocol-Firmware-V1-6)
3. [SQ MIDI and DAW Control](https://support.allen-heath.com/hc/en-gb/articles/45947110744465-SQ-MIDI-and-DAW-Control)

## Verified from documentation

| Topic | Finding |
| --- | --- |
| Transport | MIDI over TCP/IP on the SQ network port |
| TCP port | **51325** |
| Client role | Connect to SQ IP:51325; do not invent alternate ports |
| Mixer MIDI channel | Configurable 1–16 on the SQ |
| DAW strip channel | Always one higher than the SQ mixer MIDI channel |
| Input mutes | Absolute NRPN mute on/off using mute parameter tables (Ip1 = MB `00` LB `00`, … Ip48 = MB `00` LB `2F`) |
| Input levels to LR | Absolute NRPN level with coarse/fine (Ip1→LR = MB `40` LB `00`, …) |
| Fader law | Linear taper (16384 steps) or Audio taper — Mic Tally defaults interpret **Linear** tables |
| State query (“get”) | Documented: `BN 63 MB BN 62 LB BN 60 7F` returns current mute/level/pan/assign |
| Scene recall | Bank select (`BN 00 BK`) + program change (`CN PG`); SQ also emits these on recall |
| Channel names | **Not documented** in SQ MIDI protocol — Mic Tally uses local labels only |

## Read-only Mic Tally policy

Allowed outbound messages:

- Documented NRPN **get** queries for selected input mute + input→LR level only.

Forbidden outbound messages (not implemented):

- Mute on/off/toggle
- Absolute or relative level set
- Scene recall
- Assign / pan writes
- Soft key presses
- Any other control NRPN

## Default fader-down threshold

From Issue 5 **Example Linear Taper Level Values**:

- −40 dB ≈ VC `0x51`, VF `0x4F` → 14-bit value **10447**

Mic Tally uses 10447 as the default inclusive “fader down” threshold. Operators can change it in the Data Source UI.

## Scene recall strategy

On scene bank+program:

1. Invalidate mute/fader confidence for selected channels (show UNKNOWN, never stale LIVE).
2. Re-issue get queries for selected channels.
3. Re-arm LIVE/MUTED/FADER_DOWN only after responses arrive.

No Excel scene→fader map is used.

## Limitations (documented)

- Channel name retrieval over MIDI is **unsupported** per published SQ MIDI docs.
- Physical SQ-5 connectivity, mute/fader indications, idle retention, disconnect→UNKNOWN, and auto-reconnect/resync **PASSED** Owner hardware validation for v0.3.2. Latency SLAs and scene-storm stress are not claimed.
- Avantis reference `index.html` / `server.js` were **not present** in the workspace; visual design follows the Owner brief + SQ docs, not a copied Avantis binary protocol.
