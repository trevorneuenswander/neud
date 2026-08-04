Windows desktop application icon assets only.

Place the supplied NEUD desktop icon here as one of:

- `icon.ico` (preferred for Windows packaging)
- `icon.png` (Electron Builder converts this during packaging)

These files are used exclusively for:

- Electron window/taskbar icon
- Packaged executable icon
- NSIS installer icon
- Desktop and Start Menu shortcut icons

Do not reference these assets from portal UI, login pages, splash screens, favicons, or display graphics.

After adding the icon file, rebuild the desktop app:

```bash
npm run build -w @neud/desktop
npm run package:win -w @neud/desktop
```
