# Windows packaged live display transport latency

**Status:** Deferred (v0.2.2) — not a release blocker  
**Tracking:** Engineering issue for post–v0.2.2 optimization

## Summary

On **packaged Windows**, live Broad Arrow graphics can update **perceptibly slower** than on **macOS**, even when Faye live data is healthy.

## Observed behavior

| Platform | Live update feel |
| -------- | ---------------- |
| macOS (Apple Silicon) | Effectively immediate in production use |
| Windows (x64, packaged) | Perceptible delay on live bid/lot updates |

## What is working

- Faye live feed is active and delivering events
- Desktop snapshot / SQLite / notify paths are healthy
- Local display GET handling is often fast (single-digit to low tens of ms on desktop)
- SSE delivery and browser-side fetch supersession / generation guards are in place
- **`live-display-pipeline.jsonl`** instrumentation must remain for future analysis

## Current hypothesis (not proven in this release)

Latest traces suggest remaining delay is dominated by the **packaged Windows browser → Next.js proxy → `127.0.0.1:8070` display-data fetch/transport** path (often ~600 ms–1.6+ s per request), not by Faye or canonical snapshot processing.

## Explicit non-goals for v0.2.2

- Do not remove or reduce live-display pipeline diagnostics
- Do not revert SSE hardening or live fetch supersession fixes
- Do not change display animations or Stream baseline HTML for latency experiments in a patch release

## Investigation artifacts

- `%APPDATA%\NEUD\logs\live-display-pipeline.jsonl` (Windows)
- `~/Library/Application Support/NEUD/logs/live-display-pipeline.jsonl` (macOS)
- Correlate: `traceEventId`, `displayClientId`, `fetchRequestId`, `connectionId`

## Target outcome (future)

- `browser.sse_received` → `browser.fetch_finished` ordinarily **&lt; 100 ms** on Windows packaged builds
- No multi-second request queueing; no stale response overwrites
