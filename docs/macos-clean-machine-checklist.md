# NEUD macOS clean-machine validation (Apple Silicon)

Use on a Mac with no prior NEUD install.

1. Install from `NEUD-<version>-arm64.dmg` (drag NEUD to Applications).
2. First launch — confirm Gatekeeper / notarization behavior matches release signing state.
3. Login — Supabase auth, session persistence, logout.
4. Confirm version label matches packaged release.
5. Open Broad Arrow project — local SQLite loads under `~/Library/Application Support/NEUD/`.
6. Start scraper — bundled **Google Chrome for Testing** launches (not system Chrome).
7. Exercise Faye, DOM, and Legacy polling modes.
8. Controller — rates refresh, manual overrides.
9. Displays — Stream Bid, Stream Ticker, LED Display (Quail) preview and Local URL.
10. Pin two compatible displays — stack, transparency, Remove from Stack, Un-Pin.
11. View Fullscreen — resizable window, aspect ratio, checkerboard shell.
12. Online Viewer publish/sync.
13. Quit and relaunch — session and pinned preferences persist.
14. Check for Updates — `latest-mac.yml` resolves when GitHub release assets are published.
