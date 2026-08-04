"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const app_paths_1 = require("./app-paths");
const process_manager_1 = require("./process-manager");
const channels_1 = require("../ipc/channels");
const validate_1 = require("../utils/validate");
const redact_1 = require("../utils/redact");
const bag_detail_adapter_path_1 = require("./bag-detail-adapter-path");
const import_esm_module_1 = require("./import-esm-module");
const resolve_puppeteer_module_1 = require("./resolve-puppeteer-module");
const EXPORT_BROWSER_UNAVAILABLE = "The auction browser session is unavailable. Start the Webpage Scraper and try again.";
const LOG_BUFFER_LIMIT = 500;
const STOP_GRACEFUL_MS = 10000;
const STOP_FORCE_MS = 5000;
class EngineManager {
    paths;
    processManager;
    credentials;
    host;
    data;
    bagSources;
    genericScraper;
    localApiUrl;
    engines = new Map();
    logSubscribers = new Map();
    executionLogSubscribers = new Map();
    engineStatusSubscribers = new Map();
    windowListeners = new Map();
    removeExecutionLogListener = null;
    removeEngineStatusListener = null;
    constructor(paths, processManager, credentials, host, data, bagSources, genericScraper, localApiUrl) {
        this.paths = paths;
        this.processManager = processManager;
        this.credentials = credentials;
        this.host = host;
        this.data = data;
        this.bagSources = bagSources;
        this.genericScraper = genericScraper;
        this.localApiUrl = localApiUrl;
        this.removeExecutionLogListener = this.data.onExecutionLogEntry((engineId, entry) => {
            this.pushExecutionLogEntry(engineId, entry);
        });
        this.removeEngineStatusListener = this.data.onEngineStatusChange((engineId, snapshot) => {
            this.pushEngineStatusSnapshot(engineId, snapshot);
        });
    }
    getBrowserSessionState(engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
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
    async exportCurrentAuction(engineId, tasks, photoDownloadRoot, meta) {
        const id = (0, validate_1.assertEngineId)(engineId);
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
    cancelExportCurrentAuction(engineId, operationId) {
        const id = (0, validate_1.assertEngineId)(engineId);
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
    hasAuthenticatedExportContext(engineId) {
        return this.isLive((0, validate_1.assertEngineId)(engineId));
    }
    isScraperSessionActive() {
        for (const engineId of this.engines.keys()) {
            if (this.isEngineRunning(engineId)) {
                return true;
            }
        }
        return this.data.isAnyEngineSessionActive();
    }
    isEngineRunning(engineId) {
        return this.isLive(engineId);
    }
    getRunningEngineSummaries() {
        const summaries = [];
        for (const [engineId, managed] of this.engines.entries()) {
            if (!this.isLive(engineId))
                continue;
            if (managed.state !== "starting" && managed.state !== "running")
                continue;
            const engine = this.data.getEngineById(engineId);
            const snapshot = this.data.getEngineStatusSnapshot(engineId);
            const workerId = this.data.getEngineWorkerId(engineId);
            let status = "running";
            if (managed.state === "starting") {
                status = "starting";
            }
            else if (snapshot.healthState === "healthy" &&
                snapshot.lastRunSucceededAt) {
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
    countRunningEngines() {
        const engineIds = new Set(this.getRunningEngineSummaries().map((summary) => summary.engineId));
        return engineIds.size;
    }
    /** @deprecated Use countRunningEngines */
    countRunningWorkers() {
        return this.countRunningEngines();
    }
    /** @deprecated Use getRunningEngineSummaries */
    getRunningWorkerSummaries() {
        return this.getRunningEngineSummaries();
    }
    async withAuthenticatedExportPage(engineId, callback) {
        const id = (0, validate_1.assertEngineId)(engineId);
        if (!this.credentials.hasRunnableAuth(id)) {
            const { MissingScraperCredentialsError } = await Promise.resolve().then(() => __importStar(require("./project-scraper-auth.js")));
            throw new MissingScraperCredentialsError();
        }
        const lotDetailAdapter = (0, bag_detail_adapter_path_1.resolveBagLotDetailAdapterPath)(this.paths);
        (0, bag_detail_adapter_path_1.assertDataEngineModuleExists)(lotDetailAdapter);
        const browserUserDataDir = path_1.default.join(this.paths.browserData, id);
        fs_1.default.mkdirSync(browserUserDataDir, { recursive: true });
        fs_1.default.mkdirSync(this.paths.cookies, { recursive: true });
        process.env.NEUD_APP_DATA_DIR = this.paths.root;
        process.env.NEUD_BROWSER_USER_DATA_DIR = browserUserDataDir;
        process.env.NEUD_COOKIES_DIR = this.paths.cookies;
        process.env.NEUD_APP_DATA_DIR = this.paths.root;
        process.env.NEUD_BROWSER_USER_DATA_DIR = browserUserDataDir;
        process.env.NEUD_COOKIES_DIR = this.paths.cookies;
        process.env.ENGINE_ID = id;
        const scraperBrowserModule = await this.loadScraperBrowserModule();
        const { puppeteer, resolvedBrowser, buildPuppeteerLaunchOptions } = await (0, resolve_puppeteer_module_1.resolvePuppeteerModule)(this.paths, lotDetailAdapter.workerRoot);
        const scraperRunning = this.isEngineRunning(id);
        const launchOptions = buildPuppeteerLaunchOptions(resolvedBrowser, {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
            ...(scraperRunning ? {} : { userDataDir: browserUserDataDir }),
        });
        let browser;
        try {
            browser = (await puppeteer.launch(launchOptions));
        }
        catch {
            throw new Error(EXPORT_BROWSER_UNAVAILABLE);
        }
        const page = await browser.newPage();
        try {
            await scraperBrowserModule.loadCookies(page);
            await callback(page);
        }
        finally {
            await page.close().catch(() => { });
            await browser.close().catch(() => { });
        }
    }
    async loadScraperBrowserModule() {
        const resolved = (0, bag_detail_adapter_path_1.resolveDataEngineDistModule)(this.paths, path_1.default.join("adapters", "webpage-scraper", "browser.js"));
        (0, bag_detail_adapter_path_1.assertDataEngineModuleExists)(resolved);
        return (0, import_esm_module_1.nativeImport)(resolved.moduleUrl);
    }
    getLocalStatus(engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
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
    async start(engineId, _requestedBy) {
        const id = (0, validate_1.assertEngineId)(engineId);
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
        }
        catch (error) {
            return {
                ok: false,
                code: "error",
                message: error instanceof Error ? error.message : "Unable to start engine.",
            };
        }
    }
    async stop(engineId, requestedBy, options = {}) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const managed = this.engines.get(id);
        const wasLive = managed ? this.isLive(id) : false;
        const stopReason = options.reason ?? requestedBy ?? null;
        try {
            this.data.updateDesiredState(id, "stopped");
            this.data.clearPendingRunOnce(id);
        }
        catch {
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
        this.recordExecutionLog(id, stopReason === "application-exit"
            ? "Stop requested for application exit"
            : "Stop requested");
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
            }
            else {
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
        }
        catch (error) {
            this.engines.delete(id);
            const message = error instanceof Error
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
    async restart(engineId, requestedBy) {
        const id = (0, validate_1.assertEngineId)(engineId);
        this.recordExecutionLog(id, "Scraper Engine restarted");
        const stopResult = await this.stop(engineId, requestedBy);
        if (!stopResult.ok) {
            return stopResult;
        }
        return this.start(engineId, requestedBy);
    }
    async runOnce(engineId, _requestedBy) {
        const id = (0, validate_1.assertEngineId)(engineId);
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
        }
        catch (error) {
            return {
                ok: false,
                code: "error",
                message: error instanceof Error ? error.message : "Unable to queue Run Once.",
            };
        }
    }
    subscribeLogs(window, engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const windowId = window.id;
        const current = this.logSubscribers.get(windowId) ?? new Set();
        current.add(id);
        this.logSubscribers.set(windowId, current);
    }
    unsubscribeLogs(window, engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const windowId = window.id;
        const current = this.logSubscribers.get(windowId);
        if (!current)
            return;
        current.delete(id);
        if (current.size === 0) {
            this.logSubscribers.delete(windowId);
        }
    }
    subscribeExecutionLogs(window, engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const windowId = window.id;
        const current = this.executionLogSubscribers.get(windowId) ?? new Set();
        current.add(id);
        this.executionLogSubscribers.set(windowId, current);
        if (!window.isDestroyed()) {
            (0, channels_1.sendToRenderer)(window, "neud:engines:executionLogSnapshot", {
                engineId: id,
                entries: this.data.getExecutionLogSnapshot(id),
            });
        }
    }
    subscribeEngineStatus(window, engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const windowId = window.id;
        const current = this.engineStatusSubscribers.get(windowId) ?? new Set();
        current.add(id);
        this.engineStatusSubscribers.set(windowId, current);
        if (!window.isDestroyed()) {
            (0, channels_1.sendToRenderer)(window, "neud:engines:engineStatusSnapshot", {
                engineId: id,
                snapshot: this.data.getEngineStatusSnapshot(id),
            });
        }
    }
    unsubscribeEngineStatus(window, engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const windowId = window.id;
        const current = this.engineStatusSubscribers.get(windowId);
        if (!current)
            return;
        current.delete(id);
        if (current.size === 0) {
            this.engineStatusSubscribers.delete(windowId);
        }
    }
    unsubscribeExecutionLogs(window, engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const windowId = window.id;
        const current = this.executionLogSubscribers.get(windowId);
        if (!current)
            return;
        current.delete(id);
        if (current.size === 0) {
            this.executionLogSubscribers.delete(windowId);
        }
    }
    clearWindow(window) {
        this.logSubscribers.delete(window.id);
        this.executionLogSubscribers.delete(window.id);
        this.engineStatusSubscribers.delete(window.id);
        this.windowListeners.delete(window.id);
        this.data.clearActivityWindow(window);
    }
    async stopAll(options = {}) {
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
    clearSessionLogs(engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
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
    recordExecutionLog(engineId, message) {
        this.data.recordLog(engineId, {
            level: "info",
            eventType: "engine.execution",
            message,
        });
    }
    processName(engineId) {
        return `engine:${engineId}`;
    }
    isLive(engineId) {
        const managed = this.engines.get(engineId);
        if (!managed)
            return false;
        if (managed.child.exitCode !== null || managed.child.killed) {
            this.engines.delete(engineId);
            return false;
        }
        return true;
    }
    toStatus(managed) {
        return {
            engineId: managed.engineId,
            pid: managed.pid,
            state: managed.state,
            startedAt: managed.startedAt,
            lastExitCode: managed.lastExitCode,
            hostId: this.host.getHostId(),
        };
    }
    pushEngineStatusSnapshot(engineId, snapshot) {
        for (const [windowId, engineIds] of this.engineStatusSubscribers.entries()) {
            if (!engineIds.has(engineId))
                continue;
            const window = electron_1.BrowserWindow.fromId(windowId);
            if (window && !window.isDestroyed()) {
                (0, channels_1.sendToRenderer)(window, "neud:engines:engineStatusSnapshot", {
                    engineId,
                    snapshot,
                });
            }
        }
    }
    pushExecutionLogSnapshot(engineId) {
        const entries = this.data.getExecutionLogSnapshot(engineId);
        for (const [windowId, engineIds] of this.executionLogSubscribers.entries()) {
            if (!engineIds.has(engineId))
                continue;
            const window = electron_1.BrowserWindow.fromId(windowId);
            if (window && !window.isDestroyed()) {
                (0, channels_1.sendToRenderer)(window, "neud:engines:executionLogSnapshot", {
                    engineId,
                    entries,
                });
            }
        }
    }
    pushExecutionLogEntry(engineId, entry) {
        for (const [windowId, engineIds] of this.executionLogSubscribers.entries()) {
            if (!engineIds.has(engineId))
                continue;
            const window = electron_1.BrowserWindow.fromId(windowId);
            if (window && !window.isDestroyed()) {
                (0, channels_1.sendToRenderer)(window, "neud:engines:executionLogEntry", {
                    engineId,
                    entry,
                });
            }
        }
    }
    pushLog(engineId, entry) {
        const managed = this.engines.get(engineId);
        if (managed) {
            managed.logBuffer.push(entry);
            if (managed.logBuffer.length > LOG_BUFFER_LIMIT) {
                managed.logBuffer.shift();
            }
        }
        for (const [windowId, engineIds] of this.logSubscribers.entries()) {
            if (!engineIds.has(engineId))
                continue;
            const window = electron_1.BrowserWindow.fromId(windowId);
            if (window && !window.isDestroyed()) {
                (0, channels_1.sendToRenderer)(window, "neud:engines:log", entry);
            }
        }
    }
    validateEngineBeforeRun(engineId) {
        const genericValidation = this.genericScraper.validateForStart(engineId, this.credentials.hasCredentials(engineId));
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
    async spawnWorker(engineId) {
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
        const adapter = typeof engine?.config?.adapter === "string" ? engine.config.adapter : null;
        const entryPath = (0, app_paths_1.getWorkerEntryPath)(this.paths);
        const cwd = (0, app_paths_1.getWorkerCwd)(this.paths);
        const hostId = this.host.getHostId();
        const logFile = path_1.default.join(this.paths.engineLogs, `${engineId}.log`);
        const browserUserDataDir = path_1.default.join(this.paths.browserData, engineId);
        fs_1.default.mkdirSync(browserUserDataDir, { recursive: true });
        fs_1.default.mkdirSync(this.paths.cookies, { recursive: true });
        const child = (0, process_manager_1.spawnNodeProcess)({
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
                const message = (0, redact_1.redactLogLine)(chunk, secrets);
                this.pushLog(engineId, {
                    engineId,
                    stream: "stdout",
                    message,
                    timestamp: new Date().toISOString(),
                });
            },
            onStderr: (chunk) => {
                const secrets = this.credentials.getRedactionValues(engineId);
                const message = (0, redact_1.redactLogLine)(chunk, secrets);
                this.pushLog(engineId, {
                    engineId,
                    stream: "stderr",
                    message,
                    timestamp: new Date().toISOString(),
                });
            },
        });
        const pid = child.pid ?? 0;
        const managed = {
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
    buildWorkerEnvironment(input) {
        const env = { ...process.env };
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
exports.EngineManager = EngineManager;
