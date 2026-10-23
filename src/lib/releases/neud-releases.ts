import { getMacDmgDownloadUrl } from "@/lib/downloads/mac-installer";
import {
  getGitHubReleasePageUrl,
  getVersionedWindowsInstallerFilename,
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

const V030_HIGHLIGHTS = [
  "Output Engine with external display routing, DeckLink Key/Fill, display stacking, and global LIVE/REC tally",
  "Record to Disk on macOS: H.264 MP4, ProRes 422 HQ MOV, and ProRes 4444 MOV",
  "Native ProRes video displays with alpha-capable playback, controls, and stack synchronization",
  "Performance Monitor for system/NEUD CPU, GPU, RAM, macOS memory pressure, and output diagnostics",
  "Improved graphics template typography, layout consistency, and manual data management controls",
  "Safer on-air guards when quitting, signing out, changing stacks, or deleting/archiving/disabling source displays",
  "New official NEUD application icon for Windows and macOS",
] as const;

const V024_HIGHLIGHTS = [
  "Improved live graphic transitions so previous media cannot reappear after advancing",
  "macOS recovers when a cached Chrome installation is incomplete",
  "Manual values can be cleared from controllers and live displays",
  "Signing out warns when a data engine is running and stops active engines before ending the session",
  "Project team names appear correctly on user Associated Projects",
  "Display enabled state and display order follow the project across NEUD installations",
  "Local URL output matches Preview, Fullscreen, and pinned output",
  "Fresh installations restore published display output from cloud sync",
] as const;

const V023_HIGHLIGHTS = [
  "Fixed published displays failing to load after installing NEUD on a new computer",
  "Published display revisions now follow project and display identity changes during cloud sync",
  "Missing local published revisions can be restored from the exact cloud revision",
  "Published graphics templates recover without requiring a manual republish",
  "Preview, Local URL, Pin, and Fullscreen resolve after a fresh installation",
  "Clearer diagnostics for missing or repaired published display content",
] as const;

const V022_HIGHLIGHTS = [
  "NEUD is now available for Windows and Apple Silicon Macs",
  "Apple Silicon macOS desktop support with native menu and window behavior",
  "Large-format LED graphics support for production workflows",
  "Improved event-driven live-data transport in packaged apps",
  "Cross-platform bundled Chrome runtime",
  "Improved display recovery on fresh installations",
  "Authentication and packaged runtime configuration hardening",
  "Display transport, SSE reliability, and expanded diagnostics",
] as const;

/** Authoritative NEUD desktop release catalog for neud.io and release-note parity. */
export const NEUD_RELEASES: NeudReleaseEntry[] = [
  {
    version: "0.3.0",
    releaseDate: "2026-10-22",
    status: "current",
    current: true,
    summary:
      "Output Engine, Record to Disk, native ProRes video displays, Performance Monitor, and graphics workflow refinements for Windows x64 and Apple Silicon Macs.",
    highlights: [...V030_HIGHLIGHTS],
    platforms: {
      windows: {
        supported: true,
        architecture: "x64",
        downloadUrl: getVersionedWindowsDownloadUrl("0.3.0"),
        artifactLabel: getVersionedWindowsInstallerFilename("0.3.0"),
      },
      macos: {
        supported: true,
        architecture: "Apple Silicon (arm64)",
        downloadUrl: getMacDmgDownloadUrl("0.3.0"),
        artifactLabel: "NEUD-0.3.0-arm64.dmg",
      },
    },
    githubReleaseUrl: getGitHubReleaseTagUrl("0.3.0"),
    knownLimitations: [
      "Record to Disk encoders are implemented and validated on macOS; Windows recording support is not claimed in this release.",
      "DeckLink Key/Fill requires compatible Blackmagic hardware; automated CI cannot validate physical DeckLink devices.",
      "Alpha software; Windows builds may show SmartScreen warnings when unsigned.",
      "macOS builds from CI are unsigned and not notarized until Developer ID signing secrets are configured — Gatekeeper may require manual approval on first open.",
      "Intel Macs are not supported.",
      "Display Transforms, IN/OUT Transitions, and Stream Deck integration are planned for a later release.",
      "macOS auto-update feed exists (latest-mac.yml) but treat Mac updater as preview until signing is verified in production.",
    ],
    macosSigningStatus: "unsigned-ci",
  },
  {
    version: "0.2.4",
    releaseDate: "2026-10-01",
    status: "published",
    current: false,
    summary:
      "Reliability and workflow update for live production, cross-device display settings, and controller polish on Windows and Apple Silicon Macs.",
    highlights: [...V024_HIGHLIGHTS],
    platforms: {
      windows: {
        supported: true,
        architecture: "x64",
        downloadUrl: getVersionedWindowsDownloadUrl("0.2.4"),
        artifactLabel: getVersionedWindowsInstallerFilename("0.2.4"),
      },
      macos: {
        supported: true,
        architecture: "Apple Silicon (arm64)",
        downloadUrl: getMacDmgDownloadUrl("0.2.4"),
        artifactLabel: "NEUD-0.2.4-arm64.dmg",
      },
    },
    githubReleaseUrl: getGitHubReleaseTagUrl("0.2.4"),
    knownLimitations: [
      "Machine/environment-specific latency was observed on one Windows system and was not reproduced on a clean Windows laptop. Diagnostics remain available.",
      "Alpha software; Windows builds may show SmartScreen warnings when unsigned.",
      "macOS builds from CI are unsigned and not notarized until Developer ID signing secrets are configured — Gatekeeper may require manual approval on first open.",
      "Intel Macs are not supported.",
      "macOS auto-update feed exists (latest-mac.yml) but treat Mac updater as preview until signing is verified in production.",
    ],
    macosSigningStatus: "unsigned-ci",
  },
  {
    version: "0.2.3",
    releaseDate: "2026-09-30",
    status: "published",
    current: false,
    summary:
      "Fresh-install display recovery and cross-device published-display synchronization.",
    highlights: [...V023_HIGHLIGHTS],
    platforms: {
      windows: {
        supported: true,
        architecture: "x64",
        downloadUrl: getVersionedWindowsDownloadUrl("0.2.3"),
        artifactLabel: getVersionedWindowsInstallerFilename("0.2.3"),
      },
      macos: {
        supported: true,
        architecture: "Apple Silicon (arm64)",
        downloadUrl: getMacDmgDownloadUrl("0.2.3"),
        artifactLabel: "NEUD-0.2.3-arm64.dmg",
      },
    },
    githubReleaseUrl: getGitHubReleaseTagUrl("0.2.3"),
    knownLimitations: [
      "Windows packaged live graphics can update more slowly than macOS during some live-data workflows; further Windows display transport optimization is planned.",
      "Alpha software; Windows builds may show SmartScreen warnings when unsigned.",
      "macOS builds from CI are unsigned and not notarized until Developer ID signing secrets are configured — Gatekeeper may require manual approval on first open.",
      "Intel Macs are not supported.",
      "macOS auto-update feed exists (latest-mac.yml) but treat Mac updater as preview until signing is verified in production.",
    ],
    macosSigningStatus: "unsigned-ci",
  },
  {
    version: "0.2.2",
    releaseDate: "2026-09-26",
    status: "published",
    current: false,
    summary:
      "Cross-platform Alpha release: Windows x64 and Apple Silicon macOS, with improved live-data reliability, authentication, packaged browser support, display recovery, and diagnostics.",
    highlights: [...V022_HIGHLIGHTS],
    platforms: {
      windows: {
        supported: true,
        architecture: "x64",
        downloadUrl: getVersionedWindowsDownloadUrl("0.2.2"),
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
      "Windows packaged live graphics can update more slowly than macOS during some live-data workflows; further Windows display transport optimization is planned.",
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
      "Windows-focused Alpha with access fixes, pinned display stacks, collapsible navigation, and large-format LED graphics support.",
    highlights: [
      "Activity, teams, and owner access fixes",
      "Persistent pinned display stacking",
      "Collapsible desktop navigation",
      "Initial large-format LED graphics support at 9216×1536",
      "Existing live graphics templates remain compatible",
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
      "Packaged Windows builds could fall back to legacy scrape polling instead of event-driven transport (fixed in v0.2.2).",
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
      "Desktop-first polish on the v0.1.4 foundation: pinned viewer, display transport, publishing lease hardening, and data-collection performance instrumentation.",
    highlights: [
      "Pinned viewer and display transport improvements",
      "Publishing lease hardening",
      "Access and sync improvements",
      "Data-collection performance instrumentation",
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
