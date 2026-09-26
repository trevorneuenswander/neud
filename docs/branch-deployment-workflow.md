# Branch and deployment workflow

NEUD v0.2.2 onward uses an intentional **release vs development** split so day-to-day coding does not automatically change **neud.io production**.

## Branches

| Branch | Purpose |
| ------ | ------- |
| **`main`** | Production-ready source. Merging here is an intentional release or hotfix decision. |
| **`develop`** | Shared integration branch for ongoing desktop + portal work. |
| **`feature/*`** | Individual tasks (e.g. `feature/mac-menu-tweak`). |

## Vercel (neud.io)

Configure in the **Vercel project settings** (not only in git):

- **Production Branch:** `main` only
- **Preview Deployments:** enabled for `develop`, `feature/*`, and pull requests
- **Do not** treat every push to `main` as a marketing release — desktop GitHub Releases and download URLs are authoritative for NEUD Desktop binaries

Document the Production Branch setting after changes in the Vercel dashboard.

## GitHub Actions

| Workflow | Trigger | Output |
| -------- | ------- | ------ |
| **Release Windows** | Manual `workflow_dispatch` | Public Windows installer + `latest.yml` on GitHub Release |
| **Release macOS** | Manual `workflow_dispatch` | Public macOS DMG/ZIP + `latest-mac.yml` on GitHub Release |
| **Build Windows Development** | Manual / optional `develop` push | Engineering artifact only (`neud-windows-dev-*`) |
| **Build macOS Development** | Manual / optional `develop` push | Engineering artifact only (`neud-macos-dev-*`) |
| **Build macOS** (CI) | Manual `workflow_dispatch` | CI validation artifacts (not a public release channel) |

Development workflows **must not** update public `latest.yml` / `latest-mac.yml` or create GitHub Releases.

## Recommended flow

```text
feature/my-work
  → local dev (Windows or Mac)
  → push → CI tests + Vercel Preview
  → PR → develop
  → integration testing + optional dev CI artifacts
  → intentional merge → main
  → Vercel Production + Release Windows/macOS workflows
```

## Desktop build identity

Public installers must embed a **real git SHA** via `GITHUB_SHA` in CI (`desktop/dist/build-info.json`). Local `npm run package:win` may show `dev-local` — that is for engineering only.
