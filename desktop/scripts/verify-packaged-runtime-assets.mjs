#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { findReleaseRoots } from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const require = createRequire(import.meta.url);
const manifestPath = path.join(desktopRoot, "runtime-asset-manifest.json");

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function readAsarFileList(asarPath) {
  const { extractAll } = require("@electron/asar");
  const tempRoot = fs.mkdtempSync(path.join(process.env.TEMP ?? ".", "neud-asar-audit-"));
  extractAll(asarPath, tempRoot);
  return tempRoot;
}

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolvePackagedRuntimeAssetPath(resourcesRoot, packagedRelativePath) {
  return path.join(resourcesRoot, "runtime-assets", packagedRelativePath);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function scanNeudRuntimeJsForSuspiciousPatterns(extractedRoot, extractedFiles) {
  const suspicious = [];
  const patterns = [
    /shared\/display-runtime\/browser/,
    /shared\/bag\/bag-runtime-config\.json/,
    /\.\.\/\.\.\/\.\.\/shared\//,
    /\.\.\/\.\.\/\.\.\/\.\.\/shared\//,
    /desktop\/src\/displays\/bundled/,
    /readBundledHtml\(/,
    /Desktop\\Neud/i,
    /C:\\Users\\/i,
  ];

  for (const relativePath of extractedFiles.filter((file) => file.endsWith(".js"))) {
    const contents = fs.readFileSync(
      path.join(extractedRoot, ...relativePath.split("/")),
      "utf8",
    );

    for (const pattern of patterns) {
      if (pattern.test(contents)) {
        suspicious.push(`${relativePath} matches ${pattern}`);
      }
    }
  }

  return suspicious;
}

const unpackedRoot = findReleaseRoots(desktopRoot)[0] ?? null;
assert.ok(unpackedRoot, "Build with npm run package:win first.");

const manifest = readManifest();
const resourcesRoot = path.join(unpackedRoot, "resources");
const asarPath = path.join(resourcesRoot, "app.asar");
assert.equal(fs.existsSync(asarPath), true, "Missing app.asar");

const extractedRoot = readAsarFileList(asarPath);
const extractedFiles = walkFiles(extractedRoot).map((file) =>
  file.slice(extractedRoot.length + 1).replace(/\\/g, "/"),
);

for (const asset of manifest.extraResources ?? []) {
  if (asset.required === false) {
    continue;
  }

  const packagedPath = resolvePackagedRuntimeAssetPath(
    resourcesRoot,
    asset.packagedRelativePath,
  );
  assert.equal(
    fs.existsSync(packagedPath),
    true,
    `Missing runtime asset ${asset.id} at ${packagedPath}`,
  );

  const contents = fs.readFileSync(packagedPath, "utf8");
  assert.ok(contents.trim().length > 0, `Runtime asset ${asset.id} is empty`);
}

const normalizeScriptPath = resolvePackagedRuntimeAssetPath(
  resourcesRoot,
  "display/normalize-display-snapshot.js",
);
const normalizeScript = fs.readFileSync(normalizeScriptPath, "utf8");
assert.match(
  normalizeScript,
  /normalizeDisplaySnapshot|DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION/,
  "normalize-display-snapshot.js does not look like the expected runtime script",
);

const templatesJs = fs.readFileSync(
  path.join(extractedRoot, "dist", "developer-tools", "templates.js"),
  "utf8",
);
assert.doesNotMatch(
  templatesJs,
  /shared\/display-runtime\/browser/,
  "Packaged templates.js must not reference repository shared browser path",
);
assert.match(
  templatesJs,
  /runtime-assets/,
  "Packaged templates.js must resolve runtime assets through runtime-assets helper",
);

const streamImportJs = fs.readFileSync(
  path.join(extractedRoot, "dist", "services", "broad-arrow-stream-displays-import-service.js"),
  "utf8",
);
assert.match(
  streamImportJs,
  /bundled-display-sources/,
  "Stream display import service must use bundled-display-sources helper",
);
assert.doesNotMatch(
  streamImportJs,
  /readBundledHtml/,
  "Stream display import service must not use legacy readBundledHtml helper",
);

const bundledDisplayHelperJs = fs.readFileSync(
  path.join(extractedRoot, "dist", "lib", "bundled-display-sources.js"),
  "utf8",
);
assert.match(
  bundledDisplayHelperJs,
  /app\.getAppPath\(\)/,
  "Bundled display resolver must use app.getAppPath() in packaged mode",
);

const bagConfigJson = "dist/bag/config/bag-runtime-config.json";
const bagConfigJs = "dist/bag/config/bag-runtime-config.js";
assert.equal(extractedFiles.includes(bagConfigJson), true, `Missing ${bagConfigJson}`);
assert.equal(extractedFiles.includes(bagConfigJs), true, `Missing ${bagConfigJs}`);

const bagConfigSource = fs.readFileSync(
  path.join(extractedRoot, ...bagConfigJs.split("/")),
  "utf8",
);
assert.match(
  bagConfigSource,
  /require\("\.\/bag-runtime-config\.json"\)/,
  "Packaged bag-runtime-config.js must require co-located JSON",
);

for (const asset of manifest.asar ?? []) {
  if (asset.required === false || !asset.asarPath) {
    continue;
  }

  if (asset.asarPath.endsWith("/")) {
    const dirPath = asset.asarPath.replace(/\/$/, "");
    const hasFiles = extractedFiles.some(
      (file) => file.startsWith(`${dirPath}/`) || file === dirPath,
    );
    assert.equal(hasFiles, true, `Missing ASAR asset directory ${asset.id} (${dirPath})`);

    if (Array.isArray(asset.files)) {
      for (const fileName of asset.files) {
        const packagedRelative = `${dirPath}/${fileName}`;
        assert.equal(
          extractedFiles.includes(packagedRelative),
          true,
          `Missing bundled display HTML ${fileName}`,
        );

        const canonicalSource = path.join(
          repoRoot,
          "desktop",
          "src",
          "displays",
          "bundled",
          fileName,
        );
        const packagedPath = path.join(extractedRoot, ...packagedRelative.split("/"));
        assert.equal(
          sha256(canonicalSource),
          sha256(packagedPath),
          `Packaged ${fileName} does not match canonical source`,
        );
      }
    }

    continue;
  }

  assert.equal(
    extractedFiles.includes(asset.asarPath),
    true,
    `Missing ASAR asset ${asset.id} (${asset.asarPath})`,
  );
}

const suspiciousPatterns = scanNeudRuntimeJsForSuspiciousPatterns(
  extractedRoot,
  extractedFiles.filter((file) => file.startsWith("dist/")),
);
assert.deepEqual(
  suspiciousPatterns,
  [],
  `Suspicious packaged runtime path references:\n${suspiciousPatterns.join("\n")}`,
);

const cookiesModule = path.join(
  resourcesRoot,
  "staging",
  "next",
  "node_modules",
  "next",
  "dist",
  "compiled",
  "@edge-runtime",
  "cookies",
);
assert.equal(
  fs.existsSync(cookiesModule),
  true,
  "Missing staged next/dist/compiled/@edge-runtime/cookies",
);

const chromeExe = path.join(
  resourcesRoot,
  "puppeteer",
  "chrome",
  "chrome-win64",
  "chrome.exe",
);
assert.equal(fs.existsSync(chromeExe), true, "Missing bundled Chrome executable");

for (const asset of manifest.externalResources ?? []) {
  if (asset.required === false) {
    continue;
  }
  const externalPath = path.join(resourcesRoot, ...asset.resourcesPath.split("/"));
  assert.equal(
    fs.existsSync(externalPath),
    true,
    `Missing external runtime resource ${asset.id} at ${externalPath}`,
  );
}

const electronBuilder = fs.readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8");
assert.match(electronBuilder, /copyright: © 2026 NEUD/);
assert.match(electronBuilder, /productName: NEUD/);
assert.match(electronBuilder, /runtime-assets/);

console.log(
  JSON.stringify(
    {
      ok: true,
      unpackedRoot,
      runtimeAssetsRoot: path.join(resourcesRoot, "runtime-assets"),
      normalizeScriptPath,
      bagConfigJson,
      cookiesModulePresent: true,
      chromeExe,
      manifestAssetCount: {
        extraResources: (manifest.extraResources ?? []).length,
        asar: (manifest.asar ?? []).length,
        externalResources: (manifest.externalResources ?? []).length,
      },
    },
    null,
    2,
  ),
);
