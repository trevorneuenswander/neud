#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  hasAsarFile,
  readAsarFile,
  withTemporaryAsarFixture,
} from "./lib/asar-inspection.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("sync script copies packaged Chrome profile into desktop runtime tree", () => {
  const sync = read("desktop/scripts/sync-packaged-chrome-profile.mjs");
  assert.match(
    sync,
    /desktop", "src", "lib", "browser", "packaged-chrome-profile\.js"/,
  );

  const desktopCopy = path.join(
    desktopRoot,
    "src",
    "lib",
    "browser",
    "packaged-chrome-profile.js",
  );
  assert.equal(
    fs.existsSync(desktopCopy),
    true,
    "Run sync-packaged-chrome-profile.mjs during desktop build",
  );
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

test("desktop dist resolves packaged Chrome profile from lib/browser", () => {
  const distStartup = path.join(desktopRoot, "dist", "services", "startup-diagnostics.js");
  assert.equal(fs.existsSync(distStartup), true, "Build @neud/desktop before running this test");

  const source = fs.readFileSync(distStartup, "utf8");
  assert.match(source, /require\("\.\.\/lib\/browser\/packaged-chrome-profile\.js"\)/);

  const profilePath = path.join(desktopRoot, "dist", "lib", "browser", "packaged-chrome-profile.js");
  assert.equal(fs.existsSync(profilePath), true);

  const resolved = path.resolve(path.dirname(distStartup), "../lib/browser/packaged-chrome-profile.js");
  assert.equal(fs.existsSync(resolved), true);

  return import(pathToFileURL(resolved).href).then((module) => {
    assert.equal(typeof module.resolvePackagingProfileForPackagedRuntime, "function");
    assert.equal(typeof module.PACKAGED_CHROME_PROFILES?.["win32-x64"], "object");
    assert.equal(typeof module.PACKAGED_CHROME_PROFILES?.["darwin-arm64"], "object");
  });
});
