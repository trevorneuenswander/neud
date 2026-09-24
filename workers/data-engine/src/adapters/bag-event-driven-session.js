import {
  applyLiveEventToCache,
  buildLiveFingerprint,
  createInitialLiveFeedRuntimeState,
  recordLatencySample,
  resolveBackgroundRefreshIntervalMs,
  resolveLegacyLivePollIntervalMs,
  normalizeLiveFeedModePreference,
  formatLiveFeedModePreferenceLabel,
} from "./bag-live-feed-utils.js";
import { installLiveFeedBridgeOnPage } from "./bag-live-feed-bridge.js";
import {
  createAbortableSleep,
  markBackgroundRefreshStarted,
  markBackgroundSchedulerStopped,
  markFayeObserverInstalled,
  markLiveBridgeStopped,
  markSessionDisposed,
} from "./bag-lifecycle-diagnostics.js";

const FAYE_SILENCE_MS = 120_000;
const FAYE_UNHEALTHY_MS = 45_000;
const RECOVERY_STABLE_MS = 20_000;
const MODE_STABILIZATION_MS = 15_000;

export function createBagEventDrivenSession(options) {
  const {
    engineId,
    getCache,
    setCache,
    getAuctionPage,
    ensureBidDisplayPersistent,
    refreshCatalog,
    runLegacyFullScrape,
    queuePreviousLotSoldCheck,
    queueReserveForCurrentLot,
    onPublishSnapshot,
    onExecutionLog,
    onActivityTransition,
    onPersistLiveFeedMode,
    loadSettings,
    shouldContinue,
  } = options;

  let state = createInitialLiveFeedRuntimeState();
  let lastFingerprint = null;
  let lastModeChangeAt = 0;
  let healthTimer = null;
  let backgroundInFlight = false;
  let legacyInFlight = false;
  let nextBackgroundStartAt = null;
  let nextLegacyStartAt = null;
  let started = false;
  let bridgeInstalled = false;
  let acceptLiveEvents = false;
  let backgroundLoopPromise = null;
  let legacyLoopPromise = null;
  const backgroundWait = createAbortableSleep();
  const legacyWait = createAbortableSleep();

  function updateState(patch) {
    state = { ...state, ...patch };
  }

  function logExecution(message) {
    onExecutionLog?.(message);
  }

  function getOperatorMode() {
    return normalizeLiveFeedModePreference(state.liveFeedModePreference ?? "faye");
  }

  function persistModeDowngrade(nextMode, reason) {
    updateState({ liveFeedModePreference: nextMode });
    setActiveSource(
      nextMode,
      nextMode === "legacy" ? "offline" : nextMode === "dom" ? "degraded" : "healthy",
    );
    lastModeChangeAt = Date.now();
    void onPersistLiveFeedMode?.(nextMode, reason);
  }

  function setActiveSource(source, health = "healthy") {
    updateState({
      liveFeedActiveSource: source,
      liveFeedMode: source,
      liveFeedHealth: health,
      domObserverActive: source === "dom",
      legacyPollingActive: source === "legacy",
    });
  }

  function applyOperatorModePreference(preference, reason = "settings") {
    const nextPreference = normalizeLiveFeedModePreference(preference);
    const previousPreference = getOperatorMode();
    if (nextPreference === previousPreference && reason !== "startup") {
      return;
    }
    updateState({ liveFeedModePreference: nextPreference });
    if (reason === "manual") {
      logExecution(
        `Live feed mode set to ${formatLiveFeedModePreferenceLabel(nextPreference)}`,
      );
    }

    if (nextPreference === "legacy") {
      setActiveSource("legacy", "offline");
      logExecution("Live feed source: Legacy Polling");
      return;
    }

    if (nextPreference === "dom") {
      setActiveSource("dom", state.fayeObserverInstalled ? "degraded" : "recovering");
      logExecution("Live feed source: DOM");
      return;
    }

    if (nextPreference === "faye") {
      const health = state.fayeObserverInstalled ? "healthy" : "recovering";
      setActiveSource("faye", health);
      logExecution("Live feed source: Faye");
      return;
    }

  }

  async function publishIfChanged(event, timing) {
    if (!acceptLiveEvents || !started) {
      return;
    }
    const workerReceivedAt = Date.now();
    const fingerprint = buildLiveFingerprint(event);
    if (fingerprint === lastFingerprint) {
      return;
    }
    lastFingerprint = fingerprint;

    const cache = applyLiveEventToCache(getCache(), event);
    if (Array.isArray(cache.lots) && cache.lots.length > 0) {
      updateState({
        catalog: {
          ...state.catalog,
          cachedLotCount: cache.lots.length,
        },
      });
    }
    setCache(cache);

    const canonicalUpdatedAt = Date.now();
    await onPublishSnapshot(cache, {
      liveFeed: getPublicRuntimeState(),
      liveTiming: {
        vendorMessageObservedAt: event?.receivedAt ?? workerReceivedAt,
        workerReceivedAt,
        canonicalUpdatedAt,
      },
    });

    const totalMs = canonicalUpdatedAt - (event?.receivedAt ?? workerReceivedAt);
    updateState(
      recordLatencySample(
        {
          ...state,
          lastLiveUpdateAt: new Date(canonicalUpdatedAt).toISOString(),
          lastLiveChangeAt: new Date(canonicalUpdatedAt).toISOString(),
        },
        totalMs,
      ),
    );
  }

  async function handleLiveEvent(event) {
    if (!acceptLiveEvents || !started) {
      return;
    }
    if (!event || typeof event !== "object") {
      return;
    }
    if (event.eventType === "bridge_ready") {
      updateState({
        fayeObserverInstalled: true,
        fayeConnectionHealthy: true,
      });
      if (getOperatorMode() === "faye") {
        setActiveSource("faye", "healthy");
      }
      return;
    }

    const source = String(event.source ?? "faye");
    if (source === "faye") {
      updateState({
        lastFayeApplicationEventAt: new Date().toISOString(),
        fayeConnectionHealthy: true,
        activeVehicleSubscriptionPresent: true,
      });
    }

    if (event.eventType === "change_car") {
      const priorCurrent = getCache()?.current ?? null;
      void queuePreviousLotSoldCheck(priorCurrent);
      void queueReserveForCurrentLot(event);
    }

    const operatorMode = getOperatorMode();

    if (operatorMode === "legacy") {
      return;
    }

    if (operatorMode === "dom") {
      if (source !== "dom") {
        return;
      }
      await publishIfChanged(event);
      return;
    }

    if (source !== "faye") {
      return;
    }

    await publishIfChanged(event);
  }

  function fallbackToDom(reason) {
    const now = Date.now();
    if (getOperatorMode() !== "faye") {
      return;
    }
    if (now - lastModeChangeAt < MODE_STABILIZATION_MS) {
      return;
    }
    updateState({
      fallbackCount: state.fallbackCount + 1,
      lastFallbackReason: reason,
    });
    persistModeDowngrade("dom", reason);
    logExecution("Faye live feed unavailable; switched to DOM");
    onActivityTransition?.({
      type: "scraper.live_feed_fallback",
      from: "faye",
      to: "dom",
      reason,
    });
  }

  function fallbackToLegacy(reason) {
    const now = Date.now();
    if (getOperatorMode() !== "dom") {
      return;
    }
    if (now - lastModeChangeAt < MODE_STABILIZATION_MS) {
      return;
    }
    updateState({
      fallbackCount: state.fallbackCount + 1,
      lastFallbackReason: reason,
    });
    persistModeDowngrade("legacy", reason);
    logExecution("DOM live feed unavailable; switched to Legacy Polling");
    onActivityTransition?.({
      type: "scraper.live_feed_fallback",
      from: "dom",
      to: "legacy",
      reason,
    });
  }

  async function installBridgeIfNeeded() {
    if (bridgeInstalled) {
      return;
    }
    const page = getAuctionPage();
    if (!page) {
      throw new Error("Auction display page is not available.");
    }
    await installLiveFeedBridgeOnPage(page, handleLiveEvent);
    bridgeInstalled = true;
    markFayeObserverInstalled();
    updateState({
      fayeObserverInstalled: true,
      domObserverInstalled: true,
    });
    logExecution("Faye live feed connected");
  }

  async function runBackgroundCycle() {
    if (backgroundInFlight || !shouldContinue() || !started) {
      return;
    }
    backgroundInFlight = true;
    markBackgroundRefreshStarted();
    const startedAt = Date.now();
    updateState({
      background: {
        ...state.background,
        actualStartAt: new Date(startedAt).toISOString(),
      },
    });
    try {
      await refreshCatalog();
      const cache = getCache();
      updateState({
        catalog: {
          ...state.catalog,
          cachedLotCount: Array.isArray(cache.lots) ? cache.lots.length : 0,
        },
        background: {
          ...state.background,
          lastRunDurationMs: Date.now() - startedAt,
          lastRunAt: new Date().toISOString(),
        },
      });
      logExecution("Background refresh completed");
    } catch (error) {
      logExecution(
        `Background refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      backgroundInFlight = false;
    }
  }

  async function runLegacyCycle() {
    if (legacyInFlight || !shouldContinue()) {
      return;
    }
    legacyInFlight = true;
    try {
      await runLegacyFullScrape();
      await onPublishSnapshot(getCache(), { liveFeed: getPublicRuntimeState(), legacy: true });
    } finally {
      legacyInFlight = false;
    }
  }

  async function backgroundSchedulerLoop() {
    nextBackgroundStartAt = Date.now();
    while (started && shouldContinue()) {
      const settings = await loadSettings();
      const settingsMode = normalizeLiveFeedModePreference(settings?.live_feed_mode ?? "faye");
      if (settingsMode !== getOperatorMode()) {
        applyOperatorModePreference(settingsMode, "settings");
      }
      const intervalMs = resolveBackgroundRefreshIntervalMs(settings);
      const now = Date.now();
      if (nextBackgroundStartAt == null) {
        nextBackgroundStartAt = now;
      }
      const waitMs = Math.max(0, nextBackgroundStartAt - now);
      if (waitMs > 0) {
        await backgroundWait.sleep(waitMs, () => started && shouldContinue());
      }
      if (!started || !shouldContinue()) {
        break;
      }
      if (getOperatorMode() === "legacy") {
        await backgroundWait.sleep(500, () => started && shouldContinue());
        continue;
      }
      if (backgroundInFlight) {
        updateState({
          background: {
            ...state.background,
            missedIntervals: (state.background.missedIntervals ?? 0) + 1,
          },
        });
        nextBackgroundStartAt = Date.now() + intervalMs;
        continue;
      }
      const cycleStartedAt = Date.now();
      await runBackgroundCycle();
      nextBackgroundStartAt = cycleStartedAt + intervalMs;
      updateState({
        background: {
          ...state.background,
          intervalMs,
          scheduledStartAt: new Date(cycleStartedAt).toISOString(),
        },
      });
    }
  }

  async function legacySchedulerLoop() {
    nextLegacyStartAt = Date.now();
    while (started && shouldContinue()) {
      if ((state.liveFeedActiveSource ?? state.liveFeedMode) !== "legacy") {
        await legacyWait.sleep(500, () => started && shouldContinue());
        continue;
      }
      const settings = await loadSettings();
      const intervalMs = resolveLegacyLivePollIntervalMs(settings);
      const now = Date.now();
      const waitMs = Math.max(0, (nextLegacyStartAt ?? now) - now);
      if (waitMs > 0) {
        await legacyWait.sleep(waitMs, () => started && shouldContinue());
      }
      if (
        !started ||
        !shouldContinue() ||
        (state.liveFeedActiveSource ?? state.liveFeedMode) !== "legacy"
      ) {
        continue;
      }
      if (legacyInFlight) {
        nextLegacyStartAt = Date.now() + intervalMs;
        continue;
      }
      const cycleStartedAt = Date.now();
      await runLegacyCycle();
      nextLegacyStartAt = cycleStartedAt + intervalMs;
    }
  }

  function startSchedulers() {
    backgroundLoopPromise = backgroundSchedulerLoop();
    legacyLoopPromise = legacySchedulerLoop();
  }

  function startHealthMonitor() {
    if (healthTimer) {
      clearInterval(healthTimer);
    }
    healthTimer = setInterval(() => {
      if (!shouldContinue()) {
        return;
      }
      const now = Date.now();
      const lastFaye = state.lastFayeApplicationEventAt
        ? Date.parse(state.lastFayeApplicationEventAt)
        : null;
      const lastTransport = state.lastFayeTransportActivityAt
        ? Date.parse(state.lastFayeTransportActivityAt)
        : null;

      if (getOperatorMode() === "faye") {
        const lastSignal = Math.max(lastFaye ?? 0, lastTransport ?? 0, lastModeChangeAt);
        if (lastSignal && now - lastSignal > FAYE_UNHEALTHY_MS && !bridgeInstalled) {
          fallbackToDom("bridge not installed");
        } else if (!state.fayeObserverInstalled || !state.fayeConnectionHealthy) {
          if (lastSignal && now - lastSignal > FAYE_UNHEALTHY_MS) {
            fallbackToDom("faye unhealthy");
          } else {
            updateState({ liveFeedHealth: "offline" });
          }
        }
      }

      if (getOperatorMode() === "dom") {
        const lastDom = state.lastLiveChangeAt ? Date.parse(state.lastLiveChangeAt) : null;
        if (lastDom && now - lastDom > FAYE_SILENCE_MS * 2) {
          fallbackToLegacy("dom observer idle");
        }
      }

      if (getOperatorMode() === "legacy") {
        updateState({ liveFeedHealth: "offline" });
      }
    }, 2000);
  }

  function getPublicRuntimeState() {
    const activeSource = state.liveFeedActiveSource ?? state.liveFeedMode ?? "faye";
    return {
      liveFeedModePreference: getOperatorMode(),
      liveFeedActiveSource: activeSource,
      liveFeedMode: activeSource,
      liveFeedHealth: state.liveFeedHealth,
      lastLiveUpdateAt: state.lastLiveUpdateAt,
      lastLiveChangeAt: state.lastLiveChangeAt,
      liveDataLatencyMs: state.liveDataLatencyMs,
      fayeConnected: state.fayeConnectionHealthy,
      domObserverActive: state.domObserverActive,
      legacyPollingActive: state.legacyPollingActive,
      fayeObserverInstalled: state.fayeObserverInstalled,
      fayeConnectionHealthy: state.fayeConnectionHealthy,
      domObserverInstalled: state.domObserverInstalled,
      lastFayeApplicationEventAt: state.lastFayeApplicationEventAt,
      latency: state.latency,
      background: state.background,
      catalog: state.catalog,
      sold: state.sold,
      fallbackCount: state.fallbackCount,
      recoveryCount: state.recoveryCount,
      lastFallbackReason: state.lastFallbackReason,
    };
  }

  return {
    async start(initialSettings) {
      if (started) {
        return;
      }
      started = true;
      applyOperatorModePreference(initialSettings?.live_feed_mode ?? "faye", "startup");
      updateState({
        background: {
          ...state.background,
          intervalMs: resolveBackgroundRefreshIntervalMs(initialSettings),
        },
        liveFeedHealth: "recovering",
      });

      try {
        await installBridgeIfNeeded();
        await ensureBidDisplayPersistent();
        updateState({
          fayeConnectionHealthy: true,
        });
        applyOperatorModePreference(initialSettings?.live_feed_mode ?? "faye", "startup");
      } catch (error) {
        if (getOperatorMode() === "faye") {
          fallbackToDom(error instanceof Error ? error.message : "bridge install failed");
        } else {
          updateState({
            liveFeedHealth: "offline",
            lastFallbackReason:
              error instanceof Error ? error.message : "bridge install failed",
          });
        }
      }

      acceptLiveEvents = true;
      if (getOperatorMode() !== "legacy") {
        await runBackgroundCycle();
      }
      startSchedulers();
      startHealthMonitor();
    },

    async stop() {
      acceptLiveEvents = false;
      started = false;
      backgroundWait.abort();
      legacyWait.abort();
      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }
      markBackgroundSchedulerStopped();
      markLiveBridgeStopped();
      await Promise.race([
        Promise.allSettled([backgroundLoopPromise, legacyLoopPromise]),
        new Promise((resolve) => {
          setTimeout(resolve, 1500);
        }),
      ]);
      backgroundLoopPromise = null;
      legacyLoopPromise = null;
      bridgeInstalled = false;
      markSessionDisposed();
    },

    getRuntimeState: () => getPublicRuntimeState(),

    handleLiveEvent,
  };
}
