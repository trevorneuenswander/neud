# NEUD Alpha v0.3.1 — Release Preparation Report

**Date:** 2026-10-23  
**In-tree version:** `0.3.1`  
**Public catalog current:** still **0.3.0** (not flipped)  
**Authorization:** No commit, push, tag, installer publish, or Vercel deploy performed.

---

## 1. Slogan changes

Replaced **The Ultimate Data Stripper** with **Graphics Without Limits.** in:

- `src/lib/branding/app-name.ts` (`APP_TAGLINE`) — login, marketing logo, Open Graph / Twitter titles
- Root and desktop `package.json` descriptions
- `README.md`, `AGENTS.md`, `docs/design-system.md`, brand style guide
- `public/site.webmanifest` and site metadata description

Layouts and typography unchanged. Historical git / patch archives not rewritten.

---

## 2. Windows DeckLink build status

| Item | Status |
| --- | --- |
| Real addon implementation | Present (`desktop/native/decklink/decklink-sdk.cc`) |
| Fail-if-stub gates | **Implemented** (`NEUD_REQUIRE_REAL_DECKLINK=1`, packaging verifiers) |
| Windows x64 compiled binary in this environment | **Not built** — host is Darwin arm64 |
| Packaged Windows installer with real addon | **Blocked** pending Windows CI + SDK secret |

Packaging now **fails** if the DeckLink addon is a stub. Silent stub substitution for release installers is no longer possible via `npm run package:win`.

---

## 3. SDK and native dependency status

| Dependency | Status |
| --- | --- |
| DeckLink SDK version | **16.0** (verified locally via `DeckLinkAPIVersion.h`) |
| Electron | **33.4.11** |
| Windows arch | **x64** |
| Local macOS real addon | Present under `desktop/dist/platform/decklink/` (`stub: false`, arm64) |
| CI DeckLink SDK source | Google Drive + WIF (`NEUD_GCP_BUILD_SERVICE_ACCOUNT`) — see decklink-windows-release.md |

Instructions: `docs/output-engine/decklink-windows-release.md`.

---

## 4. Windows FFmpeg packaging status

| Item | Status |
| --- | --- |
| LGPL decoder implementation | In-tree (`video-decoder-win-ffmpeg.cpp`) |
| Vendor LGPL shared DLLs | **Not in repo** — not staged |
| ProRes playback claim for Windows | **Not claimed** unless `NEUD_WITH_FFMPEG=1` + staged DLLs |
| ProRes encoding on Windows | **Not implemented** (by design) |

Gate: `verify-windows-native-release-gates.mjs` fails if `NEUD_WITH_FFMPEG=1` without DLLs.

---

## 5. Windows H.264 recording packaging status

| Item | Status |
| --- | --- |
| Media Foundation H.264 recorder | In-tree (`recorder-win.cpp`) |
| Packaging inclusion | `asarUnpack` covers `dist/platform/windows/**/*` |
| Packaged verify on Windows | Checks `neud_recorder.node` + `neud_video.node` in win-unpacked |

Cannot confirm packaged Windows load from this Darwin host.

---

## 6. Windows installer preparation status

| Item | Status |
| --- | --- |
| Icon / colors | Approved assets retained (no further visual changes) |
| Slogan | Updated in branding sources |
| Packaging scripts / CI | Ready to build real DeckLink + H.264 |
| Test installer artifact | **Not produced on Darwin** — requires Windows Actions runner + Drive/WIF SDK install |

**Do not publish** an installer claiming DeckLink until the Windows job succeeds with a non-stub addon.

---

## 7. Automated test results

| Check | Result |
| --- | --- |
| `tsc -p desktop/tsconfig.json --noEmit` | Pass |
| `tsc -p tsconfig.json --noEmit` | Pass |
| `npm run build` (Next.js production) | Pass |
| `test-neud-v0-3-1-stabilization.mjs` | Pass |
| `test-neud-readme-branding.mjs` | Pass |
| DeckLink `requireReal` rebuild (macOS SDK 16.0) | Pass (`stub: false`) |
| `verify-windows-native-release-gates.mjs` (Darwin) | Pass — DeckLink real; Windows recorder/video N/A; ProRes **not** claimed |
| `verify-packaged-decklink-addon.mjs` (dist only) | Pass on macOS real addon |
| Packaged Windows installer / win-unpacked gates | **Not run** (requires Windows host) |
| `test:v0-3-0-phase4` | Pass |
| Legacy `test-neud-ui-overhaul.mjs` (full file) | Partially stale vs current UI paths — slogan assertions updated; unrelated failures pre-exist |

---

## 8. Remaining hardware tests

- DeckLink Key/Fill on UltraStudio / DeckLink with Desktop Video (owner — after new Windows installer)
- Windows Record to Disk H.264 on a clean install
- Windows ProRes playback **only if** LGPL FFmpeg DLLs are authorized and packaged

Automated packaging ≠ hardware validation.

---

## 9. Vercel deployment readiness

| Item | Status |
| --- | --- |
| Slogan / metadata in source | Ready |
| Public download catalog flip to 0.3.1 | **Deferred** — checklist in `docs/alpha-v0.3.1/website-flip-checklist.md` |
| Draft release notes | `docs/releases/v0.3.1-github-release-notes.md` |
| Deploy | **Waiting for owner authorization** after installers are published |

---

## 10. Manual prerequisites

1. Confirm repository variable **`NEUD_GCP_BUILD_SERVICE_ACCOUNT`** and Drive/WIF access.
2. Run **Build Windows Development** for a private test installer; run **Release Windows** only when authorized to publish.
3. Optional: stage LGPL FFmpeg under `FFMPEG_DIR` with `NEUD_WITH_FFMPEG=1` only if ProRes playback on Windows is authorized.
4. Owner hardware validation of DeckLink Key/Fill.
5. Explicit authorization to tag, publish installers, flip `neud-releases.ts`, and deploy neud.io.

---

**Release readiness:** **Not ready for public release** until the Windows installer is produced with a verified real DeckLink addon and the owner authorizes publish/deploy.

**NEUD Alpha v0.3.1 — Release Preparation Report**
