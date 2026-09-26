export type PackagedChromePlatformKey = "win32-x64" | "darwin-arm64";

export interface PackagedChromeProfile {
  platformKey: PackagedChromePlatformKey;
  os: string;
  arch: string;
  chromeBundleDirName: string;
  executableRelativePath: string;
  packagedRelativeDir: string;
  puppeteerCacheFolderPrefix: string;
  systemChromeCandidates: (env: NodeJS.ProcessEnv) => string[];
}

export const PACKAGED_CHROME_PROFILES: Record<
  PackagedChromePlatformKey,
  PackagedChromeProfile
>;

export function resolveRuntimePlatformKey(
  os?: string,
  arch?: string,
): PackagedChromePlatformKey;

export function resolvePackagingProfile(options?: {
  os?: string;
  arch?: string;
  platformKey?: PackagedChromePlatformKey;
}): PackagedChromeProfile;

export function findPackagedBrowserManifestPath(
  resourcesPath: string | null | undefined,
): string | null;

export function readPackagedBrowserManifest(
  resourcesPath: string | null | undefined,
): Record<string, unknown> | null;

export function resolvePackagingProfileForPackagedRuntime(
  resourcesPath: string | null | undefined,
  options?: { os?: string; arch?: string },
): PackagedChromeProfile;

export function buildPackagedBrowserRuntimeDiagnostic(
  resourcesPath: string | null | undefined,
  options?: { os?: string; arch?: string },
): Record<string, unknown>;

export function resolvePackagedChromeExecutablePath(
  bundleRootDir: string,
  profile: PackagedChromeProfile,
): string;

export function isUsableChromeExecutable(candidate: unknown): boolean;

export function resolvePackagedBrowserExecutable(
  resourcesPath: string | null | undefined,
  profile?: PackagedChromeProfile,
): string | null;

export function getPrimaryPackagedBrowserPath(
  resourcesPath: string | null | undefined,
  profile?: PackagedChromeProfile,
): string;
