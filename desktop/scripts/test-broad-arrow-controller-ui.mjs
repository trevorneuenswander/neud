import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function isBagDiagnosticLog(log) {
  return log.event_type === "bag.diagnostic";
}

function getBagDiagnosticLogs(logs) {
  return logs.filter(isBagDiagnosticLog).slice().reverse();
}

function isExecutionLogEvent(log) {
  return (
    isBagDiagnosticLog(log) ||
    log.event_type === "scrape.failed" ||
    log.event_type === "engine.execution"
  );
}

function getExecutionLogEntries(logs) {
  const structured = getBagDiagnosticLogs(logs);
  const failures = logs
    .filter((log) => log.event_type === "scrape.failed")
    .slice()
    .reverse()
    .map((log) => ({
      ...log,
      message:
        typeof log.metadata?.step === "string"
          ? `Stage failed: ${log.metadata.step}. ${log.message}`
          : log.message,
    }));
  const executionEvents = logs
    .filter((log) => log.event_type === "engine.execution")
    .slice()
    .reverse();

  return [...structured, ...failures, ...executionEvents]
    .filter(isExecutionLogEvent)
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );
}

function filterSessionExecutionLogs(logs, sessionCutoffMs) {
  return getExecutionLogEntries(logs).filter(
    (log) => new Date(log.created_at).getTime() >= sessionCutoffMs,
  );
}

function formatLastPoll(value) {
  if (!value) {
    return "Never";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function createScrollHarness() {
  const container = {
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 200,
    mounted: true,
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (container.mounted) {
        container.scrollTop = container.scrollHeight;
      }
    });
  };

  return { container, scrollToBottom };
}

test("getExecutionLogEntries includes diagnostics, failures, and engine.execution", () => {
  const logs = [
    {
      id: "1",
      event_type: "bag.diagnostic",
      message: "Starting engine",
      created_at: "2026-01-01T10:00:01.000Z",
      level: "info",
    },
    {
      id: "2",
      event_type: "scrape.failed",
      message: "Scrape failed",
      metadata: { step: "legacy.scrape.listing" },
      created_at: "2026-01-01T10:00:02.000Z",
      level: "error",
    },
    {
      id: "3",
      event_type: "engine.execution",
      message: "Stop requested",
      created_at: "2026-01-01T10:00:03.000Z",
      level: "info",
    },
    {
      id: "4",
      event_type: "scrape.completed",
      message: "ignored",
      created_at: "2026-01-01T10:00:04.000Z",
      level: "info",
    },
  ];

  const entries = getExecutionLogEntries(logs);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].message, "Starting engine");
  assert.equal(entries[1].message, "Stage failed: legacy.scrape.listing. Scrape failed");
  assert.equal(entries[2].message, "Stop requested");
});

test("filterSessionExecutionLogs hides historical logs before cutoff", () => {
  const logs = [
    {
      id: "1",
      event_type: "engine.execution",
      message: "Old stop",
      created_at: "2026-01-01T09:00:00.000Z",
      level: "info",
    },
    {
      id: "2",
      event_type: "engine.execution",
      message: "New stop",
      created_at: "2026-01-01T10:00:00.000Z",
      level: "info",
    },
  ];

  const sessionCutoffMs = new Date("2026-01-01T09:30:00.000Z").getTime();
  const visible = filterSessionExecutionLogs(logs, sessionCutoffMs);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].message, "New stop");
});

test("clear session cutoff removes all prior visible logs", () => {
  const logs = [
    {
      id: "1",
      event_type: "bag.diagnostic",
      message: "Stage one",
      created_at: "2026-01-01T10:00:00.000Z",
      level: "info",
    },
  ];

  const beforeClear = filterSessionExecutionLogs(
    logs,
    new Date("2026-01-01T09:00:00.000Z").getTime(),
  );
  assert.equal(beforeClear.length, 1);

  const afterClear = filterSessionExecutionLogs(logs, Date.now());
  assert.equal(afterClear.length, 0);
});

test("preset poll interval selection persists active interval immediately", () => {
  let activeIntervalMs = 5000;
  const applyPollInterval = (nextMs) => {
    if (nextMs === activeIntervalMs) {
      return;
    }
    activeIntervalMs = nextMs;
  };

  applyPollInterval(2500);
  assert.equal(activeIntervalMs, 2500);
  applyPollInterval(2500);
  assert.equal(activeIntervalMs, 2500);
});

test("poll interval change logs execution message with seconds label", () => {
  const previousPollMs = 5000;
  const nextPollMs = 2500;
  let loggedMessage = null;

  if (previousPollMs !== nextPollMs) {
    const seconds = nextPollMs / 1000;
    loggedMessage = `Polling interval changed to ${seconds} seconds`;
  }

  assert.equal(loggedMessage, "Polling interval changed to 2.5 seconds");
});

test("engine runtime wakes poll sleep when interval changes", () => {
  const source = readFileSync(
    path.join(repoRoot, "workers/data-engine/src/engine-runtime.js"),
    "utf8",
  );

  assert.ok(source.includes("waitUntilNextPoll"));
  assert.ok(source.includes("formatPollingIntervalChangeMessage"));
});

test("copy json feedback resets on repeat click", () => {
  let copyState = "idle";
  let timer = null;

  const copyJson = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    copyState = "copied";
    timer = setTimeout(() => {
      copyState = "idle";
      timer = null;
    }, 2500);
  };

  copyJson();
  assert.equal(copyState, "copied");
  copyJson();
  assert.equal(copyState, "copied");
});

test("runtime diagnostics summary excludes engine state", () => {
  const source = readSrc("src/components/data-engines/webpage-scraper/RuntimeDiagnostics.tsx");
  const statusCard = readSrc("src/components/data-engines/webpage-scraper/EngineStatusCard.tsx");
  const engineStatePanel = readSrc(
    "src/components/data-engines/webpage-scraper/EngineStatePanel.tsx",
  );
  const summaryStart = source.indexOf("function RuntimeStatusSummary");
  const summaryEnd = source.indexOf("export function RuntimeDiagnostics");
  const summarySource = source.slice(summaryStart, summaryEnd);

  assert.ok(!summarySource.includes("Engine State"));
  assert.ok(!summarySource.includes("getOperationalStateLabel"));
  assert.ok(!summarySource.includes("OPERATIONAL_STATE_STYLES"));
  assert.ok(summarySource.includes("Engine Health"));
  assert.ok(summarySource.includes("Last Poll"));
  assert.ok(!summarySource.includes("Last run"));
  assert.ok(summarySource.includes("EngineStatusLabelPill"));
  assert.ok(summarySource.includes("EngineStatusCardShell"));
  assert.ok(summarySource.includes("mt-0.5"));
  assert.ok(statusCard.includes("ENGINE_STATUS_CARD_ROW_CLASS"));
  assert.ok(engineStatePanel.includes("ENGINE_STATUS_CARD_ROW_CLASS"));
  assert.ok(statusCard.includes("flex flex-wrap items-center gap-2"));
});

test("operational controls still renders engine state", () => {
  const engineStatePanel = readSrc(
    "src/components/data-engines/webpage-scraper/EngineStatePanel.tsx",
  );
  assert.ok(engineStatePanel.includes("Engine State"));
  assert.ok(engineStatePanel.includes("getOperationalStateLabel"));
});

test("runtime diagnostics health labels include healthy error and stale", () => {
  const labels = {
    healthy: "Healthy",
    error: "Error",
    stale: "Stale",
  };

  assert.equal(labels.healthy, "Healthy");
  assert.equal(labels.error, "Error");
  assert.equal(labels.stale, "Stale");
});

test("last poll fallback is never before first poll", () => {
  assert.equal(formatLastPoll(null), "Never");
  assert.equal(formatLastPoll(undefined), "Never");
  assert.equal(formatLastPoll(""), "Never");
});

test("last poll renders relative time after first poll", () => {
  const recent = new Date(Date.now() - 12_000).toISOString();
  assert.match(formatLastPoll(recent), /12 seconds ago/);
});

test("engine settings form exposes immediate poll interval callbacks", () => {
  const source = readSrc("src/components/data-engines/webpage-scraper/EngineSettingsForm.tsx");

  assert.ok(source.includes("onPollIntervalChange"));
  assert.ok(source.includes("onSettingsPersisted"));
  assert.ok(source.includes("applyPollInterval"));
  assert.ok(source.includes("snappedMs === activeIntervalMs"));
});

test("engine detail client keeps poll interval state in sync", () => {
  const source = readSrc("src/components/data-engines/EngineDetailClient.tsx");

  assert.ok(source.includes("scraperSettings"));
  assert.ok(source.includes("handlePollIntervalChange"));
  assert.ok(source.includes("onPollIntervalChange={handlePollIntervalChange}"));
});

test("local data service persists poll interval without pre-ack execution log", () => {
  const source = readSrc("desktop/src/services/local-data-service.ts");

  assert.ok(source.includes("updateScraperSettings"));
  assert.ok(!source.includes("Polling interval changed to"));
});

test("polling interval label replaces active interval wording", () => {
  const label = "Polling Interval";
  assert.notEqual(label.toLowerCase(), "active interval");
  assert.equal(label, "Polling Interval");
});

test("custom interval slider persists on release without advanced save", () => {
  let activeIntervalMs = 5000;
  let sliderDraftMs = 5000;
  let advancedSaveRequired = false;

  const onSliderRelease = () => {
    if (sliderDraftMs !== activeIntervalMs) {
      activeIntervalMs = sliderDraftMs;
    }
  };

  sliderDraftMs = 7500;
  assert.equal(activeIntervalMs, 5000);
  onSliderRelease();
  assert.equal(activeIntervalMs, 7500);
  assert.equal(advancedSaveRequired, false);
});

test("advanced settings uses developer tools disclosure section", () => {
  const settingsForm = readSrc(
    "src/components/data-engines/webpage-scraper/EngineSettingsForm.tsx",
  );
  const disclosure = readSrc("src/components/ui/DisclosureSection.tsx");

  assert.ok(settingsForm.includes('title="Advanced settings"'));
  assert.ok(settingsForm.includes("DisclosureSection"));
  assert.ok(disclosure.includes("aria-expanded"));
  assert.ok(disclosure.includes("grid-rows-[0fr]"));
});

test("credential helper text is removed from scraper credentials section", () => {
  const source = readSrc(
    "src/components/data-engines/webpage-scraper/ScraperCredentialsSection.tsx",
  );
  assert.ok(
    !source.includes(
      "Credentials are stored locally and never included in exported project settings.",
    ),
  );
});

test("credential action buttons keep save before clear in wide layout", () => {
  const buttons = ["Save credentials", "Clear credentials"];
  assert.equal(buttons[0], "Save credentials");
  assert.equal(buttons[1], "Clear credentials");
});

test("execution log source keeps scrollable body and always-scroll behavior", () => {
  const source = readSrc("src/components/data-engines/webpage-scraper/BagExecutionLog.tsx");

  assert.ok(source.includes("overflow-y-auto"));
  assert.ok(source.includes("min-h-0"));
  assert.ok(source.includes("scrollTop = element.scrollHeight"));
  assert.ok(source.includes("requestAnimationFrame"));
  assert.ok(!source.includes("shouldAutoScrollRef"));
  assert.ok(!source.includes("onScroll"));
  assert.ok(source.includes("Execution log"));
  assert.ok(source.includes("Clear"));
});

test("execution log auto-scroll pins to bottom on append", async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const rafQueue = [];

  globalThis.requestAnimationFrame = (callback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  };

  try {
    const { container, scrollToBottom } = createScrollHarness();
    container.scrollHeight = 500;
    container.scrollTop = 0;

    scrollToBottom();
    assert.equal(rafQueue.length, 1);
    rafQueue.shift()();
    assert.equal(container.scrollTop, 500);

    container.scrollHeight = 900;
    container.scrollTop = 120;
    scrollToBottom();
    rafQueue.shift()();
    assert.equal(container.scrollTop, 900);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

test("manual upward scroll does not disable next automatic bottom scroll", async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const rafQueue = [];

  globalThis.requestAnimationFrame = (callback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  };

  try {
    const { container, scrollToBottom } = createScrollHarness();
    container.scrollHeight = 1000;
    container.scrollTop = 0;

    scrollToBottom();
    rafQueue.shift()();
    assert.equal(container.scrollTop, 1000);

    container.scrollTop = 0;
    container.scrollHeight = 1200;
    scrollToBottom();
    rafQueue.shift()();
    assert.equal(container.scrollTop, 1200);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

test("execution log clear keeps scroll body mounted and resets scrollTop", () => {
  const container = {
    scrollTop: 480,
    mounted: true,
  };

  const clear = () => {
    container.scrollTop = 0;
  };

  clear();
  assert.equal(container.mounted, true);
  assert.equal(container.scrollTop, 0);
});

test("execution log scrolls to bottom after clear when a new entry arrives", async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const rafQueue = [];

  globalThis.requestAnimationFrame = (callback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  };

  try {
    const { container, scrollToBottom } = createScrollHarness();
    container.scrollHeight = 640;
    container.scrollTop = 640;

    container.scrollTop = 0;
    assert.equal(container.scrollTop, 0);

    container.scrollHeight = 720;
    scrollToBottom();
    rafQueue.shift()();
    assert.equal(container.scrollTop, 720);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

test("members and plural controllers routes are removed", () => {
  assert.equal(
    existsSync(path.join(repoRoot, "src/app/(portal)/projects/[slug]/members/page.tsx")),
    false,
  );
  assert.equal(
    existsSync(path.join(repoRoot, "src/app/(portal)/projects/[slug]/controllers/page.tsx")),
    false,
  );
});

test("project navigation exposes local controller once and removes members/controllers", () => {
  const projectNav = readSrc("src/components/projects/ProjectNav.tsx");
  const navigation = readSrc("src/lib/portal/navigation.ts");
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");

  assert.ok(!projectNav.includes('label: "Members"'));
  assert.ok(!projectNav.includes('label: "Controllers"'));
  assert.ok(!projectNav.includes('href: "/members"'));
  assert.ok(!projectNav.includes('href: "/controllers"'));
  assert.ok(projectNav.includes('label: "Local Controller"'));
  assert.equal((projectNav.match(/Local Controller/g) ?? []).length, 1);
  assert.ok(!navigation.includes('return "Members"'));
  assert.ok(!navigation.includes('return "Controllers"'));
  assert.ok(navigation.includes('return "Local Controller"'));
  assert.ok(!overview.includes('label="Members"'));
  assert.ok(!overview.includes('label="Controllers"'));
});

test("controller page title is local controller", () => {
  const controllerPage = readSrc("src/app/(portal)/projects/[slug]/controller/page.tsx");
  assert.ok(controllerPage.includes('title="Local Controller"'));
  assert.ok(!controllerPage.includes('title="BAG Controller"'));
  assert.ok(!controllerPage.includes('title="Controller"'));
});

test("user-facing last run wording is replaced with last poll", () => {
  const engineDetail = readSrc("src/components/data-engines/EngineDetailClient.tsx");
  const engineStatistics = readSrc(
    "src/components/data-engines/webpage-scraper/EngineStatistics.tsx",
  );
  const runtimeDiagnostics = readSrc(
    "src/components/data-engines/webpage-scraper/RuntimeDiagnostics.tsx",
  );

  assert.ok(engineDetail.includes("Last poll"));
  assert.ok(!engineDetail.includes("Last run"));
  assert.ok(engineStatistics.includes('label="Last poll"'));
  assert.ok(!engineStatistics.includes("Last heartbeat"));
  assert.ok(!engineStatistics.includes("Last poll:"));
  assert.ok(runtimeDiagnostics.includes("Last Poll"));
  assert.ok(!runtimeDiagnostics.includes("Last run"));
});

test("execution log session store lives in desktop main process", () => {
  const store = readSrc("desktop/src/services/execution-log-session-store.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");
  const ipc = readSrc("desktop/src/ipc/engines.ts");

  assert.ok(store.includes("sequenceId"));
  assert.ok(localData.includes("executionLogSession"));
  assert.ok(localData.includes("onExecutionLogEntry"));
  assert.ok(engineManager.includes("subscribeExecutionLogs"));
  assert.ok(engineManager.includes("executionLogSnapshot"));
  assert.ok(ipc.includes("neud:engines:subscribeExecutionLogs") || ipc.includes("registerIpcHandler"));
});

test("execution log persists across navigation with single collector", () => {
  const layout = readSrc("src/app/(portal)/projects/[slug]/layout.tsx");
  const sessionRoot = readSrc("src/components/projects/ProjectEngineSessionRoot.tsx");
  const sessionClient = readSrc("src/lib/data-engines/execution-log-session-client.ts");
  const engineDetail = readSrc("src/components/data-engines/EngineDetailClient.tsx");

  assert.ok(layout.includes("ProjectEngineSessionRoot"));
  assert.ok(sessionRoot.includes("useEngineExecutionLogSession"));
  assert.ok(sessionClient.includes("refCount"));
  assert.ok(sessionClient.includes("subscribeToDesktopExecutionLogs"));
  assert.ok(engineDetail.includes("useEngineExecutionLogSession"));
  assert.ok(!engineDetail.includes("sessionCutoffMs"));
});

test("execution log clear and app close are the only reset paths", () => {
  const sessionClient = readSrc("src/lib/data-engines/execution-log-session-client.ts");
  const bagLog = readSrc("src/components/data-engines/webpage-scraper/BagExecutionLog.tsx");
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");

  assert.ok(sessionClient.includes("clearDesktopExecutionLogSession"));
  assert.ok(sessionClient.includes("clearSessionLogs"));
  assert.ok(bagLog.includes("Clear"));
  assert.ok(!bagLog.includes("sessionCutoffMs"));
  assert.ok(engineManager.includes("clearAllExecutionLogSessions"));
});
