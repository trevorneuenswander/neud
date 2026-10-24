# Blackmagic DeckLink SDK — licensing notes (NEUD)

## Build-time use

NEUD compiles a native addon (`neud_decklink.node`) against the **Blackmagic DeckLink SDK** headers / IDL under the Blackmagic DeckLink SDK End User License Agreement (EULA).

- SDK archives are **private build inputs** (Google Drive + Workload Identity Federation in CI).
- The SDK is **not** committed to Git.
- The SDK is **not** redistributed inside NEUD installers.

## Runtime

At runtime, NEUD talks to **Blackmagic Desktop Video** COM / framework interfaces installed on the operator machine. Operators must install Desktop Video separately. NEUD does not ship Desktop Video drivers or the SDK.

## Windows SDK 16 layout

Windows SDK 16.x ships **IDL** under `Win/include` (not pre-generated `DeckLinkAPI.h` / `DeckLinkAPIDispatch.cpp`). CI runs Microsoft **MIDL** to generate headers for compilation and links a NEUD-owned `decklink-dispatch-win.cpp` that uses `CoCreateInstance`, matching Blackmagic’s Windows samples.

## Redistribution checklist

- [x] Do not ship SDK ZIP, IDL, samples, or PDFs in the installer
- [x] Ship only the compiled Electron-native addon
- [x] Do not embed Google credentials or Drive tokens in artifacts
- [ ] Owner hardware Key/Fill validation after installing a test build (not covered by CI)
