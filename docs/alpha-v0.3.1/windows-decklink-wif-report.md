# NEUD v0.3.1 — Windows DeckLink Build Integration Report

**Date:** 2026-10-23  
**Host used for local work:** Darwin arm64 (cannot produce Windows x64 installer here)  
**Authorization:** Configure + validate workflow only — no public release, tag, Vercel deploy, or download-link flip.

---

## 1. Files changed

- `.github/actions/setup-decklink-sdk-windows/action.yml` — WIF auth + Drive download + extract/MIDL validate
- `.github/workflows/release-windows.yml` — `id-token: write`, Drive/WIF setup (replaces base64 secret)
- `.github/workflows/build-windows-dev.yml` — same SDK path; windows-2022; no GitHub Release
- `desktop/scripts/ci/download-decklink-sdk-from-drive.mjs`
- `desktop/scripts/ci/prepare-windows-decklink-sdk.mjs`
- `desktop/scripts/ci/lib/decklink-sdk-tree.mjs`
- `desktop/scripts/build-decklink-addon.mjs` — Win IDL resolve + MIDL ensure + IID staging
- `desktop/native/decklink/binding.gyp` — Windows real build uses `decklink-dispatch-win.cpp` + `DeckLinkAPI_i.c`
- `desktop/native/decklink/decklink-dispatch-win.cpp` — NEUD-owned `CoCreateInstance` factories
- `desktop/scripts/verify-decklink-addon-load.mjs`
- `desktop/scripts/verify-packaged-no-decklink-sdk.mjs`
- `desktop/package.json` — package:win load + no-SDK-leak gates
- Docs: `docs/output-engine/decklink-windows-release.md`, `decklink-setup.md`, `docs/licensing/decklink-sdk.md`
- Tests: `desktop/scripts/test-neud-v0-3-1-stabilization.mjs`
- `.gitignore` — ignore generated `DeckLinkAPI_i.c`

## 2. GitHub Actions authentication configuration

| Item | Value |
| --- | --- |
| Action | `google-github-actions/auth@v2` (via composite action) |
| Provider | `projects/241025226693/locations/global/workloadIdentityPools/neud-github-actions/providers/github-actions` |
| Token | OAuth access token, scope `https://www.googleapis.com/auth/drive.readonly` |
| Permissions | `contents: write` (release) / `read` (dev) + **`id-token: write`** |
| Keys | None (no SA JSON) |

**Required repo variable (blocker until set):**

`NEUD_GCP_BUILD_SERVICE_ACCOUNT` = full email of `neud-build-dependencies@<GCP_PROJECT_ID>.iam.gserviceaccount.com`

The GCP **project ID** was not present in the repository and cannot be assumed from the display name `NEUD` or project number alone. Resolve it in Cloud Console / `gcloud projects describe 241025226693`, then set the variable.

## 3. SDK download result

| Environment | Result |
| --- | --- |
| Local Darwin | **Not run against Drive** (no WIF token in this environment) |
| Download script | Implemented with retries, metadata name check (`DeckLink` + `SDK`), size floor, no token logging |
| File ID | `1iYubcuA0WzlsLG6jilF2nR7_hC2sx-8A` |

## 4. SDK extraction and validation result

| Check | Result |
| --- | --- |
| Local ZIP `Blackmagic_DeckLink_SDK_16.0.zip` | **Verified** — nested root `Blackmagic DeckLink SDK 16.0`, version **16.0**, `Win/include` IDL present, no pre-built `DeckLinkAPI.h` |
| Ambiguity rejection | Implemented (`assertSingleSdkRoot`) |
| MIDL header generation | Implemented for Windows runners; **not executable on Darwin** |

## 5. Windows DeckLink native build result

| Check | Result |
| --- | --- |
| Windows x64 CI compile | **Not run** (requires push + `NEUD_GCP_BUILD_SERVICE_ACCOUNT` + WIF) |
| macOS real addon rebuild | **Verified** — Electron 33.4.11, SDK 16.0, `stub: false` |
| Windows build path | Binding + dispatch-win + MIDL path ready in tree |

## 6. Stub detection result

| Check | Result |
| --- | --- |
| `NEUD_REQUIRE_REAL_DECKLINK=1` | Retained |
| Meta / binary stub gates | Retained |
| Local macOS load | **`stub: false`**, `compiledSdkVersion: "16.0"` |

## 7. Packaged addon loading result

| Check | Result |
| --- | --- |
| Local Electron `ELECTRON_RUN_AS_NODE` load | **Verified** — `probe` + `discover` callable; `endpointCount: 0` (no hardware claim) |
| Packaged win-unpacked load | **Not run** (no Windows package on this host) |

## 8. Windows installer build status

**Not produced.** Blocked on: commit/push of workflow changes, repository variable for SA email, then `Build Windows Development` (preferred for test artifacts without tagging).

## 9. Remaining manual actions

1. Set GitHub Actions variable `NEUD_GCP_BUILD_SERVICE_ACCOUNT` to the exact SA email.
2. Commit/push these workflow changes (owner authorization).
3. Run **Build Windows Development** and confirm green: real addon, load gate, no SDK leak, installer artifact.
4. Owner hardware Key/Fill test on the uploaded artifact.
5. Explicit authorization before Release Windows publish / public download flip / Vercel.

## 10. Licensing, IAM, or CI blockers

| Topic | Status |
| --- | --- |
| Licensing | SDK is build-time only; installer must not ship SDK sources (gate added). See `docs/licensing/decklink-sdk.md`. |
| IAM | WIF + Drive Viewer assumed configured; **SA email variable missing** in GitHub. |
| CI | Cannot validate Drive download/MIDL/Windows compile until push + variable. |
| Windows SDK 16 | IDL-only layout handled via MIDL + NEUD dispatch (required for real Win builds). |

**Not ready to claim a Windows DeckLink installer success until the Windows job completes with a non-stub addon.**

NEUD v0.3.1 — Windows DeckLink Build Integration Report
