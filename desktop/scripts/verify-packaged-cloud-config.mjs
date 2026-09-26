#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findMacAppBundleRoot,
  getMacResourcesDir,
  getWinUnpackedResourcesDir,
} from "./lib/packaged-platform-paths.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolvePackagedResourcesRoot() {
  const macResources = getMacResourcesDir(findMacAppBundleRoot());
  if (macResources && fs.existsSync(macResources)) {
    return { resourcesRoot: macResources, platform: "mac" };
  }

  const winResources = getWinUnpackedResourcesDir();
  if (fs.existsSync(winResources)) {
    return { resourcesRoot: winResources, platform: "win" };
  }

  return null;
}

const layout = resolvePackagedResourcesRoot();
assert.ok(
  layout,
  "No packaged resources found (win-unpacked or NEUD.app). Run electron-builder dir packaging first.",
);

const configPath = path.join(layout.resourcesRoot, "runtime-config", "cloud.json");

assert.equal(
  fs.existsSync(configPath),
  true,
  `Expected ${configPath} to exist after electron-builder dir packaging`,
);

const raw = fs.readFileSync(configPath, "utf8");
assert.doesNotMatch(raw, /SUPABASE_SERVICE_ROLE_KEY/i);
assert.doesNotMatch(raw, /service_role/i);

const config = JSON.parse(raw);
assert.equal(typeof config.supabaseUrl, "string");
assert.ok(config.supabaseUrl.startsWith("https://"));
assert.equal(typeof config.supabasePublishableKey, "string");
assert.ok(config.supabasePublishableKey.length > 20);
assert.equal(
  config.supabasePublishableKey.endsWith(".test"),
  false,
  "Packaged publishable key must not be a placeholder .test value",
);
assert.doesNotMatch(config.supabasePublishableKey, /service_role/i);
assert.equal(typeof config.urlHost, "string");
assert.ok(config.urlHost.length > 0);

const forbiddenEnvPaths =
  layout.platform === "mac"
    ? [
        path.join(layout.resourcesRoot, "staging", "next", ".env.local"),
        path.join(findMacAppBundleRoot() ?? "", ".env.local"),
      ]
    : [
        path.join(layout.resourcesRoot, "staging", "next", ".env.local"),
        path.join(desktopRoot, "release", "win-unpacked", ".env.local"),
      ];

for (const filePath of forbiddenEnvPaths) {
  assert.equal(fs.existsSync(filePath), false, `Must not package ${filePath}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      platform: layout.platform,
      configPath,
      urlHost: config.urlHost,
    },
    null,
    2,
  ),
);
