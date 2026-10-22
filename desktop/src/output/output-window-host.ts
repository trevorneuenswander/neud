import path from "node:path";
import { BrowserWindow } from "electron";
import { configureMacOutputWindow, restoreMacOutputWindow } from "../platform/macos/mac-output-presentation";
import { attachOutputCleanFeedGuards } from "./output-clean-feed";
import { outputPresentationMode, type OutputWindowHost } from "./output-engine-core";

type PresentationInput = {
  bounds: { x: number; y: number; width: number; height: number };
  alwaysOnTop: boolean;
  hideCursor: boolean;
  primary: boolean;
  platform: string;
};

function logPresentation(label: string, output: BrowserWindow, input: PresentationInput): void {
  const operator = BrowserWindow.getAllWindows().find(
    (candidate) => candidate !== output && !candidate.isDestroyed(),
  );
  console.info(
    "[output-presentation]",
    JSON.stringify({
      label,
      presentationStrategy: outputPresentationMode(input.platform),
      targetBounds: input.bounds,
      actualBounds: output.isDestroyed() ? null : output.getBounds(),
      electronLevel: input.platform === "darwin" && input.alwaysOnTop ? "screen-saver" : input.alwaysOnTop ? "floating" : "normal",
      windowLevel: input.platform === "darwin" && input.alwaysOnTop ? "status-plus-one" : input.alwaysOnTop ? "floating" : "normal",
      isFullScreen: output.isDestroyed() ? null : output.isFullScreen(),
      operatorFocused: operator ? operator.isFocused() : null,
      outputFocused: output.isDestroyed() ? null : output.isFocused(),
      hideCursorRequested: input.hideCursor,
      cursorPresentationMode: input.platform === "darwin" ? "native-cursor-rect" : "document-css",
    }),
  );
}

function applyMacOutputPresentation(output: BrowserWindow, input: PresentationInput): void {
  if (input.platform !== "darwin" || output.isDestroyed()) return;
  configureMacOutputWindow({
    nativeHandle: output.getNativeWindowHandle(),
    coverSystemUi: input.alwaysOnTop,
    hideCursor: input.hideCursor,
  });
}

function releaseMacOutputPresentation(output: BrowserWindow): void {
  if (process.platform !== "darwin" || output.isDestroyed()) return;
  restoreMacOutputWindow(output.getNativeWindowHandle());
}

function placePresentationWindow(window: BrowserWindow, input: PresentationInput): void {
  window.setBounds(input.bounds);
  if (input.platform === "darwin") {
    if (input.alwaysOnTop) {
      window.setAlwaysOnTop(true, "screen-saver");
    } else {
      window.setAlwaysOnTop(false);
    }
    window.showInactive();
    applyMacOutputPresentation(window, input);
    logPresentation("mac-presentation-window", window, input);
    return;
  }
  window.setAlwaysOnTop(input.alwaysOnTop, "floating");
  window.show();
  window.setFullScreen(true);
  logPresentation("windows-fullscreen", window, input);
}

export class ElectronOutputWindowHost implements OutputWindowHost {
  private readonly windows = new Map<string, BrowserWindow>();
  private readonly cleanups = new Map<string, () => void>();

  open(input: {
    routeId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
    background: string;
    alwaysOnTop: boolean;
    hideCursor: boolean;
    primary: boolean;
    platform: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    this.close(input.routeId);
    try {
      const darwin = input.platform === "darwin";
      const window = new BrowserWindow({
        x: input.bounds.x,
        y: input.bounds.y,
        width: input.bounds.width,
        height: input.bounds.height,
        frame: false,
        // Presentation surface: square corners, no modern macOS window chrome inset.
        roundedCorners: false,
        hasShadow: false,
        transparent: false,
        fullscreen: false,
        fullscreenable: !darwin,
        kiosk: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: true,
        title: "NEUD Output",
        autoHideMenuBar: true,
        backgroundColor: input.background || "#000000",
        skipTaskbar: true,
        focusable: !darwin,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, "..", "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.setMenuBarVisibility(false);
      window.setBounds(input.bounds);
      // Presentation surfaces should not steal pointer work from the operator UI.
      // Cursor hide is handled natively / via CSS; mouse events stay with the operator.
      if (input.hideCursor) {
        try {
          window.setIgnoreMouseEvents(true, { forward: true });
        } catch {
          try {
            window.setIgnoreMouseEvents(true);
          } catch {
            // Older Electron builds without the options form.
          }
        }
      }
      window.webContents.on("before-input-event", (event, keyboard) => {
        if (keyboard.key === "Escape") {
          event.preventDefault();
        }
      });
      const detachCleanFeed = attachOutputCleanFeedGuards(window.webContents, {
        label: "computer-output",
      });
      this.cleanups.set(input.routeId, detachCleanFeed);
      this.windows.set(input.routeId, window);
      window.on("closed", () => {
        if (this.windows.get(input.routeId) === window) {
          this.windows.delete(input.routeId);
        }
        const cleanup = this.cleanups.get(input.routeId);
        this.cleanups.delete(input.routeId);
        cleanup?.();
      });
      return window
        .loadURL(input.url)
        .then(() => {
          if (window.isDestroyed()) return { ok: true as const };
          placePresentationWindow(window, input);
          return { ok: true as const };
        })
        .catch((error: unknown) => {
          this.close(input.routeId);
          return {
            ok: false as const,
            error: error instanceof Error ? error.message : "Output window failed to launch",
          };
        });
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: error instanceof Error ? error.message : "Output window failed to launch",
      });
    }
  }

  reconfigure(input: {
    routeId: string;
    bounds: { x: number; y: number; width: number; height: number };
    alwaysOnTop: boolean;
    hideCursor: boolean;
    platform: string;
  }): void {
    const window = this.windows.get(input.routeId);
    if (!window || window.isDestroyed() || input.platform !== "darwin") return;
    if (input.alwaysOnTop) {
      window.setAlwaysOnTop(true, "screen-saver");
    } else {
      window.setAlwaysOnTop(false);
    }
    applyMacOutputPresentation(window, {
      bounds: input.bounds,
      alwaysOnTop: input.alwaysOnTop,
      hideCursor: input.hideCursor,
      primary: false,
      platform: input.platform,
    });
  }

  close(routeId: string): void {
    const cleanup = this.cleanups.get(routeId);
    this.cleanups.delete(routeId);
    cleanup?.();
    const window = this.windows.get(routeId);
    this.windows.delete(routeId);
    if (!window || window.isDestroyed()) return;
    releaseMacOutputPresentation(window);
    window.setAlwaysOnTop(false);
    if (window.isFullScreen()) {
      window.setFullScreen(false);
    }
    window.close();
  }

  closeAll(): void {
    for (const routeId of [...this.windows.keys()]) {
      this.close(routeId);
    }
  }
}
