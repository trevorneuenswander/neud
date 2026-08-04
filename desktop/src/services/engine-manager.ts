import fs from "fs";
import path from "path";
import type { BrowserWindow } from "electron";
import { BrowserWindow as BrowserWindowRuntime } from "electron";
import { getWorkerCwd, getWorkerEntryPath } from "./app-paths";
import { CredentialStore } from "./credential-store";
import type { MachineRegistration } from "./machine-registration";
import { ProcessManager, spawnNodeProcess } from "./process-manager";
import type { LocalDataService } from "./local-data-service";
import type { BagSourceService } from "./bag-source-service";
import type { GenericScraperService } from "./generic-scraper-service";
import type { AppPaths } from "./app-paths";
import type {
  EngineControlResult,
  EngineLogEntry,
  LocalEngineStatus,
  ManagedEngineProcess,
} from "../types/desktop-api";
import type { SessionExecutionLogEntry } from "./execution-log-session-store";
import type { EngineStatusSnapshot } from "./engine-status-session-store";
import { sendToRenderer } from "../ipc/channels";
import { assertEngineId } from "../utils/validate";
import { redactLogLine } from "../utils/redact";
import {
  assertDataEngineModuleExists,
  resolveBagLotDetailAdapterPath,
  resolveDataEngineDistModule,
} from "./bag-detail-adapter-path";
import { nativeImport } from "./import-esm-module";
import { resolvePuppeteerModule } from "./resolve-puppeteer-module";

const EXPORT_BROWSER_UNAVAILABLE =
  "The auction browser session is unavailable. Start the Webpage Scraper and try again.";

export type BrowserSessionState =
  | "stopped"
  | "starting"
  | "authenticating"
  | "ready"
  | "error";

type ExportPuppeteerPage = {
  close: () => Promise<void>;
};

type ExportPuppeteerBrowser = {
  newPage: () => Promise<ExportPuppeteerPage>;
  close: () => Promise<void>;
};

const LOG_BUFFER_LIMIT = 500;
const STOP_GRACEFUL_MS = 10000;
const STOP_FORCE_MS = 5000;

export type EngineStopOptions = {
  reason?: string;
  gracefulMs?: number;
  forceMs?: number;
};

export class EngineManager {
  private engines = new Map<string, ManagedEngineProcess>();
  private logSubscribers = new Map<number, Set<string>>();
  private executionLogSubscribers = new Map<number, Set<string>>();
  private engineStatusSubscribers = new Map<number, Set<string>>();
  private windowListeners = new Map<number, (entry: EngineLogEntry) => void>();
  private removeExecutionLogListener: (() => void) | null = null;
  private removeEngineStatusListener: (() => void) | null = null;

  constructor(
    private readonly paths: AppPaths,
    private readonly processManager: ProcessManager,
    private readonly credentials: CredentialStore,
    private readonly host: MachineRegistration,
    private readonly data: LocalDataService,
    private readonly bagSources: BagSourceService,
    private readonly genericScraper: GenericScraperService,
    private readonly localApiUrl: string,
  ) {
    this.removeExecutionLogListener = this.data.onExecutionLogEntry(
      (engineId, entry) => {
        this.pushExecutionLogEntry(engineId, entry);
      },
    );
    this.removeEngineStatusListener = this.data.onEngineStatusChange(
      (engineId, snapshot) => {
        this.pushEngineStatusSnapshot(engineId, snapshot);
      },
    );
  }

  getBrowserSessionState(engineId: string): BrowserSessionState {
    const id = assertEngineId(engineId);
    if (!this.isLive(id)) {
      return "stopped";
    }

    const snapshot = this.data.getEngineStatusSnapshot(id);
    if (snapshot.actualState === "starting") {
      return "starting";
    }
    if (snapshot.actualState === "error" || snapshot.healthState === "error") {
      return "error";
    }
    if (snapshot.healthState === "healthy" && snapshot.lastRunSucceededAt) {
      return "ready";
    }
    if (snapshot.actualState === "running") {
      return "authenticating";
    }
    return "stopped";
  }

  async exportCurrentAuction(
    engineId: string,
    tasks: Array<{ lotNumber: string; editUrl: string; sourceEditUrl?: string | null }>,
    photoDownloadRoot?: string,
    meta?: {
      operationId?: string;
      projectId?: string;
      onQueued?: (requestId: string) => void;
    },
  ): Promise<Record<string, unknown>> {
    const id = assertEngineId(engineId);
    if (!this.isLive(id)) {
      throw new Error(EXPORT_BROWSER_UNAVAILABLE);
    }

    const requestId = this.data.queueExportCurrentAuction(id, tasks, photoDownloadRoot, {
      operationId: meta?.operationId,
      projectId: meta?.projectId,
    });
    meta?.onQueued?.(requestId);
    this.recordExecutionLog(id, "Export current auction requested");
    return this.data.waitForExportCurrentAuctionResult(requestId);
  }

  cancelExportCurrentAuction(engineId: string, operationId: string): boolean {
    const id = assertEngineId(engineId);
    const requestId = this.data.getExportRequestIdForOperation(operationId);
    if (!requestId) {
      return this.data.cancelExportCurrentAuctionByOperationId(operationId);
    }
    const command = this.data.getExportCurrentAuctionResult(requestId);
    if (command && command.engineId !== id) {
      return false;
    }
    return this.data.cancelExportCurrentAuction(requestId);
  }

  hasAuthenticatedExportContext(engineId: string): boolean {
    return this.isLive(assertEngineId(engineId));
  }

  isScraperSessionActive(): boolean {
    for (const engineId of this.engines.keys()) {
      if (this.isEngineRunning(engineId)) {
        return true;
      }
    }
    return this.data.isAnyEngineSessionActive();
  }

  isEngineRunning(engineId: string): boolean {
    return this.isLive(engineId);
  }

  getRunningEngineSummaries(): Array<{
    workerId: string;
    projectId: string;
    engineId: string;
    status: "starting" | "running" | "ready";
  }> {
    const summaries: Array<{
      workerId: string;
      projectId: string;
      engineId: string;
      status: "starting" | "running" | "ready";
    }> = [];

    for (const [engineId, managed] of this.engines.entries()) {
      if (!this.isLive(engineId)) continue;
      if (managed.state !== "starting" && managed.state !== "running") continue;

      const engine = this.data.getEngineById(engineId);
      const snapshot = this.data.getEngineStatusSnapshot(engineId);
      const workerId = this.data.getEngineWorkerId(engineId);
      let status: "starting" | "running" | "ready" = "running";
      if (managed.state === "starting") {
        status = "starting";
      } else if (
        snapshot.healthState === "healthy" &&
        snapshot.lastRunSucceededAt
      ) {
        status = "ready";
      }

      summaries.push({
        workerId: workerId ?? String(managed.pid || engineId),
        projectId: engine?.project_id ?? "",
        engineId,
        status,
      });
    }

    return summaries;
  }

  countRunningEngines(): number {
    const engineIds = new Set(
      this.getRunningEngineSummaries().map((summary) => summary.engineId),
    );
    return engineIds.size;
  }

  /** @deprecated Use countRunningEngines */
  countRunningWorkers(): number {
    return this.countRunningEngines();
  }

  /** @deprecated Use getRunningEngineSummaries */
  getRunningWorkerSummaries() {
    return this.getRunningEngineSummaries();
  }

  async withAuthenticatedExportPage(
    engineId: string,
    callback: (page: ExportPuppeteerPage) => Promise<void>,
  ): Promise<void> {
    const id = assertEngineId(engineId);
    if (!this.credentials.hasRunnableAuth(id)) {
      const { MissingScraperCredentialsError } = await import(
        "./project-scraper-auth.js"
      );
      throw new MissingScraperCredentialsError();
    }

    const lotDetailAdapter = resolveBagLotDetailAdapterPath(this.paths);
    assertDataEngineModuleExists(lotDetailAdapter);

    const browserUserDataDir = path.join(this.paths.browserData, id);
    fs.mkdirSync(browserUserDataDir, { recursive: true });
    fs.mkdirSync(this.paths.cookies, { recursive: true });

    process.env.NEUD_APP_DATA_DIR = this.paths.root;
    process.env.NEUD_BROWSER_USER_DATA_DIR = browserUserDataDir;
    process.env.NEUD_COOKIES_DIR = this.paths.cookies;
    process.env.NEUD_APP_DATA_DIR = this.paths.root;
    process.env.NEUD_BROWSER_USER_DATA_DIR = browserUserDataDir;
    process.env.NEUD_COOKIES_DIR = this.paths.cookies;
    process.env.ENGINE_ID = id;

    const scraperBrowserModule = await this.loadScraperBrowserModule();
    const { puppeteer, resolvedBrowser, buildPuppeteerLaunchOptions } =
      await resolvePuppeteerModule(this.paths, lotDetailAdapter.workerRoot);

    const scraperRunning = this.isEngineRunning(id);
    const launchOptions = buildPuppeteerLaunchOptions(resolvedBrowser, {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      ...(scraperRunning ? {} : { userDataDir: browserUserDataDir }),
    });

    let browser: ExportPuppeteerBrowser;
    try {
      browser = (await puppeteer.launch(launchOptions)) as ExportPuppeteerBrowser;
    } catch {
      throw new Error(EXPORT_BROWSER_UNAVAILABLE);
    }

    const page = await browser.newPage();
    try {
      await scraperBrowserModule.loadCookies(page);
      await callback(page);
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  private async loadScraperBrowserModule(): Promise<{
    loadCookies: (page: ExportPuppeteerPage) => Promise<boolean>;
  }> {
    const resolved = resolveDataEngineDistModule(
      this.paths,
      path.join("adapters", "webpage-scraper", "browser.js"),
    );
    assertDataEngineModuleExists(resolved);
    return nativeImport(resolved.moduleUrl);
  }

  getLocalStatus(engineId: string): LocalEngineStatus | null {
    const id = assertEngineId(engineId);
    const managed = this.engines.get(id);
    if (!managed) {
      return {
        engineId: id,
        pid: null,
        state: "stopped",
        startedAt: null,
        lastExitCode: null,
        hostId: this.host.getHostId(),
      };
    }

    return this.toStatus(managed);
  }

  async start(
    engineId: string,
    _requestedBy?: string | null,
  ): Promise<EngineControlResult> {
    const id = assertEngineId(engineId);

    if (this.isLive(id)) {
      return {
        ok: false,
        code: "already-running",
        message: "This engine is already running locally.",
        status: this.getLocalStatus(id),
      };
    }

    if (this.genericScraper.requiresCredentials(id) && !this.credentials.hasRunnableAuth(id)) {
      return {
        ok: false,
        code: "missing-credentials",
        message: "Save scraper credentials before starting this engine.",
      };
    }

    const validationError = this.validateEngineBeforeRun(id);
    if (validationError) {
      this.data.recordStatus(id, {
        actualState: "stopped",
        healthState: "error",
        lastError: validationError.message,
      });
      this.data.recordLog(id, {
        level: "error",
        eventType: "engine.start.blocked",
        message: validationError.message,
        metadata: { code: validationError.code },
      });
      return {
        ok: false,
        code: validationError.code,
        message: validationError.message,
      };
    }

    try {
      this.data.setExecutionMode(id, "local-desktop");
      this.data.updateDesiredState(id, "running");

      const managed = await this.spawnWorker(id);
      this.data.recordStatus(id, {
        workerId: `${this.host.getHostId()}-local`,
        actualState: "starting",
        lastHeartbeatAt: new Date().toISOString(),
      });
      this.recordExecutionLog(id, "Scraper Engine started");

      return {
        ok: true,
        code: "started",
        message: "Local Data Engine started.",
        status: this.toStatus(managed),
      };
    } catch (error) {
      return {
        ok: false,
        code: "error",
        message:
          error instanceof Error ? error.message : "Unable to start engine.",
      };
    }
  }

  async stop(
    engineId: string,
    requestedBy?: string | null,
    options: EngineStopOptions = {},
  ): Promise<EngineControlResult> {
    const id = assertEngineId(engineId);
    const managed = this.engines.get(id);
    const wasLive = managed ? this.isLive(id) : false;
    const stopReason = options.reason ?? requestedBy ?? null;

    try {
      this.data.updateDesiredState(id, "stopped");
      this.data.clearPendingRunOnce(id);
    } catch {
      // still stop local process
    }

    if (!managed || !wasLive) {
      this.engines.delete(id);
      this.data.recordStatus(id, {
        workerId: null,
        actualState: "stopped",
        healthState: "warning",
        lastError: null,
      });
      return {
        ok: true,
        code: "stopped",
        message: "Engine is stopped.",
        status: this.getLocalStatus(id),
      };
    }

    if (managed.state === "stopping") {
      const gracefulMs = options.gracefulMs ?? STOP_GRACEFUL_MS;
      const forceMs = options.forceMs ?? STOP_FORCE_MS;
      const processName = this.processName(id);
      const stopResult = await this.processManager.stop(processName, gracefulMs);
      if (!stopResult.forced && stopResult.exitCode === null) {
        await this.processManager.stop(processName, forceMs);
      }
      this.engines.delete(id);
      managed.logBuffer.length = 0;
      this.data.recordStatus(id, {
        workerId: null,
        actualState: "stopped",
        healthState: "warning",
        lastError: null,
      });
      return {
        ok: true,
        code: "stopped",
        message: "Engine is stopped.",
        status: this.getLocalStatus(id),
      };
    }

    managed.state = "stopping";
    this.data.recordStatus(id, {
      actualState: "stopping",
      workerId: `${this.host.getHostId()}-local`,
    });
    this.recordExecutionLog(
      id,
      stopReason === "application-exit"
        ? "Stop requested for application exit"
        : "Stop requested",
    );

    try {
      const processName = this.processName(id);
      const gracefulMs = options.gracefulMs ?? STOP_GRACEFUL_MS;
      let stopResult = await this.processManager.stop(processName, gracefulMs);

      if (stopResult.forced || stopResult.exitCode === null) {
        this.recordExecutionLog(id, "Graceful stop timed out");
        stopResult = await this.processManager.stop(processName, options.forceMs ?? STOP_FORCE_MS);
        if (stopResult.forced) {
          this.recordExecutionLog(id, "Worker terminated");
        }
      } else {
        this.recordExecutionLog(id, "Worker exited");
      }

      this.engines.delete(id);
      managed.logBuffer.length = 0;
      this.recordExecutionLog(id, "Scraper Engine stopped");

      this.data.recordStatus(id, {
        workerId: null,
        actualState: "stopped",
        healthState: "warning",
        lastError: null,
      });

      return {
        ok: true,
        code: "stopped",
        message: "Local Data Engine stopped.",
        status: this.getLocalStatus(id),
      };
    } catch (error) {
      this.engines.delete(id);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to stop the local Data Engine.";
      this.data.recordStatus(id, {
        actualState: "stopped",
        healthState: "warning",
        lastError: null,
      });
      this.data.recordLog(id, {
        level: "warn",
        eventType: "engine.stop.forced",
        message: `Stop completed with cleanup fallback: ${message}`,
      });
      return {
        ok: true,
        code: "stopped",
        message: "Local Data Engine stopped.",
        status: this.getLocalStatus(id),
      };
    }
  }

  async restart(
    engineId: string,
    requestedBy?: string | null,
  ): Promise<EngineControlResult> {
    const id = assertEngineId(engineId);
    this.recordExecutionLog(id, "Scraper Engine restarted");
    const stopResult = await this.stop(engineId, requestedBy);
    if (!stopResult.ok) {
      return stopResult;
    }
    return this.start(engineId, requestedBy);
  }

  async runOnce(
    engineId: string,
    _requestedBy?: string | null,
  ): Promise<EngineControlResult> {
    const id = assertEngineId(engineId);

    if (this.genericScraper.requiresCredentials(id) && !this.credentials.hasRunnableAuth(id)) {
      return {
        ok: false,
        code: "missing-credentials",
        message: "Save scraper credentials before running this engine.",
      };
    }

    const validationError = this.validateEngineBeforeRun(id);
    if (validationError) {
      this.data.recordStatus(id, {
        actualState: "stopped",
        healthState: "error",
        lastError: validationError.message,
      });
      this.data.recordLog(id, {
        level: "error",
        eventType: "engine.run_once.blocked",
        message: validationError.message,
        metadata: { code: validationError.code },
      });
      return {
        ok: false,
        code: validationError.code,
        message: validationError.message,
      };
    }

    try {
      this.data.queueRunOnce(id);

      if (!this.isLive(id)) {
        await this.spawnWorker(id);
      }

      const managed = this.engines.get(id);
      return {
        ok: true,
        code: "run-once-queued",
        message: "Run Once queued for the local engine.",
        status: managed ? this.toStatus(managed) : this.getLocalStatus(id),
      };
    } catch (error) {
      return {
        ok: false,
        code: "error",
        message:
          error instanceof Error ? error.message : "Unable to queue Run Once.",
      };
    }
  }

  subscribeLogs(window: BrowserWindow, engineId: string) {
    const id = assertEngineId(engineId);
    const windowId = window.id;
    const current = this.logSubscribers.get(windowId) ?? new Set<string>();
    current.add(id);
    this.logSubscribers.set(windowId, current);
  }

  unsubscribeLogs(window: BrowserWindow, engineId: string) {
    const id = assertEngineId(engineId);
    const windowId = window.id;
    const current = this.logSubscribers.get(windowId);
    if (!current) return;
    current.delete(id);
    if (current.size === 0) {
      this.logSubscribers.delete(windowId);
    }
  }

  subscribeExecutionLogs(window: BrowserWindow, engineId: string) {
    const id = assertEngineId(engineId);
    const windowId = window.id;
    const current = this.executionLogSubscribers.get(windowId) ?? new Set<string>();
    current.add(id);
    this.executionLogSubscribers.set(windowId, current);

    if (!window.isDestroyed()) {
      sendToRenderer(window, "neud:engines:executionLogSnapshot", {
        engineId: id,
        entries: this.data.getExecutionLogSnapshot(id),
      });
    }
  }

  subscribeEngineStatus(window: BrowserWindow, engineId: string) {
    const id = assertEngineId(engineId);
    const windowId = window.id;
    const current = this.engineStatusSubscribers.get(windowId) ?? new Set<string>();
    current.add(id);
    this.engineStatusSubscribers.set(windowId, current);

    if (!window.isDestroyed()) {
      sendToRenderer(window, "neud:engines:engineStatusSnapshot", {
        engineId: id,
        snapshot: this.data.getEngineStatusSnapshot(id),
      });
    }
  }

  unsubscribeEngineStatus(window: BrowserWindow, engineId: string) {
    const id = assertEngineId(engineId);
    const windowId = window.id;
    const current = this.engineStatusSubscribers.get(windowId);
    if (!current) return;
    current.delete(id);
    if (current.size === 0) {
      this.engineStatusSubscribers.delete(windowId);
    }
  }

  unsubscribeExecutionLogs(window: BrowserWindow, engineId: string) {
    const id = assertEngineId(engineId);
    const windowId = window.id;
    const current = this.executionLogSubscribers.get(windowId);
    if (!current) return;
    current.delete(id);
    if (current.size === 0) {
      this.executionLogSubscribers.delete(windowId);
    }
  }

  clearWindow(window: BrowserWindow) {
    this.logSubscribers.delete(window.id);
    this.executionLogSubscribers.delete(window.id);
    this.engineStatusSubscribers.delete(window.id);
    this.windowListeners.delete(window.id);
    this.data.clearActivityWindow(window);
  }

  async stopAll(options: EngineStopOptions = {}) {
    const ids = [...this.engines.keys()];
    for (const engineId of ids) {
      await this.stop(engineId, null, options);
    }
    this.clearAllSessionLogBuffers();
    this.data.clearAllExecutionLogSessions();
    this.data.clearSessionFacingLastErrors();
  }

  async stopAllForApplicationExit() {
    await this.stopAll({
      reason: "application-exit",
      gracefulMs: STOP_GRACEFUL_MS,
      forceMs: STOP_FORCE_MS,
    });
  }

  clearSessionLogs(engineId: string) {
    const id = assertEngineId(engineId);
    const managed = this.engines.get(id);
    if (managed) {
      managed.logBuffer.length = 0;
    }
    this.data.clearExecutionLogSession(id);
    this.pushExecutionLogSnapshot(id);
  }

  clearAllSessionLogBuffers() {
    for (const managed of this.engines.values()) {
      managed.logBuffer.length = 0;
    }
  }

  private recordExecutionLog(engineId: string, message: string) {
    this.data.recordLog(engineId, {
      level: "info",
      eventType: "engine.execution",
      message,
    });
  }

  private processName(engineId: string) {
    return `engine:${engineId}`;
  }

  private isLive(engineId: string): boolean {
    const managed = this.engines.get(engineId);
    if (!managed) return false;
    if (managed.child.exitCode !== null || managed.child.killed) {
      this.engines.delete(engineId);
      return false;
    }
    return true;
  }

  private toStatus(managed: ManagedEngineProcess): LocalEngineStatus {
    return {
      engineId: managed.engineId,
      pid: managed.pid,
      state: managed.state,
      startedAt: managed.startedAt,
      lastExitCode: managed.lastExitCode,
      hostId: this.host.getHostId(),
    };
  }

  private pushEngineStatusSnapshot(
    engineId: string,
    snapshot: EngineStatusSnapshot,
  ) {
    for (const [windowId, engineIds] of this.engineStatusSubscribers.entries()) {
      if (!engineIds.has(engineId)) continue;
      const window = BrowserWindowRuntime.fromId(windowId);
      if (window && !window.isDestroyed()) {
        sendToRenderer(window, "neud:engines:engineStatusSnapshot", {
          engineId,
          snapshot,
        });
      }
    }
  }

  private pushExecutionLogSnapshot(engineId: string) {
    const entries = this.data.getExecutionLogSnapshot(engineId);
    for (const [windowId, engineIds] of this.executionLogSubscribers.entries()) {
      if (!engineIds.has(engineId)) continue;
      const window = BrowserWindowRuntime.fromId(windowId);
      if (window && !window.isDestroyed()) {
        sendToRenderer(window, "neud:engines:executionLogSnapshot", {
          engineId,
          entries,
        });
      }
    }
  }

  private pushExecutionLogEntry(
    engineId: string,
    entry: SessionExecutionLogEntry,
  ) {
    for (const [windowId, engineIds] of this.executionLogSubscribers.entries()) {
      if (!engineIds.has(engineId)) continue;
      const window = BrowserWindowRuntime.fromId(windowId);
      if (window && !window.isDestroyed()) {
        sendToRenderer(window, "neud:engines:executionLogEntry", {
          engineId,
          entry,
        });
      }
    }
  }

  private pushLog(engineId: string, entry: EngineLogEntry) {
    const managed = this.engines.get(engineId);
    if (managed) {
      managed.logBuffer.push(entry);
      if (managed.logBuffer.length > LOG_BUFFER_LIMIT) {
        managed.logBuffer.shift();
      }
    }

    for (const [windowId, engineIds] of this.logSubscribers.entries()) {
      if (!engineIds.has(engineId)) continue;
      const window = BrowserWindowRuntime.fromId(windowId);
      if (window && !window.isDestroyed()) {
        sendToRenderer(window, "neud:engines:log", entry);
      }
    }
  }

  private validateEngineBeforeRun(
    engineId: string,
  ): { code: string; message: string } | null {
    const genericValidation = this.genericScraper.validateForStart(
      engineId,
      this.credentials.hasCredentials(engineId),
    );
    if (!genericValidation.ok) {
      return {
        code: genericValidation.code,
        message: genericValidation.message,
      };
    }

    const bagValidation = this.bagSources.validateBagScraperSourcesForStart(engineId);
    if (!bagValidation.ok) {
      return {
        code: bagValidation.code ?? "missing-source",
        message: bagValidation.message,
      };
    }

    return null;
  }

  private async spawnWorker(engineId: string): Promise<ManagedEngineProcess> {
    const existing = this.engines.get(engineId);
    if (existing && this.isLive(engineId)) {
      return existing;
    }

    const engine = this.data.getEngineById(engineId);
    const needsCredentials = this.genericScraper.requiresCredentials(engineId);
    const creds = needsCredentials
      ? this.credentials.getCredentialsForWorker(engineId)
      : null;

    if (needsCredentials && !creds && !this.credentials.hasRunnableAuth(engineId)) {
      throw new Error("Missing scraper credentials.");
    }

    const adapter =
      typeof engine?.config?.adapter === "string" ? engine.config.adapter : null;

    const entryPath = getWorkerEntryPath(this.paths);
    const cwd = getWorkerCwd(this.paths);
    const hostId = this.host.getHostId();
    const logFile = path.join(this.paths.engineLogs, `${engineId}.log`);
    const browserUserDataDir = path.join(this.paths.browserData, engineId);
    fs.mkdirSync(browserUserDataDir, { recursive: true });
    fs.mkdirSync(this.paths.cookies, { recursive: true });

    const child = spawnNodeProcess({
      name: this.processName(engineId),
      entryPath,
      cwd,
      logFile,
      env: this.buildWorkerEnvironment({
        engineId,
        adapter,
        creds,
        hostId,
        browserUserDataDir,
      }),
      onStdout: (chunk) => {
        const secrets = this.credentials.getRedactionValues(engineId);
        const message = redactLogLine(chunk, secrets);
        this.pushLog(engineId, {
          engineId,
          stream: "stdout",
          message,
          timestamp: new Date().toISOString(),
        });
      },
      onStderr: (chunk) => {
        const secrets = this.credentials.getRedactionValues(engineId);
        const message = redactLogLine(chunk, secrets);
        this.pushLog(engineId, {
          engineId,
          stream: "stderr",
          message,
          timestamp: new Date().toISOString(),
        });
      },
    });

    const pid = child.pid ?? 0;

    const managed: ManagedEngineProcess = {
      engineId,
      pid,
      state: "starting",
      startedAt: new Date().toISOString(),
      lastExitCode: null,
      logBuffer: [],
      child,
    };

    child.on("exit", (code) => {
      managed.lastExitCode = code;
      managed.state = code === 0 ? "stopped" : "error";
      this.processManager.remove(this.processName(engineId));
      this.engines.delete(engineId);
      this.data.recordStatus(engineId, {
        workerId: null,
        actualState: code === 0 ? "stopped" : "error",
      });
    });

    child.on("spawn", () => {
      managed.state = "running";
      managed.pid = child.pid ?? managed.pid;
    });

    this.processManager.register(this.processName(engineId), child, logFile);
    this.engines.set(engineId, managed);
    return managed;
  }

  private buildWorkerEnvironment(input: {
    engineId: string;
    adapter: string | null;
    creds: { email: string; password: string } | null;
    hostId: string;
    browserUserDataDir: string;
  }): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.BAG_AUCTION_EMAIL;
    delete env.BAG_AUCTION_PASSWORD;
    delete env.SCRAPER_EMAIL;
    delete env.SCRAPER_PASSWORD;

    env.ENGINE_ID = input.engineId;
    env.WORKER_ID = `${input.hostId}-local`;
    env.NEUD_APP_DATA_DIR = this.paths.root;
    env.NEUD_LOCAL_API_URL = this.localApiUrl;
    env.NEUD_BROWSER_USER_DATA_DIR = input.browserUserDataDir;
    env.NEUD_COOKIES_DIR = this.paths.cookies;
    env.NEUD_APP_DATA_DIR = this.paths.root;
    env.NEUD_LOCAL_API_URL = this.localApiUrl;
    env.NEUD_BROWSER_USER_DATA_DIR = input.browserUserDataDir;
    env.NEUD_COOKIES_DIR = this.paths.cookies;

    if (input.adapter === "bag-auction" && input.creds) {
      env.BAG_AUCTION_EMAIL = input.creds.email;
      env.BAG_AUCTION_PASSWORD = input.creds.password;
    }

    if (input.adapter === "generic-webpage" && input.creds) {
      env.SCRAPER_EMAIL = input.creds.email;
      env.SCRAPER_PASSWORD = input.creds.password;
    }

    return env;
  }
}
