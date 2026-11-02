# Blackmagic Desktop Video compatibility matrix (v0.3.2)

Statuses: **PASS** · **FAIL** · **NOT TESTED** · **NOT SUPPORTED** · **AUTOMATED** (fixture only)

NEUD binds to **SDK-reported capabilities**, not model-name allowlists. Successful UltraStudio testing does **not** certify Duo/Quad hardware.

| Capability | UltraStudio family | DeckLink Duo family | DeckLink Quad family | Other SDK devices |
|---|---|---|---|---|
| SDK enumeration architecture | AUTOMATED + code | AUTOMATED + code | AUTOMATED + code | AUTOMATED + code |
| Driver / Desktop Video detection | PASS (macOS host) | NOT TESTED (hardware) | NOT TESTED | NOT TESTED |
| Supported mode discovery | AUTOMATED | AUTOMATED | AUTOMATED | AUTOMATED |
| Standard Fill output (software path) | Implemented / AUTOMATED | Implemented / AUTOMATED | Implemented / AUTOMATED | Implemented |
| Standard Fill output (physical) | PASS (Owner; included with Key/Fill validation) | NOT TESTED | NOT TESTED | NOT TESTED |
| Key/Fill native external | AUTOMATED fixture + **PASS** physical (Owner) | NOT SUPPORTED path (uses pairedPorts when multi-subdevice) | INTERNAL key flag AUTOMATED; physical NOT TESTED | Per SDK |
| Key/Fill paired ports | N/A for single-subdevice | AUTOMATED | AUTOMATED | Per SDK |
| Key/Fill physical verified | **PASS** (Owner confirmed UltraStudio Key/Fill) | NOT TESTED | NOT TESTED | NOT TESTED |
| Multi-channel independent outputs | N/A / single endpoint | AUTOMATED | AUTOMATED | Per SDK |
| Device disconnect / reconnect | AUTOMATED | AUTOMATED | AUTOMATED | AUTOMATED |
| Windows real addon packaged | PASS (Windows CI Build Windows Development on `feature/v0.3.2-stability`) | same | same | same |
| macOS real addon packaged | PASS (`stub: false` in 0.3.2 RC) | PASS (same binary) | PASS | PASS |
| Physical hardware verification | **PASS** (Owner confirmed UltraStudio Key/Fill) | NOT TESTED | NOT TESTED | NOT TESTED |

## Architecture notes

- Discovery: `IDeckLinkIterator` → playback-capable devices → persistent id + subdevice index + modes + keying flags.
- Multi-channel cards expose **independently scheduleable SDK subdevices**, not “one row per SDI connector” guesses.
- Channel conflicts: Output engine rejects two live routes sharing an endpoint.
- Silent resolution/FPS downgrade: not performed; unsupported modes fail closed.
