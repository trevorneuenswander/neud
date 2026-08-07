# Application Updates

Packaged NEUD Windows builds use **electron-updater** with **GitHub Releases** as the initial update provider.

## Behavior

| Rule | Detail |
|------|--------|
| Enabled only when | `app.isPackaged === true` and `NEUD_DESKTOP_DEV !== "1"` |
| Startup check | 15 seconds after main window is ready; non-blocking |
| Auto restart | Never — user must choose **Restart and Install** |
| Auto install on quit | Disabled (`autoInstallOnAppQuit = false`) |
| Duplicate checks | Prevented while a check is in flight |
| Offline / missing feed | Safe error message; local operation continues |

## UI entry points

Both call the same centralized service (`desktop/src/services/auto-update-service.ts`):

1. **Settings → About NEUD** — `src/components/settings/ApplicationUpdatesSection.tsx`
2. **Help → Check for Updates…** — `desktop/src/menu/application-menu.ts`

## IPC surface

Renderer access is limited to typed preload APIs:

- `neud:updates:getStatus`
- `neud:updates:check`
- `neud:updates:install`
- `neud:updates:status` (broadcast)

The renderer cannot supply update URLs or arbitrary updater commands.

## Update states

`idle` → `checking` → `available` / `not-available` / `error`

When an update is available: `downloading` → `downloaded` (shows **Restart and Install**)

## Publishing version 0.1.3 (example)

1. Update root and `@neud/desktop` `package.json` to `0.1.3`.
2. Run the release gate:

```bash
npm run release:win
```

3. Upload artifacts from `desktop/release/` to a GitHub Release:
   - `NEUD-Setup-0.1.3-x64.exe`
   - `NEUD-Setup-latest-x64.exe` (stable portal download alias)
   - `latest.yml`
   - `NEUD-Setup-0.1.3-x64.exe.blockmap`

4. Publish the draft release when ready (installed clients ignore drafts).
5. On a machine with 0.1.2 installed, use **Check for Updates** and validate download, **Later**, and **Restart and Install**.

## Provider configuration

Current provider: public GitHub Releases for `trevorneuenswander/neud`.

If the repository were private, do **not** embed a GitHub token in the client. Instead use:

- A public releases mirror repository, or
- A generic HTTPS update endpoint

Document any provider change in this file.

## Code signing and updates

Production update releases should use Authenticode-signed installers. Unsigned builds may install locally but SmartScreen warnings are expected.

The publisher name in the signed certificate must match the configured update metadata expectations.

## Rollback

If an update fails:

1. Reinstall the previous installer from a saved copy.
2. User data under `%APPDATA%\NEUD\` is preserved unless explicitly removed during uninstall.

See [windows-release-checklist.md](./windows-release-checklist.md) for the full acceptance test.
