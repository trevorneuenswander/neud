# FFmpeg LGPL redistribution for NEUD Windows ProRes decoding

NEUD’s Windows ProRes 4444 path is designed to use **shared** FFmpeg libraries under the **LGPL** (not GPL). The pinned BtbN `lgpl-shared` n8.1 build ships **LGPL v3** (`LICENSE.txt`) and embeds `libavcodec license: LGPL version 3 or later`.

## Required libraries

- `avformat`
- `avcodec` (includes the ProRes decoder)
- `avutil`
- `swscale` (BGRA conversion while preserving alpha)

Additional LGPL runtime DLLs shipped by the shared build (for example `swresample`) are staged alongside these when present.

## Pinned Windows x64 source (reproducible)

NEUD pins a **BtbN/FFmpeg-Builds** `lgpl-shared` artifact via:

`desktop/vendor/ffmpeg-windows-lgpl.lock.json`

| Field | Purpose |
| --- | --- |
| `artifact` | Must contain `lgpl-shared` (never a GPL zip) |
| `sha256` | Verified before extract |
| `downloadUrl` / `checksumsUrl` | Provenance |

Fetch + verify:

```text
node desktop/scripts/fetch-windows-ffmpeg-lgpl.mjs
```

This writes `desktop/vendor/ffmpeg-windows-lgpl/current/` (gitignored) with `bin/`, `include/`, `lib/`, and `NEUD-FFMPEG-PROVENANCE.txt`.

When BtbN updates the pinned `n8.1-latest` zip, refresh `sha256` from that release’s `checksums.sha256` before rebuilding.

## Build configuration (must verify before shipping)

BtbN `lgpl-shared` builds are produced **without** `--enable-gpl` and **without** `--enable-nonfree`. Configure approximately as:

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
2. Include FFmpeg copyright and LGPL license texts in the installer / `ffmpeg/` folder (`LICENSE.FFmpeg.txt`, `SOURCE_OFFER.txt`).
3. Offer the corresponding FFmpeg source (or a written offer) matching the shipped binaries — see staged `SOURCE_OFFER.txt` / provenance file.
4. Do not claim FFmpeg is part of NEUD’s proprietary code.
5. Rebuild the Windows decoder with `NEUD_WITH_FFMPEG=1` and `FFMPEG_DIR` only after the LGPL build is verified.

## Alpha contract

NEUD’s Output Engine expects **straight (non-premultiplied) BGRA** from the decoder for canvas upload. Chromium’s paint path then yields the verified **premultiplied** BGRA contract used by DeckLink Key/Fill. Do not flatten transparency or strip the alpha plane during `swscale`.

## Build & package (v0.3.1)

Windows development / packaging sets:

```text
NEUD_WITH_FFMPEG=1
```

`npm run package:win` fetches the pinned LGPL build, compiles `video-decoder-win-ffmpeg.cpp`, and stages DLLs via `package-windows-ffmpeg-lgpl.mjs` into:

- `desktop/dist/platform/windows/*.dll` (beside `neud_video.node`)
- `desktop/dist/platform/windows/ffmpeg/` (inventory + license texts)

`desktop/native/video/binding.gyp` compiles `video-decoder-win-ffmpeg.cpp` when `NEUD_WITH_FFMPEG=1`.
Otherwise Windows builds keep the explicit unavailable stub (`video-decoder-win.cpp`).

`verify-windows-native-release-gates.mjs` fails the package when `NEUD_WITH_FFMPEG=1` but staged DLLs are missing.

## Current status

- macOS: AVFoundation / VideoToolbox (system frameworks — no FFmpeg).
- Windows: FFmpeg LGPL decoder implementation is in-tree (`video-decoder-win-ffmpeg.cpp`).
  Vendor binaries are **not** committed; they are fetched from the lock file during Windows packaging.
  Default local Windows builds without `NEUD_WITH_FFMPEG=1` continue to report the clear
  “FFmpeg is not present in this build” operator message.
