import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveBrowserUserDataDir,
  resolveChromeExecutable,
} from "../src/adapters/webpage-scraper/browser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

test("user data dir prefers NEUD_BROWSER_USER_DATA_DIR over PUPPETEER_CACHE_DIR", () => {
  const previousUserData = process.env.NEUD_BROWSER_USER_DATA_DIR;
  const previousCache = process.env.PUPPETEER_CACHE_DIR;
  const previousAppData = process.env.NEUD_APP_DATA_DIR;
  const previousEngineId = process.env.ENGINE_ID;

  try {
    process.env.NEUD_BROWSER_USER_DATA_DIR = "C:\\profiles\\engine-1";
    process.env.PUPPETEER_CACHE_DIR = "C:\\cache\\puppeteer";
    process.env.NEUD_APP_DATA_DIR = "C:\\appdata";
    process.env.ENGINE_ID = "engine-1";

    assert.equal(resolveBrowserUserDataDir(), "C:\\profiles\\engine-1");
  } finally {
    restoreEnv("NEUD_BROWSER_USER_DATA_DIR", previousUserData);
    restoreEnv("PUPPETEER_CACHE_DIR", previousCache);
    restoreEnv("NEUD_APP_DATA_DIR", previousAppData);
    restoreEnv("ENGINE_ID", previousEngineId);
  }
});

test("user data dir falls back to app browser-data path", () => {
  const previousUserData = process.env.NEUD_BROWSER_USER_DATA_DIR;
  const previousAppData = process.env.NEUD_APP_DATA_DIR;
  const previousEngineId = process.env.ENGINE_ID;

  try {
    delete process.env.NEUD_BROWSER_USER_DATA_DIR;
    process.env.NEUD_APP_DATA_DIR = "C:\\appdata";
    process.env.ENGINE_ID = "abc";

    assert.equal(
      resolveBrowserUserDataDir(),
      path.join("C:\\appdata", "browser-data", "abc"),
    );
  } finally {
    restoreEnv("NEUD_BROWSER_USER_DATA_DIR", previousUserData);
    restoreEnv("NEUD_APP_DATA_DIR", previousAppData);
    restoreEnv("ENGINE_ID", previousEngineId);
  }
});

test("browser.js no longer assigns PUPPETEER_CACHE_DIR to userDataDir", () => {
  const source = readFileSync(
    path.join(
      repoRoot,
      "workers/data-engine/src/adapters/webpage-scraper/browser.js",
    ),
    "utf8",
  );
  assert.match(source, /NEUD_BROWSER_USER_DATA_DIR/);
  assert.match(source, /resolveChromeExecutable/);
  assert.doesNotMatch(
    source,
    /userDataDir\s*=\s*cacheDir|userDataDir:\s*cacheDir|launchOptions\.userDataDir\s*=\s*cacheDir/,
  );
});

test("engine-manager sets NEUD browser profile env vars for workers", () => {
  const source = readFileSync(
    path.join(repoRoot, "desktop/src/services/engine-manager.ts"),
    "utf8",
  );
  assert.match(source, /NEUD_BROWSER_USER_DATA_DIR = input\.browserUserDataDir/);
  assert.match(source, /NEUD_COOKIES_DIR = this\.paths\.cookies/);
  assert.match(source, /path\.join\(this\.paths\.browserData, id\)/);
});

test("resolveChromeExecutable returns a path string or null", () => {
  const resolved = resolveChromeExecutable();
  assert.ok(resolved === null || typeof resolved === "string");
  if (resolved) {
    assert.match(resolved, /chrome|chromium/i);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
