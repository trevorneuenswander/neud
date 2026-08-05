/**
 * Canonical Windows installer download URL for the hosted Vercel portal.
 * Packaged NEUD Desktop hides download CTAs; this module is web-only.
 *
 * Option A (default): stable GitHub Release asset name so /releases/latest/download/
 * works across version bumps without redeploying the website.
 */
export const NEUD_GITHUB_RELEASE_OWNER = "trevorneuenswander";
export const NEUD_GITHUB_RELEASE_REPO = "neud";
export const NEUD_WINDOWS_STABLE_INSTALLER_FILENAME = "NEUD-Setup-latest-x64.exe";

export function getVersionedWindowsInstallerFilename(version: string): string {
  return `NEUD-Setup-${version}-x64.exe`;
}

export function getWindowsInstallerDownloadUrl(): string {
  const override = process.env.NEXT_PUBLIC_NEUD_WINDOWS_DOWNLOAD_URL?.trim();
  if (override) {
    return override;
  }

  return `https://github.com/${NEUD_GITHUB_RELEASE_OWNER}/${NEUD_GITHUB_RELEASE_REPO}/releases/latest/download/${NEUD_WINDOWS_STABLE_INSTALLER_FILENAME}`;
}

export function getGitHubReleasePageUrl(): string {
  return `https://github.com/${NEUD_GITHUB_RELEASE_OWNER}/${NEUD_GITHUB_RELEASE_REPO}/releases/latest`;
}
