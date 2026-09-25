import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getWinUnpackedResourcesDir,
  getMacAppUpdateYamlPath,
} from "./packaged-platform-paths.mjs";

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const FORBIDDEN_KEY_PATTERN = /token|secret|password|service.?role/i;

export function readElectronBuilderYaml() {
  return fs.readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8");
}

export function parseSimpleYamlMapping(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.+?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2];
  }
  return values;
}

export function readPackagedUpdatePublishConfig() {
  const yaml = readElectronBuilderYaml();
  const publishSection = yaml.slice(yaml.indexOf("publish:"));
  const publish = parseSimpleYamlMapping(publishSection);

  const appIdMatch = yaml.match(/^appId:\s*(.+?)\s*$/m);
  const appId = appIdMatch?.[1]?.trim() ?? "com.hildreths.neud";

  const provider = publish.provider?.trim();
  const owner = publish.owner?.trim();
  const repo = publish.repo?.trim();

  if (!provider || !owner || !repo) {
    throw new Error(
      "electron-builder.yml publish.provider, publish.owner, and publish.repo are required.",
    );
  }

  if (FORBIDDEN_KEY_PATTERN.test(JSON.stringify(publish))) {
    throw new Error("electron-builder publish config must not include tokens or secrets.");
  }

  return {
    provider,
    owner,
    repo,
    appId,
    updaterCacheDirName: `${appId}-updater`,
  };
}

export function buildAppUpdateYaml(config = readPackagedUpdatePublishConfig()) {
  return [
    `provider: ${config.provider}`,
    `owner: ${config.owner}`,
    `repo: ${config.repo}`,
    `updaterCacheDirName: ${config.updaterCacheDirName}`,
    "",
  ].join("\n");
}

export {
  getWinUnpackedResourcesDir,
  getMacResourcesDir,
  getMacAppUpdateYamlPath,
  findMacAppBundleRoot,
  getReleaseDir,
} from "./packaged-platform-paths.mjs";

export function getAppUpdateYamlPath(platform = "win") {
  if (platform === "mac") {
    const macPath = getMacAppUpdateYamlPath();
    if (macPath) {
      return macPath;
    }
  }
  return path.join(getWinUnpackedResourcesDir(), "app-update.yml");
}
