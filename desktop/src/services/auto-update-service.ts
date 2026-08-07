import { app, BrowserWindow } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import { broadcastToAllRenderers } from "../ipc/channels";
import { getCanonicalReleaseVersion } from "../app/release-version";
import { getAppPaths } from "./app-paths";
import {
  ensureUpdatesDirectory,
  writePendingInstalledUpdateMarker,
} from "./pending-installed-update";
import {
  formatMissingUpdateConfigMessage,
  logPackagedUpdateConfigDiagnostics,
  readPackagedUpdateConfigDiagnostics,
} from "./packaged-update-config";
import { appendUpdateSessionLog } from "./update-session-log";

export type UpdateLifecycleState =
  | "unavailable"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export type UpdateCheckReason = "startup" | "manual" | "menu";

export type NeudUpdateStatus = {
  state: UpdateLifecycleState;
  enabled: boolean;
  packaged: boolean;
  currentVersion: string;
  availableVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  downloadSizeLabel: string | null;
  downloadPercent: number | null;
  transferredBytes: number | null;
  totalBytes: number | null;
  bytesPerSecond: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  canInstall: boolean;
  canDownload: boolean;
  promptVisible: boolean;
  lastCheckReason: UpdateCheckReason | null;
  message: string | null;
};

type UpdateActivityLogger = (
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
) => void;

let initialized = false;
let checkInFlight = false;
let startupCheckScheduled = false;
let startupCheckPerformed = false;
let lastCheckReason: UpdateCheckReason = "manual";
let pendingUpdateInfo: UpdateInfo | null = null;
let logActivity: UpdateActivityLogger | null = null;
let helpMenuCheckForUpdatesHandler: (() => void) | null = null;
let getMainWindowRef: (() => BrowserWindow | null) | null = null;

let status: NeudUpdateStatus = createInitialStatus();

function createInitialStatus(): NeudUpdateStatus {
  return {
    state: "idle",
    enabled: false,
    packaged: app.isPackaged,
    currentVersion: safeCurrentVersion(),
    availableVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseDate: null,
    downloadSizeLabel: null,
    downloadPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    lastCheckedAt: null,
    lastError: null,
    canInstall: false,
    canDownload: false,
    promptVisible: false,
    lastCheckReason: null,
    message: null,
  };
}

function safeCurrentVersion(): string {
  try {
    return getCanonicalReleaseVersion();
  } catch {
    return app.getVersion();
  }
}

function isUpdaterEnabled(): boolean {
  if (!app.isPackaged) {
    return false;
  }

  if (process.env.NEUD_DESKTOP_DEV === "1") {
    return false;
  }

  return true;
}

function normalizeReleaseNotes(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    const lines = value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (
          entry &&
          typeof entry === "object" &&
          "note" in entry &&
          typeof (entry as { note?: unknown }).note === "string"
        ) {
          return (entry as { note: string }).note.trim();
        }
        return "";
      })
      .filter(Boolean);
    return lines.length > 0 ? lines.join("\n") : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function formatDownloadSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function publishStatus(next: Partial<NeudUpdateStatus>): NeudUpdateStatus {
  status = {
    ...status,
    ...next,
    currentVersion: safeCurrentVersion(),
    packaged: app.isPackaged,
    enabled: isUpdaterEnabled(),
  };
  broadcastToAllRenderers("updates:status", status);
  return status;
}

function userFacingError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    if (/ENOENT[\s\S]*app-update\.yml/i.test(error.message)) {
      return formatMissingUpdateConfigMessage();
    }
    if (/net::|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(error.message)) {
      return "Unable to reach the update service. NEUD will continue working locally.";
    }
    if (/app-update\.yml/i.test(error.message)) {
      return formatMissingUpdateConfigMessage();
    }
    return error.message;
  }
  return "Unable to check for updates right now.";
}

function assertPackagedUpdateConfigAvailable():
  | { ok: true }
  | { ok: false; message: string } {
  const diagnostics = readPackagedUpdateConfigDiagnostics();
  logPackagedUpdateConfigDiagnostics(logUpdaterEvent);
  if (!diagnostics.fileExists) {
    return { ok: false, message: formatMissingUpdateConfigMessage() };
  }
  if (
    diagnostics.provider !== "github" ||
    !diagnostics.owner ||
    !diagnostics.repo
  ) {
    return { ok: false, message: formatMissingUpdateConfigMessage() };
  }
  return { ok: true };
}

function logUpdaterEvent(type: string, message: string, metadata: Record<string, unknown> = {}) {
  logActivity?.(type, message, {
    updateState: status.state,
    currentVersion: status.currentVersion,
    availableVersion: status.availableVersion,
    lastCheckReason,
    ...metadata,
  });
}

function focusMainWindow() {
  const window = getMainWindowRef?.();
  if (!window || window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

function applyAvailableUpdate(info: UpdateInfo) {
  pendingUpdateInfo = info;
  const availableVersion = info.version ?? null;
  publishStatus({
    state: "available",
    availableVersion,
    releaseName: typeof info.releaseName === "string" ? info.releaseName.trim() || null : null,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate ? new Date(info.releaseDate).toISOString() : null,
    downloadSizeLabel: formatDownloadSize(
      typeof info.files?.[0]?.size === "number" ? info.files[0]!.size : null,
    ),
    downloadPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
    canInstall: false,
    canDownload: true,
    promptVisible: true,
    lastCheckReason,
    message: availableVersion
      ? `NEUD ${availableVersion} is available.`
      : "An update is available.",
  });
  logUpdaterEvent("update.available", "Update available.", {
    availableVersion,
    reason: lastCheckReason,
  });
  if (lastCheckReason === "startup") {
    logUpdaterEvent("startup-check.available", "Startup update available.", {
      availableVersion,
      currentVersion: status.currentVersion,
    });
  }
  focusMainWindow();
}

function handleSilentStartupFailure(error: unknown) {
  const message = userFacingError(error);
  logUpdaterEvent("startup-check.failed", message, {
    currentVersion: status.currentVersion,
  });
  publishStatus({
    state: "idle",
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
    canInstall: false,
    canDownload: false,
    promptVisible: false,
    message: null,
  });
}

export function getUpdateStatus(): NeudUpdateStatus {
  return {
    ...status,
    currentVersion: safeCurrentVersion(),
    packaged: app.isPackaged,
    enabled: isUpdaterEnabled(),
  };
}

export function setHelpMenuCheckForUpdatesHandler(handler: (() => void) | null) {
  helpMenuCheckForUpdatesHandler = handler;
}

export function triggerHelpMenuCheckForUpdates() {
  helpMenuCheckForUpdatesHandler?.();
}

export function initializeAutoUpdateService(options: {
  getMainWindow: () => BrowserWindow | null;
  logActivity?: UpdateActivityLogger;
}): void {
  if (initialized) {
    return;
  }
  initialized = true;
  logActivity = options.logActivity ?? null;
  getMainWindowRef = options.getMainWindow;

  if (!isUpdaterEnabled()) {
    publishStatus({
      state: "unavailable",
      enabled: false,
      message: app.isPackaged
        ? "Updates are unavailable in this build."
        : "Updates are available only in the packaged NEUD desktop app.",
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;

  logPackagedUpdateConfigDiagnostics(logUpdaterEvent);

  autoUpdater.on("checking-for-update", () => {
    publishStatus({
      state: "checking",
      lastError: null,
      message: lastCheckReason === "startup" ? null : "Checking for updates…",
      canInstall: false,
      canDownload: false,
      promptVisible: false,
      lastCheckReason,
    });
    logUpdaterEvent("update.checking", "Checking for NEUD updates.", {
      reason: lastCheckReason,
    });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    checkInFlight = false;
    applyAvailableUpdate(info);
  });

  autoUpdater.on("update-not-available", () => {
    checkInFlight = false;
    if (lastCheckReason === "startup") {
      logUpdaterEvent("startup-check.up-to-date", "NEUD is up to date.", {
        currentVersion: status.currentVersion,
      });
      publishStatus({
        state: "idle",
        availableVersion: null,
        releaseName: null,
        releaseNotes: null,
        releaseDate: null,
        downloadSizeLabel: null,
        downloadPercent: null,
        transferredBytes: null,
        totalBytes: null,
        bytesPerSecond: null,
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
        canInstall: false,
        canDownload: false,
        promptVisible: false,
        lastCheckReason,
        message: null,
      });
      return;
    }

    publishStatus({
      state: "not-available",
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      releaseDate: null,
      downloadSizeLabel: null,
      downloadPercent: null,
      transferredBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      canInstall: false,
      canDownload: false,
      promptVisible: false,
      lastCheckReason,
      message: "NEUD is up to date.",
    });
    logUpdaterEvent("update.not_available", "NEUD is up to date.");
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    publishStatus({
      state: "downloading",
      downloadPercent: progress.percent ?? null,
      transferredBytes: progress.transferred ?? null,
      totalBytes: progress.total ?? null,
      bytesPerSecond: progress.bytesPerSecond ?? null,
      canInstall: false,
      canDownload: false,
      promptVisible: true,
      message: `Downloading update… ${Math.round(progress.percent ?? 0)}%`,
    });
    logUpdaterEvent("update.download_progress", "Update download in progress.", {
      percent: progress.percent ?? null,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    checkInFlight = false;
    publishStatus({
      state: "downloaded",
      availableVersion: info.version ?? status.availableVersion,
      releaseName:
        typeof info.releaseName === "string"
          ? info.releaseName.trim() || status.releaseName
          : status.releaseName,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes) ?? status.releaseNotes,
      releaseDate: info.releaseDate
        ? new Date(info.releaseDate).toISOString()
        : status.releaseDate,
      downloadPercent: 100,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      canInstall: true,
      canDownload: false,
      promptVisible: true,
      message: info.version
        ? `NEUD ${info.version} is ready to install.`
        : "An update is ready to install.",
    });
    logUpdaterEvent("update.downloaded", "Update downloaded and ready to install.", {
      availableVersion: info.version ?? null,
    });
    focusMainWindow();
  });

  autoUpdater.on("error", (error: Error) => {
    checkInFlight = false;
    if (lastCheckReason === "startup") {
      handleSilentStartupFailure(error);
      return;
    }

    const message = userFacingError(error);
    publishStatus({
      state: "error",
      lastCheckedAt: new Date().toISOString(),
      lastError: message,
      canInstall: false,
      canDownload: status.state === "available",
      promptVisible: false,
      message,
    });
    logUpdaterEvent("update.error", message);
  });

  publishStatus({
    state: "idle",
    enabled: true,
    message: null,
  });
}

export function scheduleStartupUpdateCheck(delayMs = 3_000): void {
  if (!isUpdaterEnabled() || startupCheckScheduled || startupCheckPerformed) {
    return;
  }
  startupCheckScheduled = true;
  logUpdaterEvent("startup-check.scheduled", "Startup update check scheduled.", {
    delayMs,
  });
  setTimeout(() => {
    startupCheckScheduled = false;
    if (startupCheckPerformed) {
      return;
    }
    startupCheckPerformed = true;
    void checkForUpdates("startup");
  }, delayMs);
}

export async function checkForUpdates(reason: UpdateCheckReason): Promise<NeudUpdateStatus> {
  lastCheckReason = reason;

  if (!isUpdaterEnabled()) {
    return publishStatus({
      state: "unavailable",
      enabled: false,
      message: "Updates are unavailable in this session.",
      lastCheckReason: reason,
    });
  }

  if (checkInFlight) {
    return getUpdateStatus();
  }

  checkInFlight = true;
  if (reason === "startup") {
    logUpdaterEvent("startup-check.begin", "Startup update check started.", {
      currentVersion: status.currentVersion,
    });
  }
  logUpdaterEvent("update.check_requested", "Update check requested.", { reason });

  const configCheck = assertPackagedUpdateConfigAvailable();
  if (!configCheck.ok) {
    checkInFlight = false;
    if (reason === "startup") {
      handleSilentStartupFailure(new Error(configCheck.message));
      return getUpdateStatus();
    }
    return publishStatus({
      state: "error",
      lastCheckedAt: new Date().toISOString(),
      lastError: configCheck.message,
      canInstall: false,
      canDownload: false,
      promptVisible: false,
      lastCheckReason: reason,
      message: configCheck.message,
    });
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    checkInFlight = false;
    if (reason === "startup") {
      handleSilentStartupFailure(error);
      return getUpdateStatus();
    }
    const message = userFacingError(error);
    return publishStatus({
      state: "error",
      lastCheckedAt: new Date().toISOString(),
      lastError: message,
      canInstall: false,
      canDownload: false,
      promptVisible: false,
      lastCheckReason: reason,
      message,
    });
  }

  return getUpdateStatus();
}

export async function downloadAvailableUpdate():
  Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUpdaterEnabled()) {
    return { ok: false, error: "Updates are unavailable in this session." };
  }

  if (status.state !== "available") {
    return { ok: false, error: "No update is available to download." };
  }

  logUpdaterEvent("update.download_started", "Update download started.", {
    availableVersion: status.availableVersion,
    currentVersion: status.currentVersion,
  });

  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    const message = userFacingError(error);
    publishStatus({
      state: "error",
      lastError: message,
      canDownload: true,
      promptVisible: true,
      message,
    });
    logUpdaterEvent("update.error", message);
    return { ok: false, error: message };
  }
}

export function dismissUpdatePrompt(): NeudUpdateStatus {
  logUpdaterEvent("update.prompt_dismissed", "Update prompt dismissed.", {
    availableVersion: status.availableVersion,
  });
  return publishStatus({
    promptVisible: false,
    message: status.state === "available" ? null : status.message,
  });
}

export function installDownloadedUpdate(): { ok: true } | { ok: false; error: string } {
  if (!isUpdaterEnabled()) {
    return { ok: false, error: "Updates are unavailable in this session." };
  }

  if (status.state !== "downloaded") {
    return { ok: false, error: "No downloaded update is ready to install." };
  }

  const targetVersion = status.availableVersion?.trim();
  if (!targetVersion) {
    return { ok: false, error: "The downloaded update version is unavailable." };
  }

  const sourceVersion = safeCurrentVersion();
  const paths = getAppPaths();
  ensureUpdatesDirectory(paths);
  const marker = writePendingInstalledUpdateMarker(paths, {
    sourceVersion,
    targetVersion,
  });
  appendUpdateSessionLog(paths, {
    event: "install.requested",
    sourceVersion: marker.sourceVersion,
    targetVersion: marker.targetVersion,
    installedVersion: sourceVersion,
    operationId: marker.operationId,
  });
  logUpdaterEvent("update.install_requested", "Restart and install requested.", {
    sourceVersion: marker.sourceVersion,
    targetVersion: marker.targetVersion,
    operationId: marker.operationId,
  });

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });
  return { ok: true };
}
