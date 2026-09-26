/**
 * Desktop shell capabilities shared by the web UI and static parity tests.
 */
export function showInWindowApplicationMenu(platform: string | null | undefined): boolean {
  return platform !== "darwin";
}

/** Render the in-window NEUD top strip (background / layout), including on macOS. */
export function showDesktopTitleBarShell(
  platform: string | null | undefined,
  desktopActive: boolean,
): boolean {
  return desktopActive && platform != null;
}

export function desktopTitleBarCssHeight(platform: string | null | undefined): string {
  if (platform === "darwin" || platform === "win32" || platform === "linux") {
    return "2.25rem";
  }
  return "0px";
}
