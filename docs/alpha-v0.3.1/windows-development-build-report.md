# NEUD Alpha v0.3.1 — Windows Development Build Report

**Workflow:** Build Windows Development  
**Run:** https://github.com/trevorneuenswander/neud/actions/runs/40059781459  
**Conclusion:** success  
**Branch tip at build:** `a311ace5314c57ee8faab211c9ff1368f4a1674a`  
**Public release:** not published (no tag, no GitHub Release, no Vercel, no download-link flip)

---

## Summary

| Item | Result |
| --- | --- |
| Google WIF auth | Success |
| Drive SDK download | Success (`Blackmagic_DeckLink_SDK_16.0.zip`, 130,375,817 bytes) |
| MIDL generation | Success (SDK 16.0 Win/include) |
| Real DeckLink addon | Success (`stub: false`, Electron 33.4.11, x64) |
| Packaged load + discover | Success (`compiledSdkVersion: "16.0"`, `endpointCount: 0`) |
| H.264 recorder / video / GPU natives | Built and packaged |
| Installer artifact | Uploaded for owner download |

---

## Installer

| Field | Value |
| --- | --- |
| Filename | `NEUD-Setup-0.3.1-x64.exe` |
| Size | 350M on disk (~367,001,600 bytes); Actions zip artifact ≈ 732,537,351 bytes |
| SHA-256 | `af6eeadb9bcd2f57ff45ceed79ed7dbb4fbb0bfa267fb1087bfb1202ee534cd8` |
| Artifact name | `neud-windows-dev-a311ace5314c57ee8faab211c9ff1368f4a1674a` |
| Retention | Expires `2027-01-22T03:48:06Z` (~90 days) |
| Download | Actions run → Artifacts |

Also uploaded: `NEUD-Setup-latest-x64.exe`, `dist/build-info.json`, `neud_decklink.meta.json`.

---

## Remaining manual tests (owner)

- Install on Windows x64 test PC
- DeckLink / UltraStudio Key/Fill with Desktop Video
- H.264 Record to Disk
- Video playback (ProRes not claimed without LGPL FFmpeg)
- Confirm UI slogan / colors / icon

NEUD Alpha v0.3.1 — Windows Development Build Report
