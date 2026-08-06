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

export type NeudUpdateStatus = {
  state: UpdateLifecycleState;
  enabled: boolean;
  packaged: boolean;
  currentVersion: string;
  availableVersion: string | null;
  downloadPercent: number | null;
  transferredBytes: number | null;
  totalBytes: number | null;
  bytesPerSecond: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  canInstall: boolean;
  message: string | null;
};

type UpdateActivityLogger = (
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
) => void;

let initialized = false;
let checkInFlight = false;
let pendingStartupCheck = false;
let logActivity: UpdateActivityLogger | null = null;
let helpMenuCheckForUpdatesHandler: (() => void) | null = null;

let status: NeudUpdateStatus = createInitialStatus();

function createInitialStatus(): NeudUpdateStatus {
  return {
    state: "idle",
    enabled: false,
    packaged: app.isPackaged,
    currentVersion: safeCurrentVersion(),
    availableVersion: null,
    downloadPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    lastCheckedAt: null,
    lastError: null,
    canInstall: false,
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
    ...metadata,
  });
}

function focusMainWindow(getMainWindow: () => BrowserWindow | null) {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
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

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;

  logPackagedUpdateConfigDiagnostics(logUpdaterEvent);

  autoUpdater.on("checking-for-update", () => {
    publishStatus({
      state: "checking",
      lastError: null,
      message: "Checking for updates…",
      canInstall: false,
    });
    logUpdaterEvent("update.checking", "Checking for NEUD updates.");
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    publishStatus({
      state: "available",
      availableVersion: info.version ?? null,
      message: info.version
        ? `NEUD ${info.version} is available. Downloading update…`
        : "An update is available. Downloading…",
      canInstall: false,
    });
    logUpdaterEvent("update.available", "Update available.", {
      availableVersion: info.version ?? null,
    });
  });

  autoUpdater.on("update-not-available", () => {
    checkInFlight = false;
    publishStatus({
      state: "not-available",
      availableVersion: null,
      downloadPercent: null,
      transferredBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      canInstall: false,
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
      message: `Downloading update… ${Math.round(progress.percent ?? 0)}%`,
      canInstall: false,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    checkInFlight = false;
    publishStatus({
      state: "downloaded",
      availableVersion: info.version ?? status.availableVersion,
      downloadPercent: 100,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      canInstall: true,
      message: info.version
        ? `NEUD ${info.version} is ready to install.`
        : "An update is ready to install.",
    });
    logUpdaterEvent("update.downloaded", "Update downloaded and ready to install.", {
      availableVersion: info.version ?? null,
    });
    focusMainWindow(options.getMainWindow);
  });

  autoUpdater.on("error", (error: Error) => {
    checkInFlight = false;
    const message = userFacingError(error);
    publishStatus({
      state: "error",
      lastCheckedAt: new Date().toISOString(),
      lastError: message,
      canInstall: false,
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

export function scheduleStartupUpdateCheck(delayMs = 15_000): void {
  if (!isUpdaterEnabled() || pendingStartupCheck) {
    return;
  }
  pendingStartupCheck = true;
  setTimeout(() => {
    pendingStartupCheck = false;
    void checkForUpdates("startup");
  }, delayMs);
}

export async function checkForUpdates(
  reason: "startup" | "manual" | "menu",
): Promise<NeudUpdateStatus> {
  if (!isUpdaterEnabled()) {
    return publishStatus({
      state: "unavailable",
      enabled: false,
      message: "Updates are unavailable in this session.",
    });
  }

  if (checkInFlight) {
    return getUpdateStatus();
  }

  checkInFlight = true;
  logUpdaterEvent("update.check_requested", "Update check requested.", { reason });

  const configCheck = assertPackagedUpdateConfigAvailable();
  if (!configCheck.ok) {
    checkInFlight = false;
    return publishStatus({
      state: "error",
      lastCheckedAt: new Date().toISOString(),
      lastError: configCheck.message,
      canInstall: false,
      message: configCheck.message,
    });
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    checkInFlight = false;
    const message = userFacingError(error);
    return publishStatus({
      state: "error",
      lastCheckedAt: new Date().toISOString(),
      lastError: message,
      canInstall: false,
      message,
    });
  }

  return getUpdateStatus();
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
