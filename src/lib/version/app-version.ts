export type AppVersionChannel = "alpha" | "beta" | "stable";

export type AppVersionInfo = {
  version: string;
  channel: AppVersionChannel;
  displayVersion: string;
};

/** Injected at build time from root package.json via next.config.ts */
export const BUILD_APP_VERSION =
  process.env.NEXT_PUBLIC_NEUD_APP_VERSION?.trim() ?? "";

function stripChannelSuffix(version: string, channel: string): string {
  const pattern = new RegExp(`[-.]?${channel}.*$`, "i");
  return version.replace(pattern, "").trim();
}

export function resolveAppVersionInfo(rawVersion: string): AppVersionInfo {
  const trimmed = rawVersion.trim() || BUILD_APP_VERSION;
  const lower = trimmed.toLowerCase();

  if (lower.includes("alpha")) {
    const version = stripChannelSuffix(trimmed, "alpha") || trimmed;
    return {
      version,
      channel: "alpha",
      displayVersion: formatDisplayVersionForChannel(version, "alpha"),
    };
  }

  if (lower.includes("beta")) {
    const version = stripChannelSuffix(trimmed, "beta") || trimmed;
    return {
      version,
      channel: "beta",
      displayVersion: formatDisplayVersionForChannel(version, "beta"),
    };
  }

  if (/^0\./.test(trimmed)) {
    return {
      version: trimmed,
      channel: "alpha",
      displayVersion: formatDisplayVersionForChannel(trimmed, "alpha"),
    };
  }

  return {
    version: trimmed,
    channel: "stable",
    displayVersion: formatDisplayVersionForChannel(trimmed, "stable"),
  };
}

function formatDisplayVersionForChannel(
  version: string,
  channel: AppVersionChannel,
): string {
  const baseVersion = version.replace(/[-.](alpha|beta).*$/i, "").trim();

  if (channel === "alpha") {
    return `Alpha ${baseVersion}`;
  }

  if (channel === "beta") {
    return `Beta ${baseVersion}`;
  }

  return `v${baseVersion}`;
}

/** Formats a canonical package version as the user-facing release label. */
export function getDisplayVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) {
    return getBuildAppVersionLabel();
  }

  return resolveAppVersionInfo(trimmed).displayVersion;
}

export function formatSidebarVersionLabel(info: AppVersionInfo): string {
  return info.displayVersion;
}

export function getBuildAppVersionLabel(): string {
  if (!BUILD_APP_VERSION) {
    return "";
  }

  return getDisplayVersion(BUILD_APP_VERSION);
}
