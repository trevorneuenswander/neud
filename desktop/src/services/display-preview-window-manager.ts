import { app, screen } from "electron";
import fs from "fs";
import path from "path";
import { BrowserWindow } from "electron";

const PREVIEW_WINDOW_DIAG =
  process.env.NEUD_PREVIEW_WINDOW_DIAG === "1" ||
  process.env.NEUD_DISPLAY_RENDERING_DIAG === "1";

function appendPreviewWindowDiagnostic(entry: Record<string, unknown>): void {
  if (!PREVIEW_WINDOW_DIAG) {
    return;
  }
  try {
    const filePath = path.join(
      app.getPath("userData"),
      "preview-window-runtime-diagnostic.jsonl",
    );
    fs.appendFileSync(
      filePath,
      `${JSON.stringify({ capturedAt: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    // Diagnostic-only; ignore write failures.
  }
}

function capturePreviewWindowState(window: BrowserWindow, label: string): void {
  if (!PREVIEW_WINDOW_DIAG || window.isDestroyed()) {
    return;
  }
  appendPreviewWindowDiagnostic({
    label,
    webContentsUrl: window.webContents.getURL(),
    bounds: window.getBounds(),
    isResizable: window.isResizable(),
    isMaximizable: window.isMaximizable(),
    isFullScreen: window.isFullScreen(),
    isKiosk: window.isKiosk(),
    minimumSize: window.getMinimumSize(),
    maximumSize: window.getMaximumSize(),
  });
}

function buildWindowFitLoadUrl(input: {
  viewerUrl: string;
  displayWidth: number;
  displayHeight: number;
}): string {
  const target = new URL(input.viewerUrl);
  const params = new URLSearchParams({
    target: input.viewerUrl,
    width: String(input.displayWidth),
    height: String(input.displayHeight),
  });
  return `${target.origin}/display/window-fit?${params.toString()}`;
}

type PreviewWindowKey = string;

type PreviewWindowRecord = {
  window: BrowserWindow;
  key: PreviewWindowKey;
};

const previewWindows = new Map<PreviewWindowKey, PreviewWindowRecord>();
const DEFAULT_DISPLAY_WIDTH = 1920;
const DEFAULT_DISPLAY_HEIGHT = 1080;
const VIEWER_MIN_WIDTH = 480;

function resolveViewerMinimumSize(displayWidth: number, displayHeight: number) {
  const minWidth = VIEWER_MIN_WIDTH;
  const minHeight = Math.max(
    1,
    Math.round((minWidth * displayHeight) / displayWidth),
  );
  return { minWidth, minHeight };
}

function buildPreviewKey(input: {
  userId: string;
  projectId: string;
  displayId: string;
}): PreviewWindowKey {
  return `${input.userId}:${input.projectId}:${input.displayId}`;
}

function resolveDisplayWindowBounds(displayWidth: number, displayHeight: number) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const aspectRatio = displayWidth / displayHeight;
  const { minWidth, minHeight } = resolveViewerMinimumSize(
    displayWidth,
    displayHeight,
  );

  let width = Math.min(displayWidth, workArea.width);
  let height = Math.round(width / aspectRatio);

  if (height > workArea.height) {
    height = workArea.height;
    width = Math.round(height * aspectRatio);
  }

  width = Math.max(minWidth, width);
  height = Math.round(width / aspectRatio);
  if (height < minHeight) {
    height = minHeight;
    width = Math.round(height * aspectRatio);
  }

  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);

  return { width, height, x, y, minWidth, minHeight, aspectRatio };
}

export function openDisplayPreviewWindow(input: {
  userId: string;
  projectId: string;
  displayId: string;
  title: string;
  viewerUrl: string;
  displayWidth?: number;
  displayHeight?: number;
}): BrowserWindow {
  const key = buildPreviewKey(input);
  const existing = previewWindows.get(key);
  const displayWidth = input.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
  const displayHeight = input.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
  const windowAspectRatio = displayWidth / displayHeight;
  const { minWidth, minHeight } = resolveViewerMinimumSize(
    displayWidth,
    displayHeight,
  );

  if (existing && !existing.window.isDestroyed()) {
    console.debug("[PreviewWindow] focus-existing", { key });
    existing.window.setAspectRatio(windowAspectRatio);
    existing.window.setMinimumSize(minWidth, minHeight);
    appendPreviewWindowDiagnostic({
      label: "focus-existing",
      key,
      webContentsUrl: existing.window.webContents.getURL(),
      bounds: existing.window.getBounds(),
      isResizable: existing.window.isResizable(),
      windowAspectRatio,
      minWidth,
      minHeight,
    });
    capturePreviewWindowState(existing.window, "focus-existing-state");
    existing.window.focus();
    return existing.window;
  }

  const bounds = resolveDisplayWindowBounds(displayWidth, displayHeight);
  const loadUrl = buildWindowFitLoadUrl({
    viewerUrl: input.viewerUrl,
    displayWidth,
    displayHeight,
  });

  console.debug("[PreviewWindow] create", {
    key,
    viewerUrl: input.viewerUrl,
    loadUrl,
    displayWidth,
    displayHeight,
    bounds,
  });

  const preloadPath = path.join(__dirname, "preload.js");

  appendPreviewWindowDiagnostic({
    label: "create-options",
    key,
    viewerUrl: input.viewerUrl,
    loadUrl,
    displayWidth,
    displayHeight,
    bounds,
    browserWindowOptions: {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: bounds.minWidth,
      minHeight: bounds.minHeight,
      windowAspectRatio: bounds.aspectRatio,
      resizable: true,
      fullscreen: false,
      fullscreenable: true,
      title: input.title,
      autoHideMenuBar: true,
      show: true,
      transparent: false,
    },
  });

  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    resizable: true,
    fullscreen: false,
    fullscreenable: true,
    title: input.title,
    autoHideMenuBar: true,
    show: true,
    transparent: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Lock outer window bounds to the display's native aspect ratio while resizing.
  // Electron applies this to the full window including frame; window-fit uses
  // contain scaling so the graphic is not stretched if client area differs slightly.
  window.setAspectRatio(windowAspectRatio);

  appendPreviewWindowDiagnostic({
    label: "aspect-ratio-lock",
    key,
    windowAspectRatio,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    displayWidth,
    displayHeight,
  });

  if (PREVIEW_WINDOW_DIAG) {
    const logWindowEvent = (label: string, args: unknown[] = []) => {
      appendPreviewWindowDiagnostic({
        label,
        key,
        args,
        ...(!window.isDestroyed()
          ? {
              bounds: window.getBounds(),
              isResizable: window.isResizable(),
            }
          : {}),
      });
    };
    window.on("resize", () => logWindowEvent("window-resize"));
    window.on("will-resize", (event, newBounds) =>
      logWindowEvent("window-will-resize", [newBounds]),
    );
    window.on("resized", () => logWindowEvent("window-resized"));
    window.webContents.on("did-start-navigation", (_event, url) => {
      appendPreviewWindowDiagnostic({ label: "did-start-navigation", key, url });
    });
    window.webContents.on("did-finish-load", () => {
      capturePreviewWindowState(window, "did-finish-load");
      if (process.env.NEUD_DISPLAY_RENDERING_DIAG_RESIZE_PROBE === "1") {
        const before = window.getBounds();
        appendPreviewWindowDiagnostic({
          label: "programmatic-resize-before",
          key,
          bounds: before,
          isResizable: window.isResizable(),
          minimumSize: window.getMinimumSize(),
          maximumSize: window.getMaximumSize(),
        });
        window.setSize(before.width + 48, before.height + 32);
        appendPreviewWindowDiagnostic({
          label: "programmatic-resize-after-setSize",
          key,
          bounds: window.getBounds(),
          isResizable: window.isResizable(),
        });
        capturePreviewWindowState(window, "after-programmatic-resize");
      }
    });
  }

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url === loadUrl || url === input.viewerUrl) {
      return;
    }

    try {
      const initial = new URL(input.viewerUrl);
      const next = new URL(url);
      const sameOrigin = next.origin === initial.origin;
      const allowedPath =
        next.pathname.startsWith(initial.pathname) ||
        next.pathname.includes("/api/display-html/") ||
        next.pathname.includes("/api/display/") ||
        next.pathname.startsWith("/display/");
      if (sameOrigin && allowedPath) {
        return;
      }
    } catch {
      // Fall through to prevent navigation.
    }

    event.preventDefault();
  });

  void window.loadURL(loadUrl);
  if (PREVIEW_WINDOW_DIAG) {
    window.webContents.once("did-finish-load", () => {
      capturePreviewWindowState(window, "after-loadURL-finish");
    });
  }
  previewWindows.set(key, { window, key });
  window.on("closed", () => {
    console.debug("[PreviewWindow] closed", { key });
    previewWindows.delete(key);
  });

  return window;
}

export function closeDisplayPreviewWindow(input: {
  userId?: string;
  projectId: string;
  displayId: string;
}): void {
  for (const [key, record] of previewWindows.entries()) {
    if (!key.includes(`:${input.projectId}:${input.displayId}`)) continue;
    if (input.userId && !key.startsWith(`${input.userId}:`)) continue;
    if (!record.window.isDestroyed()) {
      record.window.close();
    }
    previewWindows.delete(key);
  }
}

export function closeAllDisplayPreviewWindows(): void {
  for (const record of previewWindows.values()) {
    if (!record.window.isDestroyed()) {
      record.window.close();
    }
  }
  previewWindows.clear();
}

export function closeDisplayViewerWindows(displaySlug: string): void {
  const needle = `/displays/${displaySlug}`;

  for (const [key, record] of previewWindows.entries()) {
    if (record.window.isDestroyed()) {
      previewWindows.delete(key);
      continue;
    }

    const url = record.window.webContents.getURL();
    if (url.includes(needle)) {
      console.debug("[PreviewWindow] close-viewer", { key, url });
      record.window.close();
      previewWindows.delete(key);
    }
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    const url = window.webContents.getURL();
    if (!url.includes(needle)) continue;
    console.debug("[PreviewWindow] close-untracked-viewer", { url });
    window.close();
  }
}

const PLATFORM_DISPLAY_SLUGS = [
  "pylon",
  "lower-ticker-v5",
  "new-bid-display-v1",
  "new-ticker-v1",
] as const;

export function closeAllPlatformDisplayViewerWindows(): void {
  for (const slug of PLATFORM_DISPLAY_SLUGS) {
    closeDisplayViewerWindows(slug);
  }
}

export function reconcileDisplayViewerWindows(
  displaySlug: string,
  viewerBaseUrl: string,
): void {
  const needle = `/displays/${displaySlug}`;
  const targetUrl = `${viewerBaseUrl.replace(/\/$/, "")}/displays/${displaySlug}`;

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    const url = window.webContents.getURL();
    if (!url.includes(needle)) continue;
    console.debug("[PreviewWindow] reconcile-viewer", { url, targetUrl });
    void window.webContents.loadURL(targetUrl);
  }
}
