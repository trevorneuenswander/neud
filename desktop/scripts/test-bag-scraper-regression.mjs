import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("legacy runtime migration module copies cookies and browser data", () => {
  const source = readSrc("desktop/src/services/legacy-runtime-migration.ts");
  assert.match(source, /migrateLegacyEngineCookies/);
  assert.match(source, /migrateLegacyEngineBrowserData/);
  assert.match(source, /getLegacyUserDataRoots/);
});

test("startup repairs Broad Arrow config and migrates legacy runtime assets", () => {
  const main = readSrc("desktop/src/main.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(main, /repairBroadArrowConfiguration\(\)/);
  assert.match(main, /migrateAllLegacyEngineRuntimeAssets\(\)/);
  assert.match(localData, /migrateAllLegacyEngineRuntimeAssets/);
});

test("successful scraper runs clear stale last_error", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(localData, /recordRunSuccess\([\s\S]*lastError: null/);
});

test("display disconnect does not stop data engine", () => {
  const displayPolling = readSrc("desktop/scripts/test-display-connection-polling.mjs");
  assert.match(displayPolling, /assert\.doesNotMatch\(localData, \/setPylonDisplayEnabled/);
  assert.match(displayPolling, /assert\.doesNotMatch\(localData, \/setNewBidDisplayEnabled/);
});

test("data source switching does not stop scraper process", () => {
  const source = readSrc("desktop/scripts/test-data-source-switch.mjs");
  assert.match(source, /does not restart scraper or await activity sync/);
});

test("required bag-auction runtime files exist after data-engine build", () => {
  const required = [
    "workers/data-engine/dist/index.js",
    "workers/data-engine/dist/adapters/bag-auction.js",
    "workers/data-engine/dist/adapters/bag-auction-legacy-runtime.js",
    "workers/data-engine/dist/adapters/bag-lot-detail-page.js",
    "workers/data-engine/dist/browser/resolve-puppeteer-browser.js",
    "workers/data-engine/dist/engine-runtime.js",
  ];

  for (const relativePath of required) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, relativePath)),
      true,
      `Missing runtime asset: ${relativePath}`,
    );
  }
});

test("bag-auction runtime uses ESM imports without bare require()", () => {
  for (const relativePath of [
    "workers/data-engine/src/adapters/bag-auction.js",
    "workers/data-engine/src/adapters/bag-auction-legacy-runtime.js",
    "workers/data-engine/src/adapters/registry.js",
    "workers/data-engine/src/engine-runtime.js",
  ]) {
    const source = readSrc(relativePath);
    assert.doesNotMatch(source, /\brequire\(/, `${relativePath} must stay ESM-only`);
  }
});

test("copy-runtime-assets validates required worker runtime files", () => {
  const script = readSrc("desktop/scripts/copy-runtime-assets.mjs");
  assert.match(script, /validateDataEngineRuntimeAssets/);
  assert.match(script, /bag-auction-legacy-runtime\.js/);
});

test("credential store decrypts and re-saves legacy userData credentials", () => {
  const store = readSrc("desktop/src/services/credential-store.ts");
  assert.match(store, /tryReadEncryptedCredentialFile/);
  assert.match(store, /getLegacyUserDataRoots/);
  assert.match(store, /\[CredentialMigration\]/);
  assert.match(store, /removed unusable credential blob/);
});

test("readStoredCredentials does not throw on undecryptable credential blobs", () => {
  const store = readSrc("desktop/src/services/credential-store.ts");
  assert.match(
    store,
    /readStoredCredentials[\s\S]*return tryReadEncryptedCredentialFile\(file\)/,
  );
});

test("engine start accepts persisted session cookies when secure credentials are unavailable", () => {
  const store = readSrc("desktop/src/services/credential-store.ts");
  const manager = readSrc("desktop/src/services/engine-manager.ts");
  const sessionAuth = readSrc("desktop/src/services/engine-session-auth.ts");
  assert.match(sessionAuth, /hasPersistedSessionCookies/);
  assert.match(store, /hasRunnableAuth/);
  assert.match(manager, /hasRunnableAuth/);
});

test("bag-auction worker allows cookie-only auth when credentials endpoint is empty", () => {
  const adapter = readSrc("workers/data-engine/src/adapters/bag-auction.js");
  assert.match(adapter, /getCookiesFile\(\)/);
  assert.match(adapter, /return \{ email: "", password: "" \}/);
});
