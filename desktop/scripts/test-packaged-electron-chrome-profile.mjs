#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  hasAsarFile,
  readAsarFile,
  requireCommonJsModuleFromAsar,
  withTemporaryAsarFixture,
} from "./lib/asar-inspection.mjs";
import {
  assertCommonJsPackagedChromeProfileModule,
  readDesktopDistPackagedChromeProfilePath,
  requireCommonJsPackagedChromeProfileAt,
} from "./lib/packaged-chrome-profile-cjs-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("sync script copies ESM profile into worker runtime trees only", () => {
  const sync = read("desktop/scripts/sync-packaged-chrome-profile.mjs");
  assert.doesNotMatch(
    sync,
    /desktop", "src", "lib", "browser", "packaged-chrome-profile\.js"/,
  );
  assert.match(sync, /workers", "data-engine", "dist", "browser", "packaged-chrome-profile\.js"/);

  const workerCopy = path.join(
    repoRoot,
    "workers",
    "data-engine",
    "dist",
    "browser",
    "packaged-chrome-profile.js",
  );
  assert.equal(fs.existsSync(workerCopy), true, "Worker build should sync canonical ESM profile");
  const workerSource = fs.readFileSync(workerCopy, "utf8");
  assert.match(workerSource, /^\s*import\s/m);
});

test("desktop build emits CommonJS packaged Chrome profile from canonical shared source", () => {
  const buildScript = read("desktop/scripts/build-packaged-chrome-profile-cjs.mjs");
  assert.match(buildScript, /tsconfig\.packaged-chrome-profile\.json/);
  assert.match(read("desktop/scripts/copy-runtime-assets.mjs"), /buildPackagedChromeProfileCjs/);

  const desktopTypes = path.join(
    desktopRoot,
    "src",
    "lib",
    "browser",
    "packaged-chrome-profile.d.ts",
  );
  assert.equal(fs.existsSync(desktopTypes), true, "Desktop keeps synced type stub for tsc");
});

test("Electron services import desktop-local packaged Chrome profile", () => {
  const startup = read("desktop/src/services/startup-diagnostics.ts");
  const installed = read("desktop/src/services/installed-browser-diagnostic-service.ts");
  assert.match(startup, /from "\.\.\/lib\/browser\/packaged-chrome-profile\.js"/);
  assert.match(installed, /from "\.\.\/lib\/browser\/packaged-chrome-profile\.js"/);
  assert.doesNotMatch(startup, /shared\/browser\/packaged-chrome-profile/);
});

test("asar inspection reads file contents via @electron/asar API", async () => {
  await withTemporaryAsarFixture(
    {
      "dist/services/startup-diagnostics.js":
        'require("../lib/browser/packaged-chrome-profile.js");',
    },
    async (asarPath) => {
      assert.equal(hasAsarFile(asarPath, "dist/services/startup-diagnostics.js"), true);
      const contents = readAsarFile(asarPath, "dist/services/startup-diagnostics.js");
      assert.match(contents, /\.\.\/lib\/browser\/packaged-chrome-profile\.js/);
    },
  );
});

test("desktop dist Chrome profile loads under CommonJS require (Electron main semantics)", () => {
  const distStartup = path.join(desktopRoot, "dist", "services", "startup-diagnostics.js");
  assert.equal(fs.existsSync(distStartup), true, "Build @neud/desktop before running this test");

  const source = fs.readFileSync(distStartup, "utf8");
  assert.match(source, /require\("\.\.\/lib\/browser\/packaged-chrome-profile\.js"\)/);

  const profilePath = readDesktopDistPackagedChromeProfilePath(desktopRoot);
  assert.equal(fs.existsSync(profilePath), true);

  const profileSource = fs.readFileSync(profilePath, "utf8");
  assert.doesNotMatch(profileSource, /^\s*import\s/m);
  assert.doesNotMatch(profileSource, /^\s*export\s/m);

  const resolved = path.resolve(path.dirname(distStartup), "../lib/browser/packaged-chrome-profile.js");
  assert.equal(resolved, profilePath);

  requireCommonJsPackagedChromeProfileAt(profilePath);
});

test("packaged asar Chrome profile module executes under CommonJS require", async () => {
  const profilePath = readDesktopDistPackagedChromeProfilePath(desktopRoot);
  assert.equal(fs.existsSync(profilePath), true, "Build @neud/desktop before running this test");
  const profileContents = fs.readFileSync(profilePath, "utf8");

  await withTemporaryAsarFixture(
    {
      "dist/lib/browser/packaged-chrome-profile.js": profileContents,
      "dist/services/startup-diagnostics.js":
        'const profile = require("../lib/browser/packaged-chrome-profile.js");\n' +
        "if (typeof profile.resolvePackagingProfileForPackagedRuntime !== 'function') {\n" +
        "  throw new Error('missing profile export');\n" +
        "}\n",
    },
    async (asarPath) => {
      const asarModule = requireCommonJsModuleFromAsar(
        asarPath,
        "dist/lib/browser/packaged-chrome-profile.js",
      );
      assertCommonJsPackagedChromeProfileModule(asarModule);
    },
  );
});
