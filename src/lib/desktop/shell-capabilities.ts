/**
 * Desktop shell capabilities shared by the web UI and static parity tests.
 */
export function showInWindowApplicationMenu(platform: string | null | undefined): boolean {
  return platform !== "darwin";
}

export function desktopTitleBarCssHeight(platform: string | null | undefined): string {
  return showInWindowApplicationMenu(platform) ? "2.25rem" : "0px";
}
