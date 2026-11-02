# Blackmagic Desktop Video compatibility matrix (v0.3.2)

Statuses: **PASS** · **FAIL** · **NOT TESTED** · **NOT SUPPORTED** · **AUTOMATED** (fixture only)

NEUD binds to **SDK-reported capabilities**, not model-name allowlists. Successful UltraStudio testing does **not** certify Duo/Quad hardware.

| Capability | UltraStudio family | DeckLink Duo family | DeckLink Quad family | Other SDK devices |
|---|---|---|---|---|
| SDK enumeration architecture | AUTOMATED + code | AUTOMATED + code | AUTOMATED + code | AUTOMATED + code |
| Driver / Desktop Video detection | PASS (macOS host; no device) | NOT TESTED (hardware) | NOT TESTED | NOT TESTED |
| Supported mode discovery | AUTOMATED | AUTOMATED | AUTOMATED | AUTOMATED |
| Standard Fill output (software path) | Implemented / AUTOMATED | Implemented / AUTOMATED | Implemented / AUTOMATED | Implemented |
| Standard Fill output (physical) | **NOT TESTED** (Owner tomorrow) | NOT TESTED | NOT TESTED | NOT TESTED |
| Key/Fill native external | AUTOMATED fixture | NOT SUPPORTED path (uses pairedPorts when multi-subdevice) | INTERNAL key flag AUTOMATED; physical NOT TESTED | Per SDK |
| Key/Fill paired ports | N/A for single-subdevice | AUTOMATED | AUTOMATED | Per SDK |
| Key/Fill physical verified | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Multi-channel independent outputs | N/A / single endpoint | AUTOMATED | AUTOMATED | Per SDK |
| Device disconnect / reconnect | AUTOMATED | AUTOMATED | AUTOMATED | AUTOMATED |
| Windows real addon packaged | **BLOCKED** (branch not on remote; needs Windows runner) | same | same | same |
| macOS real addon packaged | PASS (`stub: false` in 0.3.2 RC) | PASS (same binary) | PASS | PASS |
| Physical hardware verification | PENDING Owner UltraStudio | NOT TESTED | NOT TESTED | NOT TESTED |

## Architecture notes

- Discovery: `IDeckLinkIterator` → playback-capable devices → persistent id + subdevice index + modes + keying flags.
- Multi-channel cards expose **independently scheduleable SDK subdevices**, not “one row per SDI connector” guesses.
- Channel conflicts: Output engine rejects two live routes sharing an endpoint.
- Silent resolution/FPS downgrade: not performed; unsupported modes fail closed.
