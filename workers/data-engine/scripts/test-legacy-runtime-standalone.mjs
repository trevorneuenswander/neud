/**
 * Standalone live test for the production bag-auction legacy runtime module.
 * Imports the same createBagAuctionLegacyRuntime used by the worker adapter.
 *
 * Usage:
 *   set NEUD_RUN_LIVE_LOGIN_TEST=true
 *   set BAG_AUCTION_EMAIL=...
 *   set BAG_AUCTION_PASSWORD=...
 *   set AUCTION_URL=...
 *   set LOGIN_URL=...
 *   set AUCTIONS_DISPLAY_URL=...
 *   node workers/data-engine/scripts/test-legacy-runtime-standalone.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import {
  createBagAuctionLegacyRuntime,
  LEGACY_RUNTIME_VERSION,
} from "../src/adapters/bag-auction-legacy-runtime.js";
import {
  loadBroadArrowPuppeteer,
  normalizePuppeteerEnvironment,
  resolveLegacyBackupRoot,
} from "../src/adapters/legacy-puppeteer-resolver.js";

const RUN_LIVE = process.env.NEUD_RUN_LIVE_LOGIN_TEST === "true";
const LEGACY_ROOT = resolveLegacyBackupRoot();
const LEGACY_ENV_PATH = path.join(LEGACY_ROOT, ".env");

if (fs.existsSync(LEGACY_ENV_PATH)) {
  dotenv.config({ path: LEGACY_ENV_PATH });
}

const config = {
  AUCTION_URL:
    process.env.AUCTION_URL ??
    "https://bagauction-jumbotron.auctionaccelerate.com/vehicles",
  LOGIN_URL:
    process.env.LOGIN_URL ??
    "https://bagauction-jumbotron.auctionaccelerate.com/users/sign_in",
  AUCTIONS_DISPLAY_URL:
    process.env.AUCTIONS_DISPLAY_URL ??
    "https://bagauction-jumbotron.auctionaccelerate.com/auctions",
  AUCTION_EMAIL:
    process.env.AUCTION_EMAIL?.trim() ?? process.env.BAG_AUCTION_EMAIL?.trim() ?? "",
  AUCTION_PASSWORD:
    process.env.AUCTION_PASSWORD ?? process.env.BAG_AUCTION_PASSWORD ?? "",
  DETAILS_TTL_MS: Number(process.env.DETAILS_TTL_MS ?? 300000),
  MAX_DETAIL_CHECKS_PER_POLL: Number(process.env.MAX_DETAIL_CHECKS_PER_POLL ?? 8),
  HEADLESS: process.env.HEADLESS !== "false",
};

function yesNo(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function printSanitizedResult(result) {
  console.log(`Broad Arrow runtime: ${result.runtimeVersion}`);
  console.log(`Authentication complete: ${result.authenticationComplete ? "yes" : "no"}`);
  console.log(`Auction Table URL reached: ${result.auctionTableUrlReached ? "yes" : "no"}`);
  console.log(`Login route remaining: ${result.loginRouteRemaining ? "yes" : "no"}`);
  console.log(`Auction table found: ${result.auctionTableFound ? "yes" : "no"}`);
  console.log(`Vehicle rows found: ${result.vehicleRowsFound}`);
  console.log(`Auction display page found: ${result.auctionDisplayPageFound ? "yes" : "no"}`);
  console.log(`Snapshot published: ${result.snapshotPublished ? "yes" : "no"}`);
  console.log(`Puppeteer package: ${result.puppeteerPackagePath ?? "unknown"}`);
  console.log(`Puppeteer version: ${result.puppeteerPackageVersion ?? "unknown"}`);
  console.log(`Browser executable: ${result.browserExecutable ?? "default"}`);
  console.log(`Browser process executable: ${result.browserProcessExecutable ?? "default"}`);
  console.log(`Browser version: ${result.browserVersion ?? "unknown"}`);
  console.log(`Legacy Puppeteer package match: ${yesNo(result.legacyPuppeteerPackageMatch)}`);
  console.log(`Legacy browser executable match: ${yesNo(result.legacyBrowserExecutableMatch)}`);
  console.log(`Legacy browser version match: ${yesNo(result.legacyBrowserVersionMatch)}`);
  console.log(`Submit compatibility fallback used: ${yesNo(result.submitCompatibilityFallbackUsed)}`);
  console.log(`Node version: ${result.nodeVersion}`);
}

async function main() {
  if (!RUN_LIVE) {
    console.log("Skipped: set NEUD_RUN_LIVE_LOGIN_TEST=true to run the standalone legacy runtime test.");
    process.exit(0);
  }

  normalizePuppeteerEnvironment();

  if (!config.AUCTION_EMAIL || !config.AUCTION_PASSWORD) {
    console.error("Missing AUCTION_EMAIL/AUCTION_PASSWORD or BAG_AUCTION_* credentials.");
    process.exit(1);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neud-legacy-runtime-"));
  process.env.NEUD_APP_DATA_DIR = tempRoot;
  process.env.NEUD_COOKIES_DIR = path.join(LEGACY_ROOT);
  process.env.ENGINE_ID = "legacy-runtime-standalone";
  fs.mkdirSync(process.env.NEUD_COOKIES_DIR, { recursive: true });

  const cookiesFile = path.join(LEGACY_ROOT, "cookies.json");
  const stages = [];

  const { puppeteer, runtimeInfo, referenceRuntimeInfo } = await loadBroadArrowPuppeteer({
    legacyRoot: LEGACY_ROOT,
  });

  const runtime = createBagAuctionLegacyRuntime({
    engineId: "legacy-runtime-standalone",
    config: {
      ...config,
      COOKIES_FILE: cookiesFile,
    },
    puppeteer,
    runtimeInfo: {
      ...runtimeInfo,
      cwd: LEGACY_ROOT,
      headless: config.HEADLESS,
      launchArgs: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    },
    referenceRuntimeInfo,
    logStage: async (stage, message) => {
      stages.push({ stage, message });
      console.log(`[stage] ${message}`);
    },
    logStageError: async (stage, error, metadata = {}) => {
      console.error(
        `[stage-error] ${stage}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (metadata.urlBeforeSubmit) {
        console.error(`[stage-error] url before submit: ${metadata.urlBeforeSubmit}`);
      }
      if (metadata.urlAfterSubmit) {
        console.error(`[stage-error] url after submit: ${metadata.urlAfterSubmit}`);
      }
      if (metadata.loginVisibleError) {
        console.error(`[stage-error] visible auth error: ${metadata.loginVisibleError}`);
      }
    },
  });

  try {
    await runtime.start();
    await runtime.scrapeOnce();

    const cache = runtime.getCache();
    const stats = runtime.getLastScrapeStats() ?? {};
    const authInfo = runtime.getAuthInfo();
    const runtimeMatch = runtime.getRuntimeMatchInfo();
    const submitDiagnostics = runtime.getLoginSubmitDiagnostics();

    const result = {
      runtimeVersion: LEGACY_RUNTIME_VERSION,
      authenticationComplete: authInfo.authenticationStatus === "Authenticated",
      auctionTableUrlReached: stats.auctionTableFound === true,
      loginRouteRemaining: stats.loginRouteRemaining === true,
      auctionTableFound: stats.auctionTableFound === true,
      vehicleRowsFound: stats.listingRowCount ?? cache.lots?.length ?? 0,
      auctionDisplayPageFound: stats.auctionDisplayFound === true,
      snapshotPublished: (stats.listingRowCount ?? cache.lots?.length ?? 0) > 0,
      puppeteerPackagePath: runtimeMatch.puppeteerPackagePath ?? null,
      puppeteerPackageVersion: runtimeMatch.puppeteerPackageVersion ?? null,
      browserExecutable: runtimeMatch.browserExecutable ?? null,
      browserProcessExecutable: runtimeMatch.browserProcessExecutable ?? null,
      browserVersion: runtimeMatch.browserVersion ?? null,
      legacyPuppeteerPackageMatch: runtimeMatch.legacyPuppeteerPackageMatch ?? null,
      legacyBrowserExecutableMatch: runtimeMatch.legacyBrowserExecutableMatch ?? null,
      legacyBrowserVersionMatch: runtimeMatch.legacyBrowserVersionMatch ?? null,
      submitCompatibilityFallbackUsed:
        submitDiagnostics?.submitCompatibilityFallbackUsed ?? false,
      nodeVersion: process.version,
    };

    printSanitizedResult(result);

    if (!result.authenticationComplete) {
      throw new Error("Authentication did not complete.");
    }
    if (result.loginRouteRemaining) {
      throw new Error("Login route still present after authentication.");
    }
    if (!result.auctionTableFound) {
      throw new Error("Auction table was not found.");
    }
    if (result.vehicleRowsFound <= 0) {
      throw new Error("No vehicle rows were found.");
    }
    if (result.legacyPuppeteerPackageMatch !== true) {
      throw new Error("Legacy Puppeteer package match is not yes.");
    }
    if (result.legacyBrowserExecutableMatch !== true) {
      throw new Error("Legacy browser executable match is not yes.");
    }
  } catch (error) {
    const runtimeMatch = runtime.getRuntimeMatchInfo?.() ?? {};
    console.error(`[standalone] failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`[standalone] puppeteer package: ${runtimeMatch.puppeteerPackagePath ?? "unknown"}`);
    console.error(`[standalone] puppeteer version: ${runtimeMatch.puppeteerPackageVersion ?? "unknown"}`);
    console.error(`[standalone] browser executable: ${runtimeMatch.browserExecutable ?? "default"}`);
    console.error(`[standalone] browser version: ${runtimeMatch.browserVersion ?? "unknown"}`);
    console.error(`[standalone] node version: ${process.version}`);
    throw error;
  } finally {
    await runtime.stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
