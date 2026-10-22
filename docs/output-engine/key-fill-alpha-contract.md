# Key + Fill alpha contract (Phase 2B.2A — verified)

Status: **verified via live Chromium offscreen paint** (Electron `BrowserWindow` + `NativeImage.toBitmap`, same path as External Device output).

Probe: `desktop/scripts/probe-chromium-source-alpha.mjs`  
Fixture: `desktop/scripts/fixtures/key-fill-alpha-fixture.html`  
Processor: `desktop/src/output/key-fill-processor.ts`  
Probe artifact: `desktop/validation-output/key-fill-alpha/live-probe.json` (gitignored)

## Blackmagic keying vs NEUD Key + Fill

| Concept | Meaning |
| --- | --- |
| **Internal keying** | Card composites Fill over an **incoming** video signal inside the device. |
| **External keying** | Vendor keyer mode for external switchers — **not** dual NEUD ports. |
| **NEUD Key + Fill** | Separate synchronized Fill + Key signals for a downstream external keyer. |

## Verified Chromium → NEUD source contract

| Property | Verified value |
| --- | --- |
| Capture path | Offscreen `BrowserWindow` → `paint` → `toBitmap()` → optional resize → BGRA normalize |
| Channel order (canonical NEUD) | **BGRA** (confirmed via opaque red/green/blue fixture cells) |
| Bytes per channel | 8-bit |
| Row layout | Tight packed (`rowBytes = width × 4`) |
| Alpha representation | **Premultiplied** |
| Evidence | `rgba(255,255,255,0.5)` → RGB≈128, A≈128 (not RGB≈255, A≈128) |
| `rgba(...,0.25)` | RGB≈64, A≈64 |
| `rgba(...,0.75)` | RGB≈191, A≈191 |
| CSS `opacity: 0.5` on white | RGB≈128, A≈128 (same premul pattern) |
| Alpha 0 | RGB≈0, A≈0 |
| Anti-aliased text edges | Partial α with RGB≈α for white glyphs (premul) |
| Soft shadows | Semi-transparent dark pixels with matching α |
| Colorspace at this stage | Display/sRGB authored pixels; Rec.601/709 at SDI encode |

Do **not** infer straight vs premultiplied from the string “BGRA” alone.

## Pipeline branch (source immutability)

```
                    ┌→ Fill-only: existing native/TS over-black path (unchanged in 2B.2A)
source BGRA ────────┤
                    └→ Key + Fill: derive Fill + Key from untouched source copy
```

Generating Fill or Key **must not** mutate the source buffer.

## Canonical Key + Fill plane contract

| Plane | Representation |
| --- | --- |
| Source | **premultiplied** BGRA (as delivered by Chromium/Electron) |
| Fill (Key + Fill) | **reuse source RGB** (already premultiplied) — **no** unpremultiply/re-premultiply cycle |
| Key | grayscale from source alpha; default polarity **white-on-black** (`K = A` → R=G=B=K, A=255) |

If a buffer is known-straight (synthetic/tests), the processor may premultiply via `round(channel × α / 255)` before producing Fill. Live Chromium frames use the copy path.

### Polarity

| Mode | Formula | Default |
| --- | --- | --- |
| `whiteOnBlack` | `K = A` | **yes** (white = opaque) |
| `blackOnWhite` | `K = 255 - A` | config inversion only |

Downstream switcher polarity is **not** yet hardware-validated.

## Examples (live Chromium / premul source)

### Opaque white

| | R | G | B | A |
| --- | --- | --- | --- | --- |
| Source (premultiplied) | 255 | 255 | 255 | 255 |
| Fill | 255 | 255 | 255 | 255 |
| Key | 255 | 255 | 255 | — |

### 50% white

| | R | G | B | A |
| --- | --- | --- | --- | --- |
| Source (premultiplied) | 128 | 128 | 128 | 128 |
| Fill (copy) | 128 | 128 | 128 | 128 |
| Key | 128 | 128 | 128 | — |

### Transparent

| | R | G | B | A |
| --- | --- | --- | --- | --- |
| Source | 0 | 0 | 0 | 0 |
| Fill | 0 | 0 | 0 | 0 |
| Key | 0 | 0 | 0 | — |

### Downstream reference compositor

With premultiplied Fill and white-on-black Key:

`Program = Fill + Background × (1 − Key/255)`

Anti-aliased edges and soft shadows must match this within ±1/channel (no dark/bright halos).

## Fill-only over black (corrected)

Chromium source is premultiplied. Fill-only over opaque black is:

```
RGBout = RGBpremul   // NOT RGBpremul × A
Aout   = 255
A == 0 → RGB black
```

Implemented in:

- `compositeFillOverBlack` / `compositePremultipliedOverOpaqueBackground` (TypeScript)
- `FitCompositeFill` / `WritePremultipliedOverBlackPixel` (DeckLink native)

Historical bug: multiplying premul RGB by α again darkened 50% white from ~128 → ~64.

Key + Fill must not reuse Fill-only’s black-composited buffer.

## Device encode boundary (YUV-ready)

```
Source → semantic Fill/Key → BGRA or YUV8/YUV10 encoder → hardware scheduler
```

Do not bake video-range or YUV conversion into `key-fill-processor`.

## Processor location

Phase 2B.2A: generic TypeScript (`key-fill-processor.ts`) for testability and adapter neutrality.

Future: optional native/shared processor for YUV + large rasters; semantic contract unchanged.

## Debug export

`NEUD_KEY_FILL_DEBUG_EXPORT=1` on the probe writes `source.png`, `fill.png`, `key.png`, `composite-black.png`, `composite-white.png` under `desktop/validation-output/key-fill-alpha/` (gitignored). Not shown on operator Outputs cards.
