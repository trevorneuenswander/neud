import { getMacDmgDownloadUrl } from "@/lib/downloads/mac-installer";
import {
  getGitHubReleasePageUrl,
  getVersionedWindowsInstallerFilename,
  getWindowsInstallerDownloadUrl,
  NEUD_GITHUB_RELEASE_OWNER,
  NEUD_GITHUB_RELEASE_REPO,
} from "@/lib/downloads/windows-installer";

export type NeudReleasePlatformInfo = {
  supported: boolean;
  architecture: string;
  downloadUrl: string | null;
  artifactLabel: string | null;
};

export type NeudReleaseMacSigningStatus =
  | "unsigned-ci"
  | "signed-notarized"
  | "unknown";

export type NeudReleaseEntry = {
  version: string;
  releaseDate: string;
  status: "published" | "current";
  summary: string;
  highlights: string[];
  platforms: {
    windows: NeudReleasePlatformInfo;
    macos: NeudReleasePlatformInfo;
  };
  githubReleaseUrl: string;
  current: boolean;
  knownLimitations: string[];
  macosSigningStatus: NeudReleaseMacSigningStatus;
};

export function getGitHubReleaseTagUrl(version: string): string {
  return `https://github.com/${NEUD_GITHUB_RELEASE_OWNER}/${NEUD_GITHUB_RELEASE_REPO}/releases/tag/v${version}`;
}

export function getVersionedWindowsDownloadUrl(version: string): string {
  const filename = getVersionedWindowsInstallerFilename(version);
  return `https://github.com/${NEUD_GITHUB_RELEASE_OWNER}/${NEUD_GITHUB_RELEASE_REPO}/releases/download/v${version}/${filename}`;
}

const V022_HIGHLIGHTS = [
  "NEUD is now available for Windows and Apple Silicon Macs",
  "Apple Silicon macOS desktop support with native menu and window behavior",
  "LED Display (Quail) for Broad Arrow workflows",
  "Improved Faye live-data support in packaged apps",
  "Cross-platform bundled Chrome runtime",
  "Improved display recovery on fresh installations",
  "Authentication and packaged runtime configuration hardening",
  "Display transport, SSE reliability, and expanded diagnostics",
] as const;

/** Authoritative NEUD desktop release catalog for neud.io and release-note parity. */
export const NEUD_RELEASES: NeudReleaseEntry[] = [
  {
    version: "0.2.2",
    releaseDate: "2026-09-26",
    status: "current",
    current: true,
    summary:
      "Cross-platform Alpha release: Windows x64 and Apple Silicon macOS, with improved live-data reliability, authentication, packaged browser support, display recovery, and diagnostics.",
    highlights: [...V022_HIGHLIGHTS],
    platforms: {
      windows: {
        supported: true,
        architecture: "x64",
        downloadUrl: getWindowsInstallerDownloadUrl(),
        artifactLabel: getVersionedWindowsInstallerFilename("0.2.2"),
      },
      macos: {
        supported: true,
        architecture: "Apple Silicon (arm64)",
        downloadUrl: getMacDmgDownloadUrl("0.2.2"),
        artifactLabel: "NEUD-0.2.2-arm64.dmg",
      },
    },
    githubReleaseUrl: getGitHubReleaseTagUrl("0.2.2"),
    knownLimitations: [
      "Windows packaged live graphics can update more slowly than macOS during live Faye workflows; further Windows display transport optimization is planned.",
      "Alpha software; Windows builds may show SmartScreen warnings when unsigned.",
      "macOS builds from CI are unsigned and not notarized until Developer ID signing secrets are configured — Gatekeeper may require manual approval on first open.",
      "Intel Macs are not supported.",
      "macOS auto-update feed exists (latest-mac.yml) but treat Mac updater as preview until signing is verified in production.",
    ],
    macosSigningStatus: "unsigned-ci",
  },
  {
    version: "0.2.1",
    releaseDate: "2026-09-24",
    status: "published",
    current: false,
    summary:
      "Windows-focused Alpha with access fixes, pinned display stacks, collapsible navigation, and LED Display (Quail).",
    highlights: [
      "Activity, teams, and owner access fixes",
      "Persistent pinned display stacking",
      "Collapsible desktop navigation",
      "Initial Broad Arrow LED Display (Quail) at 9216×1536",
      "Stream Bid and Stream Ticker compatibility preserved",
    ],
    platforms: {
      windows: {
        supported: true,
        architecture: "x64",
        downloadUrl: getVersionedWindowsDownloadUrl("0.2.1"),
        artifactLabel: getVersionedWindowsInstallerFilename("0.2.1"),
      },
      macos: {
        supported: false,
        architecture: "Apple Silicon (arm64)",
        downloadUrl: null,
        artifactLabel: null,
      },
    },
    githubReleaseUrl: getGitHubReleaseTagUrl("0.2.1"),
    knownLimitations: [
      "Packaged Windows builds could run legacy scrape polling instead of Faye event-driven transport (fixed in v0.2.2).",
      "No public macOS installer for this release.",
    ],
    macosSigningStatus: "unknown",
  },
  {
    version: "0.2.0",
    releaseDate: "2026-09-18",
    status: "published",
    current: false,
    summary:
      "Desktop-first polish on the v0.1.4 foundation: pinned viewer, display transport, publishing lease hardening, and scraper performance instrumentation.",
    highlights: [
      "Pinned viewer and display transport improvements",
      "Publishing lease hardening",
      "Access and sync improvements",
      "Scraper performance instrumentation",
    ],
    platforms: {
      windows: {
        supported: true,
        architecture: "x64",
        downloadUrl: getVersionedWindowsDownloadUrl("0.2.0"),
        artifactLabel: getVersionedWindowsInstallerFilename("0.2.0"),
      },
      macos: {
        supported: false,
        architecture: "Apple Silicon (arm64)",
        downloadUrl: null,
        artifactLabel: null,
      },
    },
    githubReleaseUrl: getGitHubReleaseTagUrl("0.2.0"),
    knownLimitations: ["Windows x64 only; no public macOS installer."],
    macosSigningStatus: "unknown",
  },
];

export function getCurrentNeudRelease(): NeudReleaseEntry {
  const current = NEUD_RELEASES.find((entry) => entry.current);
  if (!current) {
    throw new Error("NEUD release catalog is missing a current release entry.");
  }
  return current;
}

export function getPreviousNeudReleases(): NeudReleaseEntry[] {
  return NEUD_RELEASES.filter((entry) => !entry.current);
}

export function getNeudRelease(version: string): NeudReleaseEntry | undefined {
  return NEUD_RELEASES.find((entry) => entry.version === version);
}

export function formatReleaseDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00.000Z`);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatMacSigningLabel(status: NeudReleaseMacSigningStatus): string {
  switch (status) {
    case "signed-notarized":
      return "Signed and notarized for macOS Gatekeeper.";
    case "unsigned-ci":
      return "Unsigned CI build — Gatekeeper may block or require manual approval on first open.";
    default:
      return "Signing status not recorded for this release.";
  }
}

/** Markdown body aligned with neud.io highlights (GitHub Release description). */
export function formatGitHubReleaseBody(release: NeudReleaseEntry): string {
  const lines = [
    `# NEUD v${release.version}`,
    "",
    `**Release date:** ${formatReleaseDate(release.releaseDate)}`,
    "",
    release.summary,
    "",
    "## Highlights",
    "",
    ...release.highlights.map((item) => `- ${item}`),
    "",
    "## Supported platforms",
    "",
    release.platforms.windows.supported
      ? `- **Windows:** ${release.platforms.windows.architecture} (${release.platforms.windows.artifactLabel ?? "installer"})`
      : "- **Windows:** not available",
    release.platforms.macos.supported
      ? `- **macOS:** ${release.platforms.macos.architecture} (${release.platforms.macos.artifactLabel ?? "disk image"})`
      : "- **macOS:** not available for this release",
    "",
    "## macOS signing",
    "",
    formatMacSigningLabel(release.macosSigningStatus),
    "",
  ];

  if (release.knownLimitations.length > 0) {
    lines.push("## Known limitations", "", ...release.knownLimitations.map((item) => `- ${item}`), "");
  }

  lines.push(
    "## Downloads",
    "",
    release.platforms.windows.downloadUrl
      ? `- [Windows installer](${release.platforms.windows.downloadUrl})`
      : "",
    release.platforms.macos.downloadUrl
      ? `- [macOS disk image](${release.platforms.macos.downloadUrl})`
      : "",
    "",
    `[View all release assets on GitHub](${release.githubReleaseUrl})`,
    "",
    `Latest release page: ${getGitHubReleasePageUrl()}`,
  );

  return lines.filter((line) => line !== "").join("\n");
}
