# DeckLink hardware validation checklist

Successful packaging (`neud_decklink.meta.json` → `stub: false`) proves **compilation**, not hardware output.

## Build / artifact gates (software)

- [ ] Installer/platform under test: Windows x64 or macOS arm64
- [ ] App version / git SHA recorded
- [ ] Packaged `neud_decklink.meta.json`: `stub: false`
- [ ] Electron ABI matches build target (33.4.11)
- [ ] Output → External Device does **not** show “DeckLink SDK missing at build time”

## Operator machine

- [ ] Blackmagic Desktop Video installed (version noted)
- [ ] Reboot after driver install
- [ ] Device visible in Blackmagic Desktop Video Setup
- [ ] NEUD signed-in; Output page loads

## Enumeration

- [ ] At least one DeckLink/UltraStudio output endpoint listed
- [ ] Missing Desktop Video shows **Desktop Video unavailable** (not stub message)
- [ ] Unplugging device updates availability without crashing

## Fill output

- [ ] Select mode (e.g. 1080p59.94 or 1080p60)
- [ ] Start → status Live
- [ ] SDI/HDMI monitor shows Fill (display over black)
- [ ] Stop / sign-out / quit releases the device cleanly

## Key/Fill (only if product claims it for this build)

- [ ] Dual endpoints selectable
- [ ] Keyer enable path verified on hardware
- [ ] Alpha over black correct on Fill

## Negative cases

- [ ] Stub installer (old build) → stub message only
- [ ] Real addon + no driver → Desktop Video message
- [ ] Wrong arch binary → native helper load failure (not stub)

**Do not claim hardware Key/Fill works until this checklist is completed on physical devices.**
