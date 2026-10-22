# Key + Fill architecture (Phase 2B.2B)

## Why subdevice count alone was wrong

UltraStudio HD Mini exposes **one** DeckLink scheduleable subdevice/endpoint but **two** physical 3G-SDI outputs. Blackmagic’s native **external keying** path (`SupportsExternalKeying` + `IDeckLinkKeyer::Enable(true)`) drives:

- SDI A → Fill
- SDI B → Key

from **one** scheduled BGRA frame with alpha. That is not the same as two independently scheduleable DeckLink ports.

## Key + Fill transports

| Transport | Meaning | Operator UI |
| --- | --- | --- |
| `nativeExternalKey` | One logical endpoint; hardware splits Fill/Key | Port + Mode Key + Fill (no Key Port dropdown) |
| `pairedPorts` | Two scheduleable endpoints; NEUD schedules Fill and Key | Fill Port + Key Port (future) |

`keyFill = true` when either transport is available.

## Native external keying (HD Mini) — SDK mechanism

Source of truth: DeckLink SDK 16 `KeyerOutput` sample + `IDeckLinkKeyer`:

1. `EnableVideoOutput(mode, bmdVideoOutputFlagDefault)`
2. `IDeckLinkKeyer::Enable(true)` — external keying
3. `IDeckLinkKeyer::SetLevel(255)` — full 0–255 key range (`uint8_t`)
4. Schedule **BGRA** frames containing RGB + alpha
5. `StartScheduledPlayback`
6. On Stop: stop playback, `DisableVideoOutput`, `IDeckLinkKeyer::Disable`

Mode support is queried with `bmdSupportedVideoModeKeying` when starting Key + Fill (falls back to default if needed).

## Alpha contract for native keyer

| Stage | Representation |
| --- | --- |
| Chromium source | Premultiplied BGRA (verified 2B.2A) |
| DeckLink frame for external keying | **Straight** BGRA (match KeyerOutput `QImage::Format_ARGB32`) |
| Fill-only | Premultiplied over black, A=255 (unchanged) |

Conversion: explicit premul → straight in the native addon before schedule. Software Key-plane generator from 2B.2A remains for tests/pairedPorts; it is **not** scheduled as a second HD Mini output.

## First hardware validation

- Device: UltraStudio HD Mini
- Mode: **720p59.94** (BGRA already proven)
- Avoid 1080p59.94 until YUV/alpha path is designed (BGRA unsupported there)

## Polarity

Expect white = opaque on Key SDI (confirm on switcher). No operator polarity control yet.
