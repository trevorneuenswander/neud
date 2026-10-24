# neud.io Alpha 0.3.1 flip checklist

**Do not perform these steps until installers are published and the owner authorizes public release.**

## Before flip

- [ ] Windows `NEUD-Setup-0.3.1-x64.exe` published on GitHub Release `v0.3.1`
- [ ] macOS `NEUD-0.3.1-arm64.dmg` published on the same release
- [ ] Packaged DeckLink gate passed (real addon, not stub)
- [ ] Windows H.264 recorder present in packaged tree
- [ ] Windows ProRes playback claim matches FFmpeg LGPL presence (do not advertise if DLLs absent)

## Code changes (authorized release only)

1. Add a `0.3.1` entry to `src/lib/releases/neud-releases.ts` with `current: true`.
2. Set the previous `0.3.0` entry to `current: false` / `status: "published"`.
3. Update `MarketingHomePage` cross-platform Alpha copy to **0.3.1**.
4. Confirm `APP_TAGLINE` remains **Graphics Without Limits.**
5. Confirm favicon / icon asset version cache busters remain current.
6. Deploy via the existing Vercel production workflow.
7. Verify production:
   - Home shows slogan via `NeudLogo` + Alpha 0.3.1
   - `/download` lists Windows and macOS 0.3.1 links
   - Portal **Get NEUD** navigates to `/download` (no auto-download)
   - Download links hit verified artifacts

Draft GitHub notes: `docs/releases/v0.3.1-github-release-notes.md`.
