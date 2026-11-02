# UltraStudio physical validation SOP (Owner — tomorrow morning)

Closed internal RC only. Ad hoc macOS signing. Not notarized. Not published.

## Before connecting hardware

1. Confirm macOS RC exists:
   - `desktop/release/NEUD-0.3.2-arm64.dmg`
   - Or run existing `npm run dev:desktop` on `feature/v0.3.2-stability` (real DeckLink addon already builds with `~/DeckLinkSDK`).
2. Install/update **Blackmagic Desktop Video** (already present if Desktop Video Setup opens).
3. Prefer an **isolated** NEUD user-data copy for installer smoke if testing the DMG; for `dev:desktop`, your normal Application Support data is fine — do **not** delete it.

## Connect and detect

1. Connect the UltraStudio (Thunderbolt/USB-C as required by the model).
2. Power the UltraStudio if it has an external PSU.
3. Open **Desktop Video Setup** → confirm the device appears and is not in error.
4. Connect SDI/HDMI from the UltraStudio **Fill** (and Key if present) to a monitor or switcher.
5. Launch NEUD (packaged RC or `dev:desktop`).

## Confirm NEUD enumeration

1. Sign in.
2. Open **Output** (global Output / Recording UI).
3. Confirm at least one **Blackmagic / External Device** port is listed (model name from SDK — do not require a hard-coded UltraStudio string).
4. Note: Port labels look like `{Model} Port N` from SDK subdevice index.

## Standard Fill output

1. Create/select an Output route.
2. Select the UltraStudio port.
3. Choose a **mode returned by the device** (start with 1080p59.94 or 1080p60 if listed).
4. Presentation: **Fill** (not Key+Fill yet).
5. Assign a known NEUD display (e.g. SEMA Fullscreen or Stream Bid).
6. **Start** the route.
7. Confirm video on the monitor/switcher.
8. **Stop**; confirm output ceases and resources release.
9. Unplug UltraStudio mid-live → NEUD should show device unavailable (not crash).
10. Replug → Desktop Video sees it → rediscover / restart route.

## Key/Fill (only if SDK reports it)

Do **not** assume this UltraStudio supports Key/Fill.

1. In Output, if **Key + Fill** is offered for the selected port, select it.
2. If transport is native external key: one port; hardware Key/Fill connectors.
3. If UI asks for separate Fill Port / Key Port: choose two different ports (Duo-style) — UltraStudio native usually will not.
4. Start; verify Fill and Key on the correct connectors with a switcher/keyer.
5. If Key+Fill is **not** offered: record **NOT SUPPORTED** for this device — that is correct software behavior.

## Collect on failure

- Screenshot Output UI + error toast.
- Desktop Video Setup screenshot.
- Logs under Application Support `NEUD/logs/` (and `sema-ops.log` if SEMA-related).
- Note: mode id, presentation mode, Desktop Video version, UltraStudio model label from NEUD.

## Also smoke while UltraStudio is connected

- SEMA package 10 / four displays / fullscreen UHD preview.
- Login page: no performance bar.
- Advance/Jump/Highlight: no new user-facing Activity spam.
- Existing projects still present.
