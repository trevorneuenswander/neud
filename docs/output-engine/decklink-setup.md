# DeckLink setup

Phase 2A sends one Fill signal. Key + Fill is not implemented.

## Prerequisite

Install **Blackmagic Desktop Video** on the computer that will output SDI. NEUD does not ship the DeckLink driver or the DeckLink SDK. If Desktop Video is missing, NEUD still starts and the Output page reports that Blackmagic DeckLink is unavailable.

Supported for this phase:

- Windows x64
- macOS Apple Silicon
- A DeckLink or UltraStudio output that Desktop Video can see

The exact cards are whatever the installed Desktop Video SDK enumerates. NEUD does not keep its own model list.

## Development

SDK headers are needed only when compiling the hardware path. Download the **DeckLink SDK 16.x** from Blackmagic (verified: **16.0**) and point the desktop build at it:

```bash
NEUD_DECKLINK_SDK=/path/to/DeckLink\ SDK npm run build -w @neud/desktop
```

Expected locations:

- macOS: `Mac/include/DeckLinkAPI.h` (+ `DeckLinkAPIDispatch.cpp`)
- Windows: `Win/include/DeckLinkAPI.idl` (MIDL generates `DeckLinkAPI.h`; NEUD uses `decklink-dispatch-win.cpp`)

Without `NEUD_DECKLINK_SDK`, ordinary desktop builds may compile a stub for local development. The stub reports the SDK as unavailable. Unit tests use a mock scheduler and do not need a card.

**Windows release packaging must not ship a stub.** Set `NEUD_REQUIRE_REAL_DECKLINK=1` (already set by `npm run package:win` and the Release Windows workflow). Missing SDK or a stub addon fails the packaging job. See [decklink-windows-release.md](./decklink-windows-release.md).

Do not commit the Blackmagic SDK into this repository. Desktop Video is a machine prerequisite, not an app resource.

## Runtime

1. Open Output and choose Blackmagic DeckLink.
2. Pick the output connector, not only the card name. A Duo-class card can expose several outputs.
3. Pick a video mode returned by the SDK. Frame rates stay as rationals, such as `60000/1001`.
4. Start. The session becomes Live after the first rendered frame is prerolled and scheduled playback has started.
5. Stop, sign out, or quit releases the output.

Fill composites the display over black. The published display HTML is unchanged, and its alpha is kept until the Fill frame is built. Stream Bid white stays white. Stream Ticker transparency becomes black on the Fill output.

## Color

The offscreen renderer reads Chromium’s paint buffer via `NativeImage.toBitmap()`. Channel order is probed at runtime (BGRA vs RGBA) and normalized to BGRA before DeckLink. Fill treats alpha as straight and composites it over black in the native addon, then schedules `bmdFormat8BitBGRA`. Scheduling uses the SDK display mode’s exact `frameDuration`/`frameTimescale` (for 1080p59.94: 1001/60000). There is no software YUV or legal-range conversion. The card may still convert to YUV for SDI. Treat color as unverified until a hardware pass confirms channel order, white level, and black level.

## Troubleshooting

- No Blackmagic DeckLink outputs detected: Desktop Video is installed, but no output endpoint was enumerated. Check the Desktop Video setup application and the cable.
- DeckLink is unavailable: the stub addon loaded, or the driver is missing. Install Desktop Video and restart NEUD.
- Configured DeckLink video mode is no longer available: the saved mode is not on that output anymore. Edit the route and choose a current mode.
- BGRA 8-bit is not supported: the selected mode failed `DoesSupportVideoMode` for Fill BGRA. Do not switch to YUV automatically; pick another mode or card.
- Device removed: the endpoint disappeared. The route stays saved. Start it again after the device returns. NEUD does not move the route to another output.
