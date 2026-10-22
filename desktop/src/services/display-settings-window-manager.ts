import path from "path";
import { BrowserWindow, screen } from "electron";

type SettingsWindowKey = string;

type SettingsWindowRecord = {
  window: BrowserWindow;
  key: SettingsWindowKey;
};

const settingsWindows = new Map<SettingsWindowKey, SettingsWindowRecord>();

function buildSettingsKey(input: {
  userId: string;
  projectId: string;
  displayId: string;
}): SettingsWindowKey {
  return `${input.userId}:${input.projectId}:${input.displayId}`;
}

export function openDisplaySettingsWindow(input: {
  userId: string;
  projectId: string;
  displayId: string;
  title: string;
  settingsUrl: string;
}): BrowserWindow {
  const key = buildSettingsKey(input);
  const existing = settingsWindows.get(key);
  if (existing && !existing.window.isDestroyed()) {
    existing.window.focus();
    return existing.window;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1200, workArea.width - 40);
  const height = Math.min(900, workArea.height - 40);
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);
  const preloadPath = path.join(__dirname, "preload.js");

  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 900,
    minHeight: 640,
    resizable: true,
    fullscreen: false,
    fullscreenable: true,
    title: input.title,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setMenuBarVisibility(false);
  window.on("closed", () => {
    settingsWindows.delete(key);
  });

  settingsWindows.set(key, { window, key });
  void window.loadURL(input.settingsUrl);
  return window;
}

export function closeDisplaySettingsWindow(input: {
  userId?: string;
  projectId: string;
  displayId: string;
}): void {
  for (const [key, record] of settingsWindows.entries()) {
    if (input.userId && !key.startsWith(`${input.userId}:`)) {
      continue;
    }
    if (!key.endsWith(`:${input.projectId}:${input.displayId}`)) {
      continue;
    }
    if (!record.window.isDestroyed()) {
      record.window.close();
    }
    settingsWindows.delete(key);
  }
}

export function closeAllDisplaySettingsWindows(): void {
  for (const record of settingsWindows.values()) {
    if (!record.window.isDestroyed()) {
      record.window.close();
    }
  }
  settingsWindows.clear();
}
