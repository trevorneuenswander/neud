# Dual UltraStudio output — root cause (v0.3.3)

## Confirmed cause

NEUD’s native DeckLink integration was a **single global output session**.

Evidence:

1. `desktop/native/decklink/decklink-sdk.cc` kept one set of globals (`gDevice`, `gOutput`, frame buffers, counters, callback).
2. `DeckLinkStartJson()` began with `ReleaseOutputLocked()` + `ResetCountersLocked()`, which **stopped whichever device was already playing** before enabling the newly requested endpoint.
3. `DeckLinkPushFrame` / `DeckLinkStop` / `DeckLinkMetricsJson` had **no endpoint id**, so frames and teardown always targeted that single global session.
4. `desktop/src/output/native-decklink-port.ts` tracked `private active: ActiveRoute | null` — only one route could be considered native-active.
5. The Output Engine could still keep route A’s session status as **LIVE** after native playback for A had been destroyed by starting B — matching the Owner’s report.

This is an application architecture bug, not an UltraStudio hardware limitation. The Blackmagic SDK supports independent `IDeckLinkOutput` instances per device.

## Fix summary

- Native layer: per-endpoint `OutputSession` map; start/stop/push/metrics are endpoint-scoped; starting B does not destroy A.
- TypeScript port: `activeByRoute` / `routeByEndpoint` maps; push/stop/metrics pass endpoint ids.
- Engine: `reconcileDeckLinkRuntimeHealth()` demotes LIVE → error when native metrics show playback is no longer running.

## Validation status

Automated fixture tests prove session isolation. Owner physical dual UltraStudio validation (simultaneous LIVE, independent control, different graphics, Key/Fill) **passed** per `docs/alpha-v0.3.3/dual-ultrastudio-owner-validation-sop.md` before v0.3.3 release preparation.
