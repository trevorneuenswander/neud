/**
 * Side-by-side Broad Arrow runtime comparison on Windows.
 * 1) Untouched legacy auction-ticker-BACKUP/server.js
 * 2) Production bag-auction-legacy-runtime.js
 *
 * Usage:
 *   cd workers/data-engine
 *   node scripts/compare-legacy-hmg-runtime.mjs
 */
import dotenv from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createBagAuctionLegacyRuntime,
  LEGACY_RUNTIME_VERSION,
} from "../src/adapters/bag-auction-legacy-runtime.js";
import {
  buildPuppeteerChildEnv,
  getPuppeteerApi,
  getPuppeteerExecutable,
  loadBroadArrowPuppeteer,
  normalizePuppeteerEnvironment,
  resolveLegacyBackupRoot,
} from "../src/adapters/legacy-puppeteer-resolver.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(SCRIPT_DIR, "..");
const LEGACY_ROOT = resolveLegacyBackupRoot();
const LEGACY_ENV_PATH = path.join(LEGACY_ROOT, ".env");
const HOOK_PATH = path.join(SCRIPT_DIR, "legacy-submit-diagnostic-hook.mjs");
const LOG_DIR = path.join(WORKER_ROOT, "logs", "runtime-compare");
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, "-");

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
];

function loadLegacyEnv() {
  if (!fs.existsSync(LEGACY_ENV_PATH)) {
    throw new Error(`Legacy .env not found at ${LEGACY_ENV_PATH}`);
  }
  dotenv.config({ path: LEGACY_ENV_PATH });
}

function readCookieCount(cookieFilePath) {
  if (!fs.existsSync(cookieFilePath)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(cookieFilePath, "utf8"));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function yesNo(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function sanitizeSubmitDiagnostics(diagnostics) {
  if (!diagnostics) return null;
  return {
    urlBeforeSubmit: diagnostics.urlBeforeSubmit ?? null,
    urlAfterSubmit: diagnostics.urlAfterSubmit ?? null,
    submitSelectorFound: diagnostics.submitSelectorFound ?? null,
    submitClicked: diagnostics.submitClicked ?? null,
    submitClickStartedAt: diagnostics.submitClickStartedAt ?? null,
    submitClickCompletedAt: diagnostics.submitClickCompletedAt ?? null,
    submitClickDurationMs: diagnostics.submitClickDurationMs ?? null,
    navigationStarted: diagnostics.navigationStarted ?? null,
    submitCompatibilityFallbackUsed: diagnostics.submitCompatibilityFallbackUsed ?? null,
    submitClickTimedOut: diagnostics.submitClickTimedOut ?? null,
    loginRouteRemaining: diagnostics.loginRouteRemaining ?? null,
    submitElement: diagnostics.submitElement ?? null,
    events: Array.isArray(diagnostics.events) ? diagnostics.events.slice(-10) : [],
  };
}

function buildRuntimeMatrix(label, info, extras = {}) {
  return {
    label,
    nodeVersion: info.nodeVersion ?? process.version,
    cwd: info.cwd ?? process.cwd(),
    puppeteerPackagePath: info.puppeteerPackagePath ?? null,
    puppeteerPackageVersion: info.puppeteerPackageVersion ?? null,
    browserExecutable: info.browserExecutable ?? null,
    browserProcessExecutable: info.browserProcessExecutable ?? null,
    browserVersion: info.browserVersion ?? null,
    headless: info.headless ?? null,
    launchArgs: info.launchArgs ?? LAUNCH_ARGS,
    cookieFilePath: extras.cookieFilePath ?? null,
    cookieCountLoaded: extras.cookieCountLoaded ?? null,
    legacyPuppeteerPackageMatch: info.legacyPuppeteerPackageMatch ?? null,
    legacyBrowserExecutableMatch: info.legacyBrowserExecutableMatch ?? null,
    legacyBrowserVersionMatch: info.legacyBrowserVersionMatch ?? null,
    submit: sanitizeSubmitDiagnostics(extras.submitDiagnostics),
    authenticationComplete: extras.authenticationComplete ?? null,
    auctionTableFound: extras.auctionTableFound ?? null,
    vehicleRowsFound: extras.vehicleRowsFound ?? null,
    loginRouteRemaining: extras.loginRouteRemaining ?? null,
    success: extras.success ?? null,
    error: extras.error ?? null,
  };
}

function printRuntimeMatrix(matrix) {
  console.log(`\n=== ${matrix.label} ===`);
  console.log(`Success: ${yesNo(matrix.success)}`);
  if (matrix.error) console.log(`Error: ${matrix.error}`);
  console.log(`Node version: ${matrix.nodeVersion}`);
  console.log(`Working directory: ${matrix.cwd}`);
  console.log(`Puppeteer package: ${matrix.puppeteerPackagePath}`);
  console.log(`Puppeteer version: ${matrix.puppeteerPackageVersion}`);
  console.log(`Browser executable: ${matrix.browserExecutable}`);
  console.log(`Browser process executable: ${matrix.browserProcessExecutable}`);
  console.log(`Browser version: ${matrix.browserVersion}`);
  console.log(`Headless: ${matrix.headless}`);
  console.log(`Launch args: ${JSON.stringify(matrix.launchArgs)}`);
  console.log(`Cookie file: ${matrix.cookieFilePath}`);
  console.log(`Cookie count loaded: ${matrix.cookieCountLoaded ?? "unknown"}`);
  console.log(`Legacy Puppeteer package match: ${yesNo(matrix.legacyPuppeteerPackageMatch)}`);
  console.log(`Legacy browser executable match: ${yesNo(matrix.legacyBrowserExecutableMatch)}`);
  console.log(`Legacy browser version match: ${yesNo(matrix.legacyBrowserVersionMatch)}`);
  console.log(`Authentication complete: ${yesNo(matrix.authenticationComplete)}`);
  console.log(`Auction table found: ${yesNo(matrix.auctionTableFound)}`);
  console.log(`Vehicle rows found: ${matrix.vehicleRowsFound ?? 0}`);
  console.log(`Login route remaining: ${yesNo(matrix.loginRouteRemaining)}`);
  if (matrix.submit) {
    console.log(`Submit clicked: ${yesNo(matrix.submit.submitClicked)}`);
    console.log(`Submit click duration ms: ${matrix.submit.submitClickDurationMs ?? "n/a"}`);
    console.log(`Navigation started: ${yesNo(matrix.submit.navigationStarted)}`);
    console.log(
      `Submit compatibility fallback used: ${yesNo(matrix.submit.submitCompatibilityFallbackUsed)}`,
    );
    console.log(`URL before submit: ${matrix.submit.urlBeforeSubmit ?? "n/a"}`);
    console.log(`URL after submit: ${matrix.submit.urlAfterSubmit ?? "n/a"}`);
    if (matrix.submit.submitElement) {
      console.log(
        `Submit element: ${matrix.submit.submitElement.tagName} type=${matrix.submit.submitElement.type} visible=${yesNo(matrix.submit.submitElement.visible)} enabled=${yesNo(matrix.submit.submitElement.enabled)} connected=${yesNo(matrix.submit.submitElement.connected)}`,
      );
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTickerRows(port, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ticker.json`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const payload = await response.json();
        const rowCount = Array.isArray(payload.lots) ? payload.lots.length : 0;
        if (rowCount > 0) {
          return { rowCount, payload };
        }
      }
    } catch {
      // server may still be booting
    }
    await wait(1500);
  }
  throw new Error(`Timed out waiting for legacy ticker rows on port ${port}.`);
}

async function runLegacyBaseline(referenceRuntimeInfo) {
  const cookieFilePath = path.join(LEGACY_ROOT, "cookies.json");
  const diagnosticFile = path.join(LOG_DIR, `${RUN_STAMP}-legacy-submit-diagnostics.json`);
  const port = Number(process.env.PORT ?? 3030);
  const headless = process.env.HEADLESS !== "false";

  const { puppeteer, runtimeInfo } = await loadBroadArrowPuppeteer({
    legacyRoot: LEGACY_ROOT,
    skipReferenceBrowserProbe: true,
  });
  const puppeteerApi = getPuppeteerApi(puppeteer);
  const browserExecutable = await getPuppeteerExecutable(puppeteer);

  const childEnv = buildPuppeteerChildEnv({
    ...process.env,
    NEUD_LEGACY_SERVER_ROOT: LEGACY_ROOT,
    NEUD_LEGACY_DIAG_FILE: diagnosticFile,
  });

  const hookUrl = pathToFileURL(HOOK_PATH).href;
  const child = spawn(process.execPath, ["--import", hookUrl, "server.js"], {
    cwd: LEGACY_ROOT,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(`[legacy] ${text}`);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(`[legacy-err] ${text}`);
  });

  let success = false;
  let rowCount = 0;
  let error = null;

  try {
    const ticker = await waitForTickerRows(port);
    rowCount = ticker.rowCount;
    success = true;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    child.kill("SIGTERM");
    await wait(1500);
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }

  let submitDiagnostics = null;
  if (fs.existsSync(diagnosticFile)) {
    submitDiagnostics = JSON.parse(fs.readFileSync(diagnosticFile, "utf8"));
  }

  const matrix = buildRuntimeMatrix(
    "Legacy server.js v5.1 baseline",
    {
      ...runtimeInfo,
      headless,
      launchArgs: LAUNCH_ARGS,
      browserExecutable,
      legacyPuppeteerPackageMatch: true,
      legacyBrowserExecutableMatch: true,
      legacyBrowserVersionMatch:
        referenceRuntimeInfo?.browserVersion != null
          ? referenceRuntimeInfo.browserVersion === runtimeInfo.referenceBrowserVersion
          : null,
      browserVersion: referenceRuntimeInfo?.browserVersion ?? runtimeInfo.referenceBrowserVersion,
    },
    {
      cookieFilePath,
      cookieCountLoaded: readCookieCount(cookieFilePath),
      submitDiagnostics,
      authenticationComplete: success && !submitDiagnostics?.loginRouteRemaining,
      auctionTableFound: success,
      vehicleRowsFound: rowCount,
      loginRouteRemaining: submitDiagnostics?.loginRouteRemaining ?? null,
      success,
      error,
    },
  );

  fs.writeFileSync(
    path.join(LOG_DIR, `${RUN_STAMP}-legacy-baseline.json`),
    JSON.stringify({ matrix, stdoutTail: stdout.slice(-4000), stderrTail: stderr.slice(-4000) }, null, 2),
  );

  return matrix;
}

async function runHmgLegacyRuntime(referenceRuntimeInfo) {
  const cookieFilePath = path.join(LEGACY_ROOT, "cookies.json");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hmg-runtime-compare-"));
  process.env.NEUD_APP_DATA_DIR = tempRoot;
  process.env.ENGINE_ID = "runtime-compare";

  const headless = process.env.HEADLESS !== "false";
  const config = {
    AUCTION_URL: process.env.AUCTION_URL,
    LOGIN_URL: process.env.LOGIN_URL,
    AUCTIONS_DISPLAY_URL:
      process.env.AUCTIONS_DISPLAY_URL ??
      "https://bagauction-jumbotron.auctionaccelerate.com/auctions",
    AUCTION_EMAIL: process.env.AUCTION_EMAIL?.trim() ?? "",
    AUCTION_PASSWORD: process.env.AUCTION_PASSWORD ?? "",
    DETAILS_TTL_MS: Number(process.env.DETAILS_TTL_MS ?? 300000),
    MAX_DETAIL_CHECKS_PER_POLL: Number(process.env.MAX_DETAIL_CHECKS_PER_POLL ?? 8),
    HEADLESS: headless,
    COOKIES_FILE: cookieFilePath,
  };

  if (!config.AUCTION_URL || !config.LOGIN_URL || !config.AUCTION_EMAIL || !config.AUCTION_PASSWORD) {
    throw new Error("Legacy .env is missing required Broad Arrow credentials or URLs.");
  }

  const { puppeteer, runtimeInfo, referenceRuntimeInfo: referenceInfo } =
    await loadBroadArrowPuppeteer({ legacyRoot: LEGACY_ROOT });

  const stages = [];
  const runtime = createBagAuctionLegacyRuntime({
    engineId: "runtime-compare",
    config,
    puppeteer,
    runtimeInfo: {
      ...runtimeInfo,
      cwd: LEGACY_ROOT,
      headless,
      launchArgs: LAUNCH_ARGS,
    },
    referenceRuntimeInfo: referenceInfo ?? referenceRuntimeInfo,
    logStage: async (stage, message, metadata = {}) => {
      stages.push({ stage, message, metadata });
      console.log(`[hmg][stage] ${message}`);
    },
    logStageError: async (stage, error, metadata = {}) => {
      console.error(
        `[hmg][stage-error] ${stage}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (metadata.urlBeforeSubmit) {
        console.error(`[hmg][stage-error] url before submit: ${metadata.urlBeforeSubmit}`);
      }
      if (metadata.urlAfterSubmit) {
        console.error(`[hmg][stage-error] url after submit: ${metadata.urlAfterSubmit}`);
      }
    },
  });

  let success = false;
  let error = null;

  try {
    await runtime.start();
    await runtime.scrapeOnce();

    const cache = runtime.getCache();
    const stats = runtime.getLastScrapeStats() ?? {};
    const authInfo = runtime.getAuthInfo();
    const runtimeMatch = runtime.getRuntimeMatchInfo();
    const submitDiagnostics = runtime.getLoginSubmitDiagnostics();

    const rowCount = stats.listingRowCount ?? cache.lots?.length ?? 0;
    success =
      authInfo.authenticationStatus === "Authenticated" &&
      stats.auctionTableFound === true &&
      rowCount > 0 &&
      stats.loginRouteRemaining !== true;

    const matrix = buildRuntimeMatrix(
      "HMG bag-auction-legacy-runtime",
      {
        ...runtimeMatch,
        nodeVersion: process.version,
        cwd: LEGACY_ROOT,
        headless,
        launchArgs: LAUNCH_ARGS,
      },
      {
        cookieFilePath,
        cookieCountLoaded: readCookieCount(cookieFilePath),
        submitDiagnostics,
        authenticationComplete: authInfo.authenticationStatus === "Authenticated",
        auctionTableFound: stats.auctionTableFound === true,
        vehicleRowsFound: rowCount,
        loginRouteRemaining: stats.loginRouteRemaining === true,
        success,
        error: success ? null : "HMG runtime did not reach authenticated scrape with rows.",
      },
    );

    fs.writeFileSync(
      path.join(LOG_DIR, `${RUN_STAMP}-hmg-runtime.json`),
      JSON.stringify({ matrix, stages }, null, 2),
    );

    return matrix;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    const matrix = buildRuntimeMatrix(
      "HMG bag-auction-legacy-runtime",
      {
        ...runtimeInfo,
        nodeVersion: process.version,
        cwd: LEGACY_ROOT,
        headless,
        launchArgs: LAUNCH_ARGS,
      },
      {
        cookieFilePath,
        cookieCountLoaded: readCookieCount(cookieFilePath),
        submitDiagnostics: runtime.getLoginSubmitDiagnostics?.() ?? null,
        success: false,
        error,
      },
    );
    fs.writeFileSync(
      path.join(LOG_DIR, `${RUN_STAMP}-hmg-runtime.json`),
      JSON.stringify({ matrix, stages, error }, null, 2),
    );
    return matrix;
  } finally {
    await runtime.stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function compareMatrices(legacyMatrix, hmgMatrix) {
  const differences = [];
  const fields = [
    ["puppeteerPackagePath", "Puppeteer package path"],
    ["puppeteerPackageVersion", "Puppeteer package version"],
    ["browserExecutable", "Browser executable"],
    ["browserVersion", "Browser version"],
    ["headless", "Headless"],
  ];

  for (const [field, label] of fields) {
    if (legacyMatrix[field] != null && hmgMatrix[field] != null && legacyMatrix[field] !== hmgMatrix[field]) {
      differences.push({
        field,
        label,
        legacy: legacyMatrix[field],
        neud: neudMatrix[field],
      });
    }
  }

  return differences;
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  normalizePuppeteerEnvironment();
  loadLegacyEnv();

  console.log(`Legacy root: ${LEGACY_ROOT}`);
  console.log(`Log directory: ${LOG_DIR}`);
  console.log(`Run stamp: ${RUN_STAMP}`);

  const { referenceRuntimeInfo } = await loadBroadArrowPuppeteer({
    legacyRoot: LEGACY_ROOT,
  });

  console.log("\n--- Phase 1: Legacy baseline ---");
  const legacyMatrix = await runLegacyBaseline(referenceRuntimeInfo);
  printRuntimeMatrix(legacyMatrix);

  if (!legacyMatrix.success) {
    console.error("\nLegacy baseline failed. HMG comparison skipped.");
    process.exit(1);
  }

  console.log("\n--- Phase 2: HMG direct-port runtime ---");
  const hmgMatrix = await runHmgLegacyRuntime(referenceRuntimeInfo);
  printRuntimeMatrix(hmgMatrix);

  const differences = compareMatrices(legacyMatrix, hmgMatrix);
  const summary = {
    runStamp: RUN_STAMP,
    legacySuccess: legacyMatrix.success,
    hmgSuccess: hmgMatrix.success,
    runtimeDifferences: differences,
    firstRuntimeDifference: differences[0] ?? null,
    submitFallbackRequired: hmgMatrix.submit?.submitCompatibilityFallbackUsed === true,
    broadArrowRuntimeVersion: LEGACY_RUNTIME_VERSION,
  };

  fs.writeFileSync(
    path.join(LOG_DIR, `${RUN_STAMP}-summary.json`),
    JSON.stringify(summary, null, 2),
  );

  console.log("\n=== Comparison summary ===");
  console.log(`Legacy success: ${yesNo(summary.legacySuccess)}`);
  console.log(`HMG success: ${yesNo(summary.hmgSuccess)}`);
  console.log(`Submit fallback required: ${yesNo(summary.submitFallbackRequired)}`);
  if (summary.firstRuntimeDifference) {
    console.log(
      `First runtime difference: ${summary.firstRuntimeDifference.label} legacy=${summary.firstRuntimeDifference.legacy} hmg=${summary.firstRuntimeDifference.hmg}`,
    );
  } else {
    console.log("First runtime difference: none detected in recorded matrix");
  }

  process.exit(hmgMatrix.success ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
