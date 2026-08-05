#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("installed browser diagnostic service exists and writes JSON report", () => {
  const service = read("desktop/src/services/installed-browser-diagnostic-service.ts");
  assert.match(service, /installed-browser-diagnostic\.json/);
  assert.match(service, /runInstalledBrowserDiagnostic/);
  assert.match(service, /process\.resourcesPath/);
  assert.match(service, /chrome-win64/);
  assert.match(service, /chrome\.exe/);
  assert.match(service, /directLaunch/);
  assert.match(service, /puppeteerLaunch/);
});

test("main process runs packaged browser diagnostic on startup", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /runAndWriteInstalledBrowserDiagnostic/);
  assert.match(main, /isPackagedDesktopRuntime/);
});

test("browser resolver does not use system Chrome in packaged mode", () => {
  const resolver = read("workers/data-engine/src/browser/resolve-puppeteer-browser.js");
  assert.match(resolver, /packagedMode/);
  assert.match(resolver, /resolvePackagedBrowserExecutable/);
});
