import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CurrencyRateService,
  convertUsdAmount,
  formatConvertedAmount,
} from "../dist/services/currency-rate-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-${name}-${suffix}`);
  return {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    backups: path.join(root, "backups"),
    projects: path.join(root, "projects"),
    assets: path.join(root, "assets"),
    displays: path.join(root, "displays"),
    controllers: path.join(root, "controllers"),
    publishing: path.join(root, "publishing"),
    exports: path.join(root, "exports"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    engineLogs: path.join(root, "logs", "engines"),
    engines: path.join(root, "engines"),
    browserData: path.join(root, "browser-data"),
    browserProfiles: path.join(root, "browser-profiles"),
    cookies: path.join(root, "cookies"),
    cache: path.join(root, "cache"),
    downloads: path.join(root, "downloads"),
    serverEnvFile: path.join(root, "config", "server.env"),
    hostFile: path.join(root, "config", "host.json"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot,
  };
}

test("currency rates persist under userData root", () => {
  const serviceSource = readSrc("desktop/src/services/currency-rate-service.ts");
  assert.ok(serviceSource.includes('path.join(paths.root, "currency-rates.json")'));
});

test("currency rate IPC and preload wiring exist", () => {
  const ipc = readSrc("desktop/src/ipc/currency-rates.ts");
  const preload = readSrc("desktop/src/preload.ts");
  const main = readSrc("desktop/src/main.ts");
  const client = readSrc("src/lib/desktop/currency-rates-client.ts");

  assert.ok(ipc.includes("neud:currency:getRates") || ipc.includes("registerIpcHandler"));
  assert.ok(ipc.includes("neud:currency:refreshNow") || ipc.includes("registerIpcHandler"));
  assert.ok(preload.includes("currencyRates"));
  assert.ok(main.includes("registerCurrencyRatesIpc"));
  assert.ok(client.includes("getCurrencyRates"));
  assert.ok(client.includes("refreshCurrencyRatesNow"));
});

test("currency rate hook loads cached rates without automatic refresh", () => {
  const hook = readSrc("src/lib/desktop/use-currency-rates.ts");
  const serviceSource = readSrc("desktop/src/services/currency-rate-service.ts");

  assert.match(hook, /getCurrencyRates/);
  assert.match(hook, /refreshCurrencyRatesNow/);
  assert.doesNotMatch(hook, /refreshCurrencyRatesIfStale/);
  assert.doesNotMatch(hook, /scheduleAutomaticRefresh/);
  assert.doesNotMatch(hook, /RATE_REFRESH_INTERVAL_MS/);
  assert.doesNotMatch(hook, /setTimeout/);
  assert.match(serviceSource, /refreshRatesIfStale\(\): Promise<CurrencyRates>/);
  assert.match(serviceSource, /return readCachedRates\(this\.paths\)/);
});

test("getRates returns cached defaults when file is missing", () => {
  const paths = createTestPaths("currency-defaults");
  const service = new CurrencyRateService(paths);
  const rates = service.getRates();
  assert.equal(rates.base, "USD");
  assert.equal(typeof rates.rates.EUR, "number");
  assert.equal(typeof rates.rates.GBP, "number");
  assert.equal(typeof rates.rates.CHF, "number");
  assert.equal(typeof rates.rates.JPY, "number");
});

test("converted amounts use numeric formatting without currency symbols", () => {
  const currencyFormat = readSrc("src/lib/desktop/currency-format.ts");
  assert.ok(currencyFormat.includes('style: "decimal"'));
  assert.ok(!currencyFormat.includes('style: "currency"'));

  const formatted = formatConvertedAmount(25000, "EUR", 0.92);
  assert.match(formatted, /^\d[\d,]*$/);
  assert.equal(convertUsdAmount(25000, 0.92), 23000);
});

test("controller shows currency conversions from submitted bid only", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(controller.includes("submittedBidAmount"));
  assert.ok(controller.includes("formatConvertedUsdAmount"));
  assert.ok(controller.includes("SUPPORTED_CURRENCY_CODES"));
});

test("controller current bid summary uses bordered layout matching current lot", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.ok(controller.includes('id="current-bid-summary-label"'));
  assert.ok(controller.includes("uppercase tracking-wide text-muted"));
  assert.ok(controller.includes("Current Bid"));
  assert.ok(!controller.includes("Current bid"));
  assert.ok(controller.includes("rounded-md border border-border bg-surface px-3 py-2 text-sm"));
  assert.ok(controller.includes("{submittedBidLabel}"));
  assert.ok(controller.includes(': "—"'));
});

test("controller bid increment groups share one ascending list", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const types = readSrc("src/lib/bag/types.ts");

  assert.ok(types.includes("export const BAG_BID_INCREMENTS = [1000, 1500, 2500, 5000, 10000]"));
  assert.ok(types.includes("BAG_BID_INCREMENTS.map((amount) => -amount)"));
  assert.ok(controller.includes("BAG_BID_INCREMENTS.map"));
  assert.ok(!controller.includes("BAG_BID_DECREASE_INCREMENTS"));
  assert.ok(!controller.includes("BAG_BID_INCREASE_INCREMENTS"));

  const increaseIndex = controller.indexOf("Increase Bid");
  const decreaseIndex = controller.indexOf("Decrease Bid");
  assert.ok(increaseIndex > -1 && decreaseIndex > -1);
  assert.ok(increaseIndex < decreaseIndex);

  assert.match(controller, /Increase bid by \$\{delta\.toLocaleString\(\)\}/);
  assert.match(controller, /Decrease bid by \$\{amount\.toLocaleString\(\)\}/);
  assert.match(controller, /\+{delta\.toLocaleString\(\)}/);
});

test("controller exposes manual rate refresh on Manual Bid header row", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.match(controller, /Rates updated/);
  assert.match(controller, /"Refresh Rates"/);
  assert.match(controller, /aria-label="Refresh Rates"/);
  assert.match(controller, /refreshRatesManually/);
  assert.match(controller, /justify-between gap-3/);
  assert.match(controller, /!h-5 !w-auto !min-w-0/);
});
