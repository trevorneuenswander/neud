#!/usr/bin/env node
/**
 * electron-builder does not write resources/app-update.yml when packaging with
 * --publish never and/or --prepackaged. Inject the canonical GitHub provider
 * config expected by electron-updater before NSIS packaging.
 */
import fs from "node:fs";
import {
  buildAppUpdateYaml,
  getAppUpdateYamlPath,
  getWinUnpackedResourcesDir,
  readPackagedUpdatePublishConfig,
} from "./lib/electron-builder-publish-config.mjs";

const resourcesDir = getWinUnpackedResourcesDir();
const outputPath = getAppUpdateYamlPath();

if (!fs.existsSync(resourcesDir)) {
  console.error(`Missing packaged resources directory: ${resourcesDir}`);
  console.error("Run electron-builder --win dir before ensure-packaged-app-update-config.");
  process.exit(1);
}

const config = readPackagedUpdatePublishConfig();
const contents = buildAppUpdateYaml(config);
fs.writeFileSync(outputPath, contents, "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      outputPath,
      provider: config.provider,
      owner: config.owner,
      repo: config.repo,
      updaterCacheDirName: config.updaterCacheDirName,
    },
    null,
    2,
  ),
);
