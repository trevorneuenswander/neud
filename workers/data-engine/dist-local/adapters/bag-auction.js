import fs from "fs";
import { sanitizeError, StepError } from "../errors.js";
import {
  formatStageFailure,
  logBagDiagnostic,
  logBagDiagnosticError,
} from "../bag-diagnostics.js";
import { isLocalApiEnabled, loadWorkerCredentials } from "../local-client.js";
import { getSourceUrl } from "../settings.js";
import {
  createBagAuctionLegacyRuntime,
  LEGACY_RUNTIME_VERSION,
} from "./bag-auction-legacy-runtime.js";
import { loadBroadArrowPuppeteer } from "./legacy-puppeteer-resolver.js";
import {
  getCookiesFile,
} from "./webpage-scraper/browser.js";
import { setLifecycleActualState } from "../lifecycle-state.js";
import { updateEngineStatus } from "../heartbeat.js";
import {
  bagAdapterSupportsEventDrivenLive,
  publishBagLiveSnapshot,
} from "./bag-auction-event-driven.js";
import { isBagEventDrivenLiveEnabled } from "./bag-live-feed-utils.js";
import { writeSnapshot } from "../snapshots.js";
import { recordRunSuccess, writeHeartbeat } from "../heartbeat.js";
import { writeLog } from "../logs.js";

const LEGACY_REFERENCE_URLS = {
  auctionTable: "https://bagauction-jumbotron.auctionaccelerate.com/vehicles",
  login: "https://bagauction-jumbotron.auctionaccelerate.com/users/sign_in",
  auctionDisplay: "https://bagauction-jumbotron.auctionaccelerate.com/auctions",
};

async function resolveSecureCredentials(engineId) {
  let email = "";
  let password = "";

  if (isLocalApiEnabled()) {
    try {
      const fresh = await loadWorkerCredentials(engineId);
      email = fresh?.email?.trim() ?? "";
      password = fresh?.password ?? "";
    } catch (error) {
      const cookiesFile = getCookiesFile();
      if (!fs.existsSync(cookiesFile)) {
        throw new StepError(
          "credentials.missing",
          error instanceof Error ? error : new Error("Auction email or password is missing."),
        );
      }

      try {
        const cookies = JSON.parse(fs.readFileSync(cookiesFile, "utf8"));
        if (!Array.isArray(cookies) || cookies.length === 0) {
          throw new StepError(
            "credentials.missing",
            error instanceof Error ? error : new Error("Auction email or password is missing."),
          );
        }
      } catch (parseError) {
        if (parseError instanceof StepError) {
          throw parseError;
        }
        throw new StepError(
          "credentials.missing",
          error instanceof Error ? error : new Error("Auction email or password is missing."),
        );
      }
    }
  }

  if (!email || !password) {
    const cookiesFile = getCookiesFile();
    if (fs.existsSync(cookiesFile)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiesFile, "utf8"));
        if (Array.isArray(cookies) && cookies.length > 0) {
          return { email: "", password: "" };
        }
      } catch {
        // fall through to missing-credentials error
      }
    }

    throw new StepError(
      "credentials.missing",
      new Error("Auction email or password is missing."),
    );
  }

  return { email, password };
}

function resolveLegacyConfig(bundle, credentials) {
  const auctionUrl = getSourceUrl(bundle.sources, "vehicles");
  const loginUrl = getSourceUrl(bundle.sources, "login");
  const displayUrl = getSourceUrl(bundle.sources, "auction-display");

  if (!auctionUrl || !loginUrl || !displayUrl) {
    throw new StepError(
      "credentials.missing",
      new Error("Missing Broad Arrow URL configuration."),
    );
  }

  return {
    AUCTION_URL: auctionUrl,
    LOGIN_URL: loginUrl,
    AUCTIONS_DISPLAY_URL: displayUrl,
    AUCTION_EMAIL: credentials.email,
    AUCTION_PASSWORD: credentials.password,
    POLL_MS: bundle.settings?.poll_interval_ms ?? 2500,
    HEADLESS: bundle.settings?.headless !== false,
    DETAILS_TTL_MS: bundle.settings?.details_ttl_ms ?? 300000,
    MAX_DETAIL_CHECKS_PER_POLL: bundle.settings?.max_detail_checks_per_poll ?? 8,
    COOKIES_FILE: getCookiesFile(),
    configComparison: {
      loginUrlMatches: loginUrl === LEGACY_REFERENCE_URLS.login,
      auctionTableUrlMatches: auctionUrl === LEGACY_REFERENCE_URLS.auctionTable,
      auctionDisplayUrlMatches: displayUrl === LEGACY_REFERENCE_URLS.auctionDisplay,
    },
  };
}

export function createBagAuctionAdapter() {
  const engineId = process.env.ENGINE_ID ?? "";
  let runtime = null;
  let lastRunMetadata = null;
  let eventDrivenEngineStarted = false;

  async function ensureRuntime(bundle) {
    if (runtime) return runtime;

    const credentials = await resolveSecureCredentials(engineId);
    const legacyConfig = resolveLegacyConfig(bundle, credentials);

    await logBagDiagnostic(engineId, "legacy.runtime.version", "Broad Arrow runtime marker", {
      broadArrowRuntimeVersion: LEGACY_RUNTIME_VERSION,
    });

    await logBagDiagnostic(engineId, "legacy.config.loaded", "Legacy runtime configuration", {
      auctionUrlLoaded: Boolean(legacyConfig.AUCTION_URL),
      loginUrlLoaded: Boolean(legacyConfig.LOGIN_URL),
      auctionsDisplayUrlLoaded: Boolean(legacyConfig.AUCTIONS_DISPLAY_URL),
      auctionEmailLoaded: true,
      auctionPasswordLoaded: true,
      auctionPasswordLength: credentials.password.length,
      loginUrlMatches: legacyConfig.configComparison.loginUrlMatches,
      auctionTableUrlMatches: legacyConfig.configComparison.auctionTableUrlMatches,
      auctionDisplayUrlMatches: legacyConfig.configComparison.auctionDisplayUrlMatches,
    });

    const { puppeteer, runtimeInfo, referenceRuntimeInfo } = await loadBroadArrowPuppeteer();

    await logBagDiagnostic(engineId, "legacy.runtime.puppeteer", "Broad Arrow Puppeteer runtime", {
      broadArrowRuntimeVersion: LEGACY_RUNTIME_VERSION,
      puppeteerSource: runtimeInfo.puppeteerSource ?? null,
      puppeteerPackagePath: runtimeInfo.puppeteerPackagePath ?? null,
      puppeteerPackageVersion: runtimeInfo.puppeteerPackageVersion ?? null,
      workerPuppeteerPackagePath: runtimeInfo.workerPuppeteerPackagePath ?? null,
      workerPuppeteerPackageVersion: runtimeInfo.workerPuppeteerPackageVersion ?? null,
      referencePuppeteerPackagePath: runtimeInfo.referencePuppeteerPackagePath ?? null,
      referencePuppeteerPackageVersion: runtimeInfo.referencePuppeteerPackageVersion ?? null,
      referenceBrowserExecutable: runtimeInfo.referenceBrowserExecutable ?? null,
      referenceBrowserVersion: runtimeInfo.referenceBrowserVersion ?? null,
      browserExecutable: runtimeInfo.browserExecutable ?? null,
      browserSource: runtimeInfo.browserSource ?? null,
      legacyPuppeteerPackageMatch: runtimeInfo.legacyPuppeteerPackageMatch ?? null,
      legacyBrowserExecutableMatch: runtimeInfo.legacyBrowserExecutableMatch ?? null,
      ...(runtimeInfo.browserDiagnostics ?? {}),
    });

    runtime = createBagAuctionLegacyRuntime({
      engineId,
      config: legacyConfig,
      puppeteer,
      runtimeInfo,
      referenceRuntimeInfo,
      onLifecycleState: async (state) => {
        setLifecycleActualState(state);
        await updateEngineStatus(engineId, { actual_state: state });
      },
      logStage: async (stage, message, metadata = {}) => {
        await logBagDiagnostic(engineId, stage, message, {
          broadArrowRuntimeVersion: LEGACY_RUNTIME_VERSION,
          ...metadata,
        });
      },
      logStageError: async (stage, error, metadata = {}) => {
        const message = sanitizeError(error);
        await logBagDiagnosticError(
          engineId,
          stage,
          formatStageFailure(stage, message),
          {
            broadArrowRuntimeVersion: LEGACY_RUNTIME_VERSION,
            errorName: error instanceof Error ? error.name : "Error",
            pageUrl: metadata.pageUrl ?? null,
            ...metadata,
          },
        );
      },
    });

    return runtime;
  }

  return {
    async start(bundle) {
      const activeRuntime = await ensureRuntime(bundle);
      await activeRuntime.start();
    },

    async stop() {
      if (runtime?.stopEventDrivenLiveFeed) {
        await runtime.stopEventDrivenLiveFeed();
      }
      eventDrivenEngineStarted = false;
      if (runtime) {
        await runtime.stop();
        runtime = null;
      }
    },

    supportsEventDrivenLive(bundle) {
      return bagAdapterSupportsEventDrivenLive(bundle);
    },

    isEventDrivenLiveEnabled() {
      return isBagEventDrivenLiveEnabled();
    },

    getLiveFeedRuntimeState() {
      return runtime?.getLiveFeedRuntimeState?.() ?? null;
    },

    async startEventDrivenEngine(context) {
      if (eventDrivenEngineStarted) {
        return;
      }
      const { bundle, shouldContinue } = context;
      const activeRuntime = await ensureRuntime(bundle);
      eventDrivenEngineStarted = true;

      await activeRuntime.startEventDrivenLiveFeed({
        initialSettings: bundle.settings ?? {},
        shouldContinue,
        loadSettings: () => context.loadBundle().then((next) => next.settings ?? {}),
        onExecutionLog: async (message) => {
          await writeLog(engineId, "info", "engine.execution", message, {
            liveFeed: activeRuntime.getLiveFeedRuntimeState?.() ?? null,
          }).catch(() => {});
        },
        onActivityTransition: async (transition) => {
          await writeLog(
            engineId,
            "info",
            transition.type,
            `Live feed switched from ${transition.from} to ${transition.to}.`,
            { reason: transition.reason },
          ).catch(() => {});
        },
        onPersistLiveFeedMode: async (mode, reason) => {
          const { persistLiveFeedModeFailover } = await import("../local-client.js");
          await persistLiveFeedModeFailover(engineId, mode, reason);
        },
        onPublishSnapshot: async (cache, meta) => {
          const { buildRuntimeDiagnosticsFromCache } = await import("./bag-live-feed-utils.js");
          const liveFeed = meta?.liveFeed ?? activeRuntime.getLiveFeedRuntimeState?.() ?? null;
          const runtimeFields = buildRuntimeDiagnosticsFromCache(cache, liveFeed);
          lastRunMetadata = {
            ...(lastRunMetadata ?? {}),
            ...runtimeFields,
            liveFeed,
            liveTiming: meta?.liveTiming ?? null,
            runType: meta?.reason ?? "live_event",
            completedAt: new Date().toISOString(),
          };
          await publishBagLiveSnapshot({
            engineId,
            workerId: context.workerId,
            data: cache,
            meta: {
              durationMs: 0,
              liveFeed: lastRunMetadata.liveFeed,
              liveTiming: meta?.liveTiming ?? null,
            },
            writeSnapshot,
            recordRunSuccess,
            writeLog,
          });
          await writeHeartbeat(engineId, {
            workerId: context.workerId,
            workerVersion: context.workerVersion,
            pollIntervalMs: bundle.settings?.poll_interval_ms ?? 5000,
            actualState: "running",
            liveFeed: lastRunMetadata.liveFeed,
          }).catch(() => {});
        },
      });
    },

    async triggerEventDrivenManualRefresh(bundle, workerContext = {}) {
      const activeRuntime = await ensureRuntime(bundle);
      await activeRuntime.refreshCatalogOnly?.();
      const cache = activeRuntime.getCache();
      await publishBagLiveSnapshot({
        engineId,
        workerId: workerContext.workerId ?? null,
        data: cache,
        meta: {
          durationMs: 0,
          liveFeed: activeRuntime.getLiveFeedRuntimeState?.() ?? null,
        },
        writeSnapshot,
        recordRunSuccess,
        writeLog,
      });
      return cache;
    },

    async restart(bundle) {
      eventDrivenEngineStarted = false;
      await this.stop();
      await this.start(bundle);
    },

    async recoverBrowser() {
      await this.stop();
    },

    async scrapeOnce(bundle) {
      const startedAt = new Date().toISOString();
      const activeRuntime = await ensureRuntime(bundle);
      if (activeRuntime.isStopping?.()) {
        return activeRuntime.getCache();
      }

      const legacyConfig = resolveLegacyConfig(
        bundle,
        await resolveSecureCredentials(engineId),
      );

      await activeRuntime.scrapeOnce();
      if (activeRuntime.isStopping?.()) {
        return activeRuntime.getCache();
      }

      const cache = activeRuntime.getCache();
      const authInfo = activeRuntime.getAuthInfo();
      const stats = activeRuntime.getLastScrapeStats() ?? {};
      const runtimeMatch = activeRuntime.getRuntimeMatchInfo?.() ?? {};
      const submitDiagnostics = activeRuntime.getLoginSubmitDiagnostics?.() ?? null;
      const completedAt = new Date().toISOString();

      if (activeRuntime.isStopping?.()) {
        return cache;
      }

      lastRunMetadata = {
        startedAt,
        completedAt,
        durationMs: null,
        listingRowCount: stats.listingRowCount ?? cache.lots?.length ?? 0,
        listingUrl: legacyConfig.AUCTION_URL,
        auctionDisplayUrl: legacyConfig.AUCTIONS_DISPLAY_URL,
        detailChecksAttempted: stats.detailChecksAttempted ?? 0,
        detailChecksSucceeded: stats.detailChecksSucceeded ?? 0,
        pollTiming: stats.pollTiming ?? null,
        detailCheckFailures: Math.max(
          0,
          (stats.detailChecksAttempted ?? 0) - (stats.detailChecksSucceeded ?? 0),
        ),
        auctionDisplayStatus: stats.auctionDisplayFound ? "OK" : cache.auctionDisplay ? "Retained" : "Unavailable",
        authenticationStatus: authInfo.authenticationStatus,
        cookieStatus: authInfo.cookieStatus,
        currentSession: authInfo.currentSession,
        currentActiveLot: stats.currentLot ?? cache.current?.lot ?? null,
        previousLot: stats.previousLot ?? cache.prev?.lot ?? null,
        nextLots: stats.nextLots ?? cache.next?.map((lot) => lot.lot).filter(Boolean) ?? [],
        lastSoldLot: stats.lastSoldLot ?? cache.lastSold?.lot ?? null,
        broadArrowRuntimeVersion: LEGACY_RUNTIME_VERSION,
        auctionTableFound: stats.auctionTableFound ?? null,
        loginRouteRemaining: stats.loginRouteRemaining ?? null,
        auctionDisplayFound: stats.auctionDisplayFound ?? null,
        puppeteerSource: runtimeMatch.puppeteerSource ?? null,
        puppeteerPackagePath: runtimeMatch.puppeteerPackagePath ?? null,
        puppeteerPackageVersion: runtimeMatch.puppeteerPackageVersion ?? null,
        browserExecutable: runtimeMatch.browserExecutable ?? null,
        browserProcessExecutable: runtimeMatch.browserProcessExecutable ?? null,
        browserVersion: runtimeMatch.browserVersion ?? null,
        legacyPuppeteerPackageMatch: runtimeMatch.legacyPuppeteerPackageMatch ?? null,
        legacyBrowserExecutableMatch: runtimeMatch.legacyBrowserExecutableMatch ?? null,
        legacyBrowserVersionMatch: runtimeMatch.legacyBrowserVersionMatch ?? null,
        submitCompatibilityFallbackUsed:
          submitDiagnostics?.submitCompatibilityFallbackUsed ?? null,
        submitClickTimedOut: submitDiagnostics?.submitClickTimedOut ?? null,
        submitClickDurationMs: submitDiagnostics?.submitClickDurationMs ?? null,
        runType: bundle.pendingRunOnce ? "run_once" : "automatic",
        error: null,
      };

      await logBagDiagnostic(engineId, "legacy.scrape.publish", "Publishing snapshot", {
        broadArrowRuntimeVersion: LEGACY_RUNTIME_VERSION,
        auctionTableUrlReached: stats.auctionTableFound === true,
        loginRouteRemaining: stats.loginRouteRemaining === true,
        auctionTableFound: stats.auctionTableFound === true,
        vehicleRowsFound: stats.listingRowCount ?? cache.lots?.length ?? 0,
        auctionDisplayPageFound: stats.auctionDisplayFound === true,
        snapshotPublished: true,
        puppeteerPackagePath: runtimeMatch.puppeteerPackagePath ?? null,
        puppeteerPackageVersion: runtimeMatch.puppeteerPackageVersion ?? null,
        browserExecutable: runtimeMatch.browserExecutable ?? null,
        browserProcessExecutable: runtimeMatch.browserProcessExecutable ?? null,
        browserVersion: runtimeMatch.browserVersion ?? null,
        legacyPuppeteerPackageMatch: runtimeMatch.legacyPuppeteerPackageMatch ?? null,
        legacyBrowserExecutableMatch: runtimeMatch.legacyBrowserExecutableMatch ?? null,
        legacyBrowserVersionMatch: runtimeMatch.legacyBrowserVersionMatch ?? null,
        submitCompatibilityFallbackUsed:
          submitDiagnostics?.submitCompatibilityFallbackUsed ?? null,
      });

      return cache;
    },

    getLastRunMetadata() {
      return lastRunMetadata;
    },

    async exportLotDetails(bundle, tasks, options = {}) {
      const activeRuntime = await ensureRuntime(bundle);
      if (typeof activeRuntime.exportLotDetails !== "function") {
        throw new Error("Export is unavailable for this adapter.");
      }
      return activeRuntime.exportLotDetails(tasks, options);
    },
  };
}
