# FFmpeg LGPL redistribution for NEUD Windows ProRes decoding

NEUD’s Windows ProRes 4444 path is designed to use **shared** FFmpeg libraries under the **LGPL 2.1+** (not GPL).

## Required libraries

- `avformat`
- `avcodec` (includes the ProRes decoder)
- `avutil`
- `swscale` (BGRA conversion while preserving alpha)

## Build configuration (must verify before shipping)

Configure FFmpeg approximately as:

```text
--enable-shared
--disable-static
--disable-gpl
--disable-nonfree
--disable-doc
--enable-avformat
--enable-avcodec
--enable-avutil
--enable-swscale
```

Do **not** enable:

- `--enable-gpl`
- `--enable-nonfree`
- `--enable-libx264` / other GPL encoders (not needed for decode-only)

Confirm the ProRes decoder is present (`ffmpeg -decoders | findstr prores`) and that decoded ProRes 4444 frames expose an alpha-capable pixel format (for example `yuva444p10le`).

## Packaging obligations

1. Ship FFmpeg as **separate DLLs** next to the native addon (dynamic linking). Do not statically link FFmpeg into `neud_video.node` or the Electron executable.
2. Include FFmpeg copyright and LGPL license texts in the installer / `LICENSES` folder.
3. Offer the corresponding FFmpeg source (or a written offer) matching the shipped binaries.
4. Do not claim FFmpeg is part of NEUD’s proprietary code.
5. Rebuild the Windows decoder with `NEUD_WITH_FFMPEG=1` and `FFMPEG_DIR` only after the LGPL build is verified.

## Alpha contract

NEUD’s Output Engine expects **straight (non-premultiplied) BGRA** from the decoder for canvas upload. Chromium’s paint path then yields the verified **premultiplied** BGRA contract used by DeckLink Key/Fill. Do not flatten transparency or strip the alpha plane during `swscale`.

## Build & package (v0.3.1)

```text
set NEUD_WITH_FFMPEG=1
set FFMPEG_DIR=C:\path\to\lgpl-shared-ffmpeg
npm run build -w @neud/desktop
node desktop/scripts/package-windows-ffmpeg-lgpl.mjs
```

`desktop/native/video/binding.gyp` compiles `video-decoder-win-ffmpeg.cpp` when `NEUD_WITH_FFMPEG=1`.
Otherwise Windows builds keep the explicit unavailable stub (`video-decoder-win.cpp`).

## Current status

- macOS: AVFoundation / VideoToolbox (system frameworks — no FFmpeg).
- Windows: FFmpeg LGPL decoder implementation is in-tree (`video-decoder-win-ffmpeg.cpp`).
  **Vendor LGPL shared DLLs are not committed to the repo.** A release package must stage them via
  `package-windows-ffmpeg-lgpl.mjs` after verifying the build configuration above.
  Default CI / local Windows builds without `NEUD_WITH_FFMPEG=1` continue to report the clear
  “FFmpeg is not present in this build” operator message.
