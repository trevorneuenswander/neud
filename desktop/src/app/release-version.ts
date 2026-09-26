import fs from "fs";
import path from "path";
import { app } from "electron";

let cachedReleaseVersion: string | null = null;

function readVersionFromPackageJson(packageJsonPath: string): string | null {
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      version?: unknown;
    };
    const version = typeof parsed.version === "string" ? parsed.version.trim() : "";
    return version || null;
  } catch {
    return null;
  }
}

/**
 * Canonical NEUD release version for the desktop runtime.
 *
 * Resolution order:
 * 1. desktop/package.json adjacent to the compiled main process (../package.json from dist/)
 * 2. package.json in the Electron app path
 * 3. package.json in the current working directory
 * 4. Electron app.getVersion() after metadata has been synchronized
 */
export function getCanonicalReleaseVersion(): string {
  if (cachedReleaseVersion) {
    return cachedReleaseVersion;
  }

  const candidates = [
    path.resolve(__dirname, "..", "package.json"),
    path.resolve(app.getAppPath(), "package.json"),
    path.resolve(process.cwd(), "package.json"),
  ];

  for (const candidate of candidates) {
    const version = readVersionFromPackageJson(candidate);
    if (version) {
      cachedReleaseVersion = version;
      return cachedReleaseVersion;
    }
  }

  const electronVersion = app.getVersion()?.trim();
  if (electronVersion) {
    cachedReleaseVersion = electronVersion;
    return cachedReleaseVersion;
  }

  throw new Error("Unable to resolve NEUD release version from package metadata.");
}

export function syncElectronReleaseVersion(): string {
  return getCanonicalReleaseVersion();
}

export type DesktopBuildInfo = {
  appVersion: string;
  gitCommit: string;
  builtAt: string | null;
};

let cachedBuildInfo: DesktopBuildInfo | null = null;

export function getDesktopBuildInfo(): DesktopBuildInfo {
  if (cachedBuildInfo) {
    return cachedBuildInfo;
  }

  const candidates = [
    path.resolve(__dirname, "..", "build-info.json"),
    path.resolve(app.getAppPath(), "build-info.json"),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
        appVersion?: unknown;
        gitCommit?: unknown;
        builtAt?: unknown;
      };
      cachedBuildInfo = {
        appVersion:
          typeof parsed.appVersion === "string" && parsed.appVersion.trim()
            ? parsed.appVersion.trim()
            : getCanonicalReleaseVersion(),
        gitCommit:
          typeof parsed.gitCommit === "string" && parsed.gitCommit.trim()
            ? parsed.gitCommit.trim()
            : "unknown",
        builtAt:
          typeof parsed.builtAt === "string" && parsed.builtAt.trim()
            ? parsed.builtAt.trim()
            : null,
      };
      return cachedBuildInfo;
    } catch {
      // try next candidate
    }
  }

  cachedBuildInfo = {
    appVersion: getCanonicalReleaseVersion(),
    gitCommit: "unknown",
    builtAt: null,
  };
  return cachedBuildInfo;
}
