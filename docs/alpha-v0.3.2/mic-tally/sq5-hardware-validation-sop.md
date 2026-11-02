# Mic Tally — SQ-5 hardware validation SOP

**Status:** **PASSED** — Owner confirmed physical Allen & Heath SQ-5 Mic Tally validation for v0.3.2 (Ethernet/TCP MIDI; LIVE/MUTED/FADER DOWN; idle retention; disconnect→UNKNOWN; auto-reconnect/resync; manual Disconnect; compact UHD graphic).

**Simulated vs hardware:** Complete this SOP only with a physical Allen & Heath SQ-5. Simulation mode results are not a substitute.

## Owner prerequisites

1. SQ-5 and NEUD computer on the same appropriate LAN (avoid untrusted public networks).
2. SQ Utility → General → MIDI: note the SQ MIDI channel; confirm TCP MIDI is available on the network port.
3. Confirm NRPN Fader Law setting (Mic Tally defaults assume **Linear** taper tables).
4. Note the SQ-5 IPv4 address.
5. Install/open NEUD build that includes Mic Tally package v1 (development branch). Install the **Mic Tally** builtin package (opt-in; do not auto-install into other projects).

## Procedure

1. Connect SQ-5 Ethernet and NEUD computer to the same network.
2. On the SQ-5, configure MIDI-over-TCP per manufacturer documentation (network MIDI enabled; note MIDI channel).
3. In NEUD → Mic Tally project → Data Source, enter mixer IP and TCP port **51325** (or verified alternate only if docs change).
4. Set MIDI channel to match the SQ mixer MIDI channel.
5. Assign Mic Slots 1–3 to three input channels. Confirm duplicate assignment is rejected.
6. Click **Connect**. Confirm connection status becomes connected and diagnostics show TCP connected.
7. Toggle mute ON/OFF on each assigned input. Confirm Data Source and UHD display update to MUTED / non-muted states without claiming LIVE until fader is known and above threshold.
8. Move each fader fully down and above the configured threshold. Confirm FADER DOWN vs LIVE precedence.
9. Confirm LIVE never appears when mute or fader is unknown.
10. Recall a scene that changes mutes/faders for the assigned inputs. Confirm indicators briefly go UNKNOWN (or refresh) then settle to authoritative states — no stale LIVE.
11. Disconnect the network cable (or disable link). Confirm all slots show UNKNOWN / disconnected presentation.
12. Restore network. Confirm automatic reconnect (if enabled) recovers and re-queries state.
13. Measure update latency (mute press → graphic change) with a stopwatch or frame-accurate capture. Record the measured value; do not publish a guaranteed SLA until repeated runs agree.
14. Capture a packet trace or diagnostics log and confirm NEUD outbound MIDI contains **get** queries only (no mute/level/scene control bytes).

## Pass / fail

| Check | Pass criteria |
| --- | --- |
| Connect | TCP session to :51325 |
| Mute | MUTED vs unmuted updates event-driven |
| Fader | FADER DOWN / LIVE follow threshold |
| Scene | No stale LIVE after recall |
| Disconnect | UNKNOWN immediately |
| Reconnect | State re-synced |
| Read-only | No control NRPN/CC writes observed |

## Record

- NEUD app version / commit:
- SQ firmware:
- MIDI channel / fader law:
- Measured mute→graphic latency:
- Packet-capture confirmation of read-only gets:
- Result: PASS / FAIL / BLOCKED
