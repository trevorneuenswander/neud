# DeckLink macOS release packaging

macOS release / CI installers must ship a **real** `neud_decklink.node` compiled against the Blackmagic DeckLink SDK. Stub addons are rejected by packaging gates.

## Why this exists

Published macOS builds before v0.3.2 compiled a stub when the SDK was absent at build time. Operators then saw:

> External device support was not compiled into this NEUD build (DeckLink SDK missing at build time).

That message means the packaged helper is a stub — not a missing Desktop Video driver.

## CI provisioning (required)

The Blackmagic DeckLink SDK is **not** redistributed by NEUD and cannot be downloaded from a public URL in CI. Provisioning mirrors Windows:

1. Repository variable `NEUD_GCP_BUILD_SERVICE_ACCOUNT` — service account with Drive Viewer on the private SDK ZIP.
2. Workload Identity Federation (same pool/provider as Windows).
3. Composite action `.github/actions/setup-decklink-sdk-macos` downloads the ZIP from Google Drive and runs `desktop/scripts/ci/prepare-macos-decklink-sdk.mjs`.
4. Env `NEUD_DECKLINK_SDK` points at the extracted SDK root (Mac/include validated).
5. Env `NEUD_REQUIRE_REAL_DECKLINK=1` fails the build if a stub is produced.

Local developers may instead place the SDK at `~/DeckLinkSDK` or export `NEUD_DECKLINK_SDK`.

## Packaging gates

`npm run package:mac` (root) sets `NEUD_REQUIRE_REAL_DECKLINK=1` and, after the unpacked app is built, runs:

- `verify-packaged-decklink-addon.mjs --packaged`
- `verify-decklink-addon-load.mjs --packaged`
- `verify-packaged-no-decklink-sdk.mjs` (SDK headers must not ship inside the app)

## Licensing

See [../licensing/decklink-sdk.md](../licensing/decklink-sdk.md). Compile against the SDK at build time only; never bundle SDK headers, IDL, or samples into the installer.

## Runtime prerequisite (separate from compile)

A real addon still requires Blackmagic **Desktop Video** installed on the operator machine. Missing Desktop Video produces a different error (`Desktop Video runtime is unavailable…`), not the stub message.

## Hardware validation

Successful compilation / packaging gates are **not** hardware verification. Use the checklist in [decklink-setup.md](./decklink-setup.md) with a physical DeckLink device before claiming Key/Fill output works.
