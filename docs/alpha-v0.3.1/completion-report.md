# NEUD Alpha v0.3.1 — Development Completion Report

**Status:** Development complete for review. **No commit, push, deploy, tag, or public release performed.**

**App version (in-tree):** `0.3.1` (`package.json`, `desktop/package.json`)  
**Public download catalog current:** remains **Alpha 0.3.0** (`src/lib/releases/neud-releases.ts`)

---

## Branding

### Original palette (v0.3.0)
Documented in `docs/themes/v0.3.0-palette-baseline.md`.

### Updated palette (v0.3.1)
Documented in `docs/themes/v0.3.1-color-refresh.md` — deep navy backgrounds, electric blue `--primary` (`#2f6bff`), violet `--accent` (`#8b7cff`). Semantic `--success` / `--warning` / `--danger` unchanged.

### Rollback
Restore `:root` tokens from the v0.3.0 baseline doc without reverting video/DeckLink/recording/activity fixes.

### Screens / surfaces covered
Token-driven UI (shell, sidebar, forms, dialogs, Output Manager, Performance Monitor, etc.) via `src/app/globals.css`. Splash colors updated in `desktop/src/app/splash-window.ts`.

### Color-only confirmation
Layout, typography, spacing, radii, and behavior were not intentionally changed as part of the palette refresh. Video control layout and Output filtering are separate, non-color fixes.

### Startup / login icon
- Splash embeds `desktop/assets/icon.png` as a data URI (64×64), packaged via `electron-builder.yml` → `extraResources/assets/icon.png`.
- Login continues to use `NeudLogo`, which already shows the official brand mark from `/branding/neud-icon-128.png`.

---

## Video

### Windows FFmpeg packaging
- Implementation: `desktop/native/video/video-decoder-win-ffmpeg.cpp` (LGPL shared libs).
- Build gate: `NEUD_WITH_FFMPEG=1` + `FFMPEG_DIR` in `binding.gyp`.
- Staging: `desktop/scripts/package-windows-ffmpeg-lgpl.mjs`.
- **Blocker for shipping ProRes on Windows:** redistributable LGPL FFmpeg DLLs are **not** vendored in-repo. Default builds still use the unavailable stub until an approved LGPL build is staged.

### Licensing
Follow `docs/licensing/ffmpeg-lgpl.md`. Decode-only; no GPL/nonfree. Encode remains a separate decision.

### ProRes / alpha / 4K
| Capability | Status |
| --- | --- |
| ProRes decode (Windows) | Code ready; **awaiting LGPL DLL packaging + Windows hardware validation** |
| ProRes 4444 alpha | Decoder preserves alpha via `swscale` → straight BGRA |
| 4K (3840×2160) | Decoder uses source dimensions (no forced 1080p downscale); **performance unmeasured on hardware** |
| macOS ProRes | Existing AVFoundation path preserved |

### Control alignment
`VideoPlaybackControls` card variant returns **controls only**. Errors render in `VideoPlaybackStatusLine` below the action/size row (`DeveloperHtmlDisplayCard`).

---

## Output Manager

- Catalog IPC uses `listProjects(..., { scope: "installed" })` filtered to `isPackageInstalled === true`.
- Cloud-only / downloading / incomplete installs are omitted from the Add Output project selector.
- Existing routes are not deleted when a project becomes unavailable (no destructive cleanup added).

---

## Recording

| Platform | Formats |
| --- | --- |
| Windows | **H.264 MP4** via Media Foundation Sink Writer (`recorder-win.cpp`) |
| macOS | H.264 + ProRes 422 HQ + ProRes 4444 (existing AVFoundation) |

- UI: `recordingFormatOptionsForPlatform()` hides ProRes on Windows.
- Backend: `normalizeDiskRecordingConfiguration` + `disk-recording-service` reject non-H.264 on Windows.

### Validation status
| Test | Status |
| --- | --- |
| Windows H.264 file write | **Awaiting Windows hardware / packaged run** |
| macOS formats | Existing path preserved; **re-validate on device** |
| 4K recording | Options exist; **do not claim validated** |

---

## Activity

### Root cause
Overlapping `syncNow` calls (e.g. startup + login) previously **dropped** the second pass, so a device could miss push/pull after sign-in.

### Fix
Busy syncs now call `scheduleFollowUpSync` instead of returning without work.

### Cross-device / offline tests
**Awaiting manual Mac↔Windows verification** (no dual-machine run in this environment). Offline queue + reconnect paths unchanged aside from follow-up scheduling. **No Supabase migration required** for this fix.

---

## DeckLink

### Root cause
Packaged Windows builds can ship a **stub** `neud_decklink.node` when the DeckLink SDK is absent at build time. A stub is not functional hardware support.

### Fix
Operator-facing `EXTERNAL_DEVICE_STUB_BUILD` distinguishes stub builds from missing Desktop Video / load failures. Diagnostics log stub explicitly.

### Remaining owner steps
1. Build Windows with DeckLink SDK present so the packaged addon is **non-stub**.
2. Install Blackmagic Desktop Video on the test PC.
3. Validate Key/Fill with real hardware.
4. **Hardware Key/Fill not verified in this session.**

---

## General

### Automated checks run
- `node --test desktop/scripts/test-neud-v0-3-1-stabilization.mjs` — **9/9 pass**
- `tsc --noEmit` (web + desktop) — **pass**
- `npm run build` — **pass**

### Outstanding limitations
- Windows ProRes requires approved LGPL FFmpeg binaries before claiming playback.
- Windows DeckLink requires non-stub CI/package build + hardware validation.
- Windows H.264 recording and 4K playback/recording need on-device proof.
- Activity Mac↔Windows sync needs dual-install confirmation.
- Public website catalog still advertises **0.3.0** until release authorization.

### Manual verification checklist
- [ ] Splash shows official icon (dev + packaged)
- [ ] Login shows official icon
- [ ] Color tokens / contrast across main screens
- [ ] Video card: controls + Display Size aligned with/without error
- [ ] Output Manager project list = installed only
- [ ] Windows: Record H.264 MP4 playable file
- [ ] macOS: H.264 + ProRes record paths still work
- [ ] Windows: ProRes decode after FFmpeg staging
- [ ] DeckLink: non-stub package + device enumeration
- [ ] Activity: Mac action appears on Windows (and reverse)
- [ ] Offline activity uploads after reconnect

### Release restrictions honored
**No git commit, push, Vercel deploy, GitHub Release, tag, or installer rebuild was performed for v0.3.1.**

---

**NEUD Alpha v0.3.1 — Development Completion Report**
