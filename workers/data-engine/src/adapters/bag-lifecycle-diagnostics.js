/** Broad Arrow worker lifecycle counters (diagnostic only). */

const state = {
  browserLaunchCount: 0,
  livePageCreateCount: 0,
  livePageNavigationCount: 0,
  fayeObserverInstallCount: 0,
  eventDrivenSessionStartCount: 0,
  stopRequestedAt: null,
  backgroundSchedulerStoppedAt: null,
  liveBridgeStoppedAt: null,
  browserClosedAt: null,
  sessionDisposedAt: null,
  engineStoppedAt: null,
  gracefulStopDurationMs: null,
  orphanResourcesDetected: false,
  backgroundStartTimestamps: [],
};

export function resetBagLifecycleDiagnostics() {
  state.browserLaunchCount = 0;
  state.livePageCreateCount = 0;
  state.livePageNavigationCount = 0;
  state.fayeObserverInstallCount = 0;
  state.eventDrivenSessionStartCount = 0;
  state.stopRequestedAt = null;
  state.backgroundSchedulerStoppedAt = null;
  state.liveBridgeStoppedAt = null;
  state.browserClosedAt = null;
  state.sessionDisposedAt = null;
  state.engineStoppedAt = null;
  state.gracefulStopDurationMs = null;
  state.orphanResourcesDetected = false;
  state.backgroundStartTimestamps = [];
}

export function markBrowserLaunched() {
  state.browserLaunchCount += 1;
}

export function markLivePageCreated() {
  state.livePageCreateCount += 1;
}

export function markLivePageNavigation() {
  state.livePageNavigationCount += 1;
}

export function markFayeObserverInstalled() {
  state.fayeObserverInstallCount += 1;
}

export function markEventDrivenSessionStarted() {
  state.eventDrivenSessionStartCount += 1;
}

export function markBackgroundRefreshStarted(at = Date.now()) {
  state.backgroundStartTimestamps.push(at);
  if (state.backgroundStartTimestamps.length > 50) {
    state.backgroundStartTimestamps.shift();
  }
}

export function beginGracefulStop() {
  if (!state.stopRequestedAt) {
    state.stopRequestedAt = new Date().toISOString();
  }
}

export function markBackgroundSchedulerStopped() {
  if (!state.backgroundSchedulerStoppedAt) {
    state.backgroundSchedulerStoppedAt = new Date().toISOString();
  }
}

export function markLiveBridgeStopped() {
  if (!state.liveBridgeStoppedAt) {
    state.liveBridgeStoppedAt = new Date().toISOString();
  }
}

export function markBrowserClosed() {
  if (!state.browserClosedAt) {
    state.browserClosedAt = new Date().toISOString();
  }
}

export function markSessionDisposed() {
  if (!state.sessionDisposedAt) {
    state.sessionDisposedAt = new Date().toISOString();
  }
}

export function markEngineStopped() {
  if (!state.engineStoppedAt) {
    state.engineStoppedAt = new Date().toISOString();
  }
  if (state.stopRequestedAt && !state.gracefulStopDurationMs) {
    state.gracefulStopDurationMs =
      Date.parse(state.engineStoppedAt) - Date.parse(state.stopRequestedAt);
  }
}

export function markOrphanResourcesDetected(value = true) {
  state.orphanResourcesDetected = value;
}

export function getBagLifecycleDiagnostics() {
  const starts = state.backgroundStartTimestamps;
  const intervals = [];
  for (let index = 1; index < starts.length; index += 1) {
    intervals.push(starts[index] - starts[index - 1]);
  }
  return {
    ...state,
    backgroundActualStartIntervalsMs: intervals,
  };
}

export function createAbortableSleep() {
  const waiters = new Set();
  return {
    sleep(ms, shouldContinue) {
      return new Promise((resolve) => {
        if (ms <= 0 || (typeof shouldContinue === "function" && !shouldContinue())) {
          resolve();
          return;
        }
        const startedAt = Date.now();
        let timer = null;
        const finish = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (typeof shouldContinue === "function" && !shouldContinue()) {
            finish();
            return;
          }
          if (Date.now() - startedAt >= ms) {
            finish();
            return;
          }
          timer = setTimeout(tick, Math.min(200, ms));
        };
        timer = setTimeout(tick, Math.min(200, ms));
      });
    },
    abort() {
      for (const finish of [...waiters]) {
        finish();
      }
    },
  };
}
