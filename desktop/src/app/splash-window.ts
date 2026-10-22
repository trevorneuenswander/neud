import path from "path";
import { BrowserWindow, app, screen } from "electron";
import { getCanonicalReleaseVersion } from "./release-version";
import { computeSplashWindowPosition } from "./splash-window-position";

const SPLASH_WIDTH = 420;
const SPLASH_HEIGHT = 260;

let splashWindow: BrowserWindow | null = null;
let splashClosed = false;

function splashHtml(version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>NEUD</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: #f4f4f5;
      user-select: none;
      -webkit-app-region: drag;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .shell {
      width: 100%;
      height: 100%;
      min-height: 100%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 30%, #2a2f38 0%, #121418 70%);
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 18px 50px rgba(0,0,0,0.45);
    }
    .inner {
      text-align: center;
      margin: auto;
    }
    .brand {
      font-size: 42px;
      font-weight: 700;
      letter-spacing: 0.28em;
      margin-left: 0.28em;
    }
    .version {
      margin-top: 10px;
      font-size: 13px;
      letter-spacing: 0.08em;
      color: rgba(244,244,245,0.65);
    }
    .bar {
      margin: 28px auto 0;
      width: 120px;
      height: 2px;
      background: rgba(255,255,255,0.12);
      overflow: hidden;
      border-radius: 999px;
    }
    .bar > i {
      display: block;
      width: 40%;
      height: 100%;
      background: rgba(255,255,255,0.7);
      animation: slide 1.2s ease-in-out infinite;
    }
    @keyframes slide {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(300%); }
    }
  </style>
</head>
<body>
  <div class="shell" data-neud-splash-shell data-neud-splash-vcenter="true">
    <div class="inner" data-neud-splash-content>
      <div class="brand">NEUD</div>
      <div class="version">v${version}</div>
      <div class="bar"><i></i></div>
    </div>
  </div>
</body>
</html>`;
}

export function showStartupSplash(): BrowserWindow {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }
  splashClosed = false;
  const version = getCanonicalReleaseVersion();
  const targetDisplay =
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ??
    screen.getPrimaryDisplay();
  const position = computeSplashWindowPosition(targetDisplay, {
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
  });
  splashWindow = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    x: position.x,
    y: position.y,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    center: false,
    hasShadow: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const html = splashHtml(version);
  void splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splashWindow.once("ready-to-show", () => {
    if (!splashClosed && splashWindow && !splashWindow.isDestroyed()) {
      // Re-assert position in case the OS adjusted the initial create bounds.
      const display =
        screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ??
        screen.getPrimaryDisplay();
      const next = computeSplashWindowPosition(display, {
        width: SPLASH_WIDTH,
        height: SPLASH_HEIGHT,
      });
      splashWindow.setPosition(next.x, next.y, false);
      splashWindow.show();
    }
  });
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
  return splashWindow;
}

export function closeStartupSplash(): void {
  splashClosed = true;
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

export function splashAssetDir(): string {
  return path.join(app.getAppPath(), "dist", "app");
}
