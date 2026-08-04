import { screen } from "electron";
import path from "path";
import { BrowserWindow } from "electron";

type PreviewWindowKey = string;

type PreviewWindowRecord = {
  window: BrowserWindow;
  key: PreviewWindowKey;
};

const previewWindows = new Map<PreviewWindowKey, PreviewWindowRecord>();
const DEFAULT_DISPLAY_WIDTH = 1920;
const DEFAULT_DISPLAY_HEIGHT = 1080;
const FULLSCREEN_MIN_WIDTH = 640;

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

  let width = Math.min(displayWidth, workArea.width);
  let height = Math.round(width / aspectRatio);

  if (height > workArea.height) {
    height = workArea.height;
    width = Math.round(height * aspectRatio);
  }

  width = Math.max(FULLSCREEN_MIN_WIDTH, width);
  height = Math.max(Math.round(FULLSCREEN_MIN_WIDTH / aspectRatio), height);

  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);

  return { width, height, x, y, aspectRatio };
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
  if (existing && !existing.window.isDestroyed()) {
    console.debug("[PreviewWindow] focus-existing", { key });
    existing.window.focus();
    return existing.window;
  }

  const displayWidth = input.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
  const displayHeight = input.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
  const bounds = resolveDisplayWindowBounds(displayWidth, displayHeight);

  console.debug("[PreviewWindow] create", {
    key,
    viewerUrl: input.viewerUrl,
    displayWidth,
    displayHeight,
    bounds,
  });

  const preloadPath = path.join(__dirname, "preload.js");

  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: FULLSCREEN_MIN_WIDTH,
    minHeight: Math.round(FULLSCREEN_MIN_WIDTH / bounds.aspectRatio),
    title: input.title,
    autoHideMenuBar: true,
    show: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setAspectRatio(bounds.aspectRatio);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url === input.viewerUrl) {
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

  void window.loadURL(input.viewerUrl);
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
