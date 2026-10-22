# Output Engine Phase 1

Output routes are machine-local. A route records which published NEUD display should appear on a physical monitor attached to this computer.

## Cloud vs this computer

Project data stays in the existing cloud and local project database:

- Displays
- Published revisions
- Enabled state and order
- Project configuration

Physical routing stays in local SQLite table `output_routes`:

- Monitor identity
- Route name
- Which project display is assigned
- Fit settings

A DeckLink card or HDMI port on one computer is not a cloud preference. Another installation must discover its own hardware. Future remote control can command a host, but the host still maps the command onto devices it can see.

## Rendering

An output window loads the same published display URL used by Local URL (`/display/{projectId}/{slug}?mode=output`). When the monitor size differs from the authored size, that URL is placed in `/display/window-fit`, which scales the graphic to fit without stretching it. Exact size matches load the output URL directly.

The output window is a dedicated borderless `BrowserWindow`. It does not reuse the operator preview window. Transparent graphics keep their authored transparency inside the page. A monitor cannot emit video alpha, so the window backing is black.

## Sign-out and quit

Active output windows stop when the operator signs out, before local data engines stop, and again during application shutdown. A disconnected monitor closes its window, marks the route device unavailable, and keeps the saved route. NEUD does not move that output onto the primary display.

## macOS presentation window

The computer-display output stays a borderless, non-fullscreen window on the selected monitor. Electron's `"screen-saver"` always-on-top level is `NSScreenSaverWindowLevel` (1000). On macOS 26.5.2 the menu bar is `NSMainMenuWindowLevel` (24), menu-bar status items are `NSStatusWindowLevel` (25), and the Dock is level 20. Level 1000 is already above that UI. The menu bar still shows because AppKit's `constrainFrameRect:toScreen:` shrinks the window out of the menu-bar strip.

When Always on Top is on, the macOS-only helper in `desktop/native/mac-output` lets that output window keep the display's full frame and sets its level to `NSStatusWindowLevel + 1` (26). That is the lowest level that covers the menu bar, status items, and a Dock on that screen. Pop-up menus (101) and higher system UI stay above the output. Always on Top off leaves the window at `NSNormalWindowLevel` (0). The helper does not change app-wide presentation options, collection behavior, or any other window.

Hide Cursor uses an invisible cursor rect on a view owned by the output window, plus mouse tracking that follows the pointer while NEUD is the active app. The operator window stays key. Leaving the output window restores the arrow. Stop, monitor disconnect, sign-out, and quit remove that view and restore the window before it closes. The helper is built only on macOS arm64 for Electron 33.4.11. Windows output still uses borderless fullscreen.
