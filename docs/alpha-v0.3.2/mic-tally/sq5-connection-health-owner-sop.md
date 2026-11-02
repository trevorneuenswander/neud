# SQ-5 connection health — Owner validation SOP

**Status:** **PASSED** — Owner confirmed disconnect detection, UNKNOWN transition, automatic reconnect/resync, and manual Disconnect for v0.3.2.

Use this checklist after installing a NEUD build that includes Mic Tally application-level health checks.

## Preconditions

- Mic Tally project configured with mixer IP `192.168.2.87`, TCP port `51325`.
- Three channels assigned and synchronized (LIVE / MUTED / FADER DOWN as appropriate).
- Data Source shows **Connected** (not awaiting channel state).
- Note: only one TCP MIDI client can use the SQ at a time.

## Procedure

1. Connect and synchronize three channels; confirm the UHD graphic matches.
2. Leave the mixer idle (no mute/fader moves) for several minutes.
   - Expect: status remains **Connected**; channel states are retained (not UNKNOWN).
3. Physically unplug the SQ-5 Ethernet cable.
4. Measure time until NEUD reports **Connection lost** / **Reconnecting…**.
   - Soft target: roughly 3–5 seconds after the missed health response deadline (2s interval + 3s timeout), subject to OS scheduling.
5. Confirm all three graphic indicators become **UNKNOWN** (no stale LIVE).
6. Restore Ethernet.
7. Measure time until automatic reconnection and re-synchronization (without clicking Connect or moving a fader).
8. Confirm LIVE / MUTED / FADER DOWN return only after mute+fader GETs succeed.
9. Click **Disconnect** manually.
10. Confirm the project stays **Disconnected** (no automatic reconnect) until **Connect** is clicked again.

## Record

| Step | Observed time / result |
| --- | --- |
| Idle retention (minutes) | |
| Unplug → Connection lost | |
| Indicators UNKNOWN | |
| Cable restore → reconnected | |
| Re-sync without operator action | |
| Manual Disconnect stays down | |

## Notes

- Health checks send documented read-only NRPN mute **get** queries only.
- Do not treat ordinary MIDI silence as disconnection.
- Detection is not guaranteed at exactly 3–5s under all OS TCP stacks; record measured values.
