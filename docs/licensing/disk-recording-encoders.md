# Disk recording encoder licensing (NEUD)

Record to Disk uses **platform system frameworks** where available. It does **not** redistribute GPL or nonfree encoder binaries.

## macOS

| Format | Implementation | License posture |
|--------|----------------|-----------------|
| ProRes 4444 | AVFoundation / VideoToolbox (`AVVideoCodecTypeAppleProRes4444`) | Apple system frameworks |
| ProRes 422 HQ | AVFoundation / VideoToolbox | Apple system frameworks |
| H.264 | AVFoundation / VideoToolbox | Apple system frameworks |

Native addon: `desktop/native/recorder` → `neud_recorder.node`.

## Windows

| Format | Status | Notes |
|--------|--------|-------|
| ProRes 4444 / 422 HQ | **Unavailable** | Encode would require a redistributable encoder (e.g. LGPL FFmpeg with ProRes encode). That is a **separate** licensing decision from NEUD’s decode-only LGPL FFmpeg plan (`docs/licensing/ffmpeg-lgpl.md`). Not bundled. |
| H.264 | **Available (v0.3.1)** | Media Foundation Sink Writer (`desktop/native/recorder/recorder-win.cpp`). System MF H.264 — no FFmpeg redistribute for encode. |

Windows builds report ProRes encode as unavailable. H.264 MP4 uses system Media Foundation.

## Explicit non-goals

- Do not enable FFmpeg `--enable-gpl` / `--enable-nonfree` for recording.
- Do not shell out to a third-party CLI as the default recording architecture.
- Do not claim ProRes encode on Windows until an approved redistributable path exists.
