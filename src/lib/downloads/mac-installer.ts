import {
  NEUD_GITHUB_RELEASE_OWNER,
  NEUD_GITHUB_RELEASE_REPO,
} from "@/lib/downloads/windows-installer";

export function getVersionedMacDmgFilename(version: string): string {
  return `NEUD-${version}-arm64.dmg`;
}

export function getMacDmgDownloadUrl(version: string): string {
  const override = process.env.NEXT_PUBLIC_NEUD_MAC_DOWNLOAD_URL?.trim();
  if (override) {
    return override;
  }

  const filename = getVersionedMacDmgFilename(version);
  return `https://github.com/${NEUD_GITHUB_RELEASE_OWNER}/${NEUD_GITHUB_RELEASE_REPO}/releases/download/v${version}/${filename}`;
}
