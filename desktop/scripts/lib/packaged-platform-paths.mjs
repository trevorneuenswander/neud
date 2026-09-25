import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export function getReleaseDir() {
  return path.join(desktopRoot, "release");
}

export function getWinUnpackedResourcesDir() {
  return path.join(getReleaseDir(), "win-unpacked", "resources");
}

export function findMacAppBundleRoot() {
  const releaseDir = getReleaseDir();
  if (!fs.existsSync(releaseDir)) {
    return null;
  }

  const direct = path.join(releaseDir, "mac-arm64", "NEUD.app");
  if (fs.existsSync(direct)) {
    return direct;
  }

  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(releaseDir, entry.name, "NEUD.app");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getMacResourcesDir(appBundleRoot = findMacAppBundleRoot()) {
  if (!appBundleRoot) {
    return null;
  }
  return path.join(appBundleRoot, "Contents", "Resources");
}

export function getMacAppUpdateYamlPath(appBundleRoot = findMacAppBundleRoot()) {
  const resources = getMacResourcesDir(appBundleRoot);
  if (!resources) {
    return null;
  }
  return path.join(resources, "app-update.yml");
}
