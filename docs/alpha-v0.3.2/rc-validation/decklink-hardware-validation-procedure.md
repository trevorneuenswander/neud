# DeckLink hardware validation procedure (v0.3.2)

Use after a **real** (non-stub) addon is confirmed in the installer (`neud_decklink.meta.json` → `"stub": false`).

## Distinguish failure modes

| Observation | Classification |
|---|---|
| `meta.stub === true` or binary embeds `"stub":true` | **Stub build** — reject release |
| Addon fails to load; SDK headers missing at compile | **Missing SDK** |
| Addon loads; `sdkAvailable: false` / Desktop Video missing | **Missing driver** (install Blackmagic Desktop Video) |
| Addon loads; `sdkAvailable: true`; `endpointCount: 0` | **No connected device** (software OK) |
| Wrong arch binary (e.g. x64 on arm64) | **Unsupported architecture** |

Compile success alone is **not** DeckLink support success.

## Hardware checklist (connected Blackmagic device)

1. Install matching **Blackmagic Desktop Video** for the host OS.
2. Connect UltraStudio / DeckLink device; confirm it appears in Desktop Video Setup.
3. Launch packaged NEUD RC (isolated user data directory preferred).
4. Open **Output** and select an external DeckLink route.
5. Confirm device discovery lists ≥1 endpoint.
6. Enable Key/Fill (or fill-only) at a supported mode (e.g. 1080p59.94 / 1080p60 as available).
7. Route a known display; verify SDI/HDMI program output on a monitor/scope.
8. Toggle LIVE; confirm no silent fallback to stub messaging.
9. Disconnect device mid-session; confirm UI reports device removed / unavailable (not success).
10. Reconnect; confirm recovery without restart if supported.

Record host OS, Desktop Video version, device model, mode, and screenshots/logs.
