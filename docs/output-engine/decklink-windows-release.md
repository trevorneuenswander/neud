# Windows DeckLink release packaging (v0.3.1+)

Windows release installers must ship a **real** `neud_decklink.node` compiled against the Blackmagic DeckLink SDK. Stub addons are rejected by packaging gates.

## Required SDK

| Item | Value |
| --- | --- |
| Vendor | Blackmagic Design |
| Product | DeckLink SDK |
| Verified version | **16.0** |
| Electron target | **33.4.11** (x64 on Windows) |
| Windows headers | Generated with **MIDL** from `Win/include/DeckLinkAPI.idl` |
| Dispatch | NEUD `decklink-dispatch-win.cpp` (`CoCreateInstance`) |
| Private CI source | Google Drive file `1iYubcuA0WzlsLG6jilF2nR7_hC2sx-8A` |

Do **not** commit the SDK into this repository. See [docs/licensing/decklink-sdk.md](../licensing/decklink-sdk.md).

## Local Windows packaging

1. Install Visual Studio Build Tools (C++ + MIDL).
2. Extract the DeckLink SDK so `Win\include\DeckLinkAPI.idl` exists (nested `Blackmagic DeckLink SDK 16.0\` is fine).
3. Point the build at the SDK root:

```powershell
$env:NEUD_REQUIRE_REAL_DECKLINK = "1"
$env:NEUD_DECKLINK_SDK = "C:\path\to\Blackmagic DeckLink SDK 16.0"
npm run package:win
```

`build-decklink-addon.mjs` runs MIDL when `DeckLinkAPI.h` is missing.

## GitHub Actions (Drive + WIF)

### One-time repository configuration

1. Confirm Google Cloud Workload Identity Federation:
   - Project number: `241025226693`
   - Pool: `neud-github-actions`
   - Provider: `github-actions`
   - Provider resource: `projects/241025226693/locations/global/workloadIdentityPools/neud-github-actions/providers/github-actions`
   - Restricted to repository `trevorneuenswander/neud`
2. Service account: `neud-build-dependencies` with **Viewer** on the private Drive SDK file and **Workload Identity User** for the repo principal set.
3. Set repository **variable** (not a JSON key secret):

| Name | Value |
| --- | --- |
| `NEUD_GCP_BUILD_SERVICE_ACCOUNT` | Full SA email: `neud-build-dependencies@<GCP_PROJECT_ID>.iam.gserviceaccount.com` |

Do **not** assume the GCP project ID equals the display name `NEUD`. Resolve the exact project ID in Google Cloud Console (or `gcloud projects describe 241025226693`).

4. Workflow permissions include `id-token: write` (OIDC). No service-account JSON keys.

### Workflows

- **Build Windows Development** — packages an unsigned installer artifact; uses WIF + Drive; does not create a GitHub Release/tag.
- **Release Windows** — same SDK install path; may create a draft/published GitHub Release when explicitly dispatched (owner authorization required for publish).

Gates:

- `NEUD_REQUIRE_REAL_DECKLINK=1`
- `verify-windows-native-release-gates.mjs`
- `verify-packaged-decklink-addon.mjs --packaged`
- `verify-decklink-addon-load.mjs --packaged` (Electron ABI load + `probe` / `discover`)
- `verify-packaged-no-decklink-sdk.mjs` (no SDK sources in installer)

## Runtime prerequisite (operators)

Install **Blackmagic Desktop Video**. NEUD does not redistribute Desktop Video.

## Validation levels

| Level | What it proves |
| --- | --- |
| Automated packaging gates | Real non-stub addon binary loads; enumeration APIs are callable |
| Hardware Key/Fill | Requires UltraStudio/DeckLink + Desktop Video — **owner test after installer** |
