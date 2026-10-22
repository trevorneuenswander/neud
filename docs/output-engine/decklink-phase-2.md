# DeckLink Phase 2 notes

Phase 2A uses one Fill output. Key + Fill is still later.

The DeckLink SDK stays in its own native addon, `desktop/native/decklink`, separate from the macOS presentation helper. The addon compiles as a stub unless `NEUD_DECKLINK_SDK` points at official headers. Desktop Video stays a machine install. NEUD does not redistribute the SDK.

The published display still renders through the existing output URL, in a hidden offscreen window with alpha preserved. Fill composites that frame over black and schedules it with `ScheduleVideoFrame` / `StartScheduledPlayback` / `ScheduledFrameCompleted`. Tests use the same session rules through a mock transport. Setup details are in `docs/output-engine/decklink-setup.md`.

Phase 1 does not link the DeckLink SDK. This note is only so the monitor adapter does not block a later video I/O adapter.

## Adapter boundary

`OutputEngine` already treats devices as `adapterType: "display" | "decklink"`. Computer monitors implement discovery, start, stop, and status. A `DeckLinkOutputAdapter` can supply devices with the same route and session IDs. Fill and Key+Fill belong on device capabilities, not on the route table's generic columns.

## SDK integration options

- Blackmagic Desktop Video driver plus the DeckLink SDK (`DeckLinkAPI.h` on Windows, `DeckLinkAPI.framework` on macOS).
- A small native Node addon, or a sidecar process, is required. Electron cannot render SDI from a `BrowserWindow` backing store directly.
- Likely path: render the published display into a pixel buffer (offscreen `BrowserWindow` or shared texture), then schedule frames with the DeckLink output API.
- Do not put device index, connector, or pixel-format fields into the generic route type. Store them in route configuration JSON for that adapter.

## Library paths

- Windows: Desktop Video install under `C:\Program Files\Blackmagic Design\Blackmagic Desktop Video` and the SDK's `Win\include` / `Win\Samples` libraries.
- macOS: `/Library/Frameworks/DeckLinkAPI.framework` after Desktop Video is installed. Builds need the framework headers and an entitlements/hardened-runtime exception when the app is signed.

Computer-display output composites the graphic’s existing alpha over solid black at the output surface. Preview, pin, and the display HTML keep their current transparency. DeckLink must not reuse that black composite: Fill can composite according to a fill policy, and Key + Fill must keep the source alpha to build fill and key, including premultiplied alpha. Alpha is not baked into Stream Bid, Stream Ticker, or Quail HTML.

## Fill and Key + Fill

- Fill is one SDI output of the composited graphic, opaque RGB.
- Key + Fill uses two connectors: key is the alpha plane, fill is the color plane. The downstream switcher composites them.
- A physical HDMI monitor cannot do this. Monitor output keeps opaque backing and must not be treated as key.

## Alpha and pixel formats

DeckLink commonly expects:

- 8-bit BGRA or 10-bit YUV for fill
- Separate key for Key+Fill, sometimes with premultiplied color in the fill
- Confirm with the selected mode whether the card wants straight or premultiplied alpha. Wrong premultiplication produces dark or bright edges. Phase 1 monitor fit does not premultiply.

Frame scheduling should follow the selected mode's frame rate (for example 25, 29.97, 50, or 59.94) and drop or repeat frames instead of blocking the Electron UI thread.

## Discovery later

Enumerate cards and connectors through `IDeckLinkIterator`, then list display modes on each output. Report resolution, frame rate, pixel format, fill, and key+fill as capabilities. Phase 1 does not call that API.
