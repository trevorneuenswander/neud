import { app, Menu, BrowserWindow, shell } from "electron";
import { isAllowedExternalUrl } from "../services/external-url";
import type { MachineRegistration } from "../services/machine-registration";
import { getCanonicalReleaseVersion } from "../app/release-version";
import {
  APPLICATION_MENU_LABELS,
  buildApplicationMenu,
  popupApplicationMenuLabel,
} from "../menu/application-menu";
import { registerIpcHandler } from "./channels";
import type { DiagnosticsExportResult } from "../services/diagnostics-export-service";

let applicationMenu: Menu | null = null;

export type CloseRequestResponse = "cancel" | "confirm" | "force";

export function registerAppIpc(
  host: MachineRegistration,
  getMainWindow: () => BrowserWindow | null,
  respondCloseRequest?: (action: CloseRequestResponse) => void,
  exportDiagnostics?: () => Promise<DiagnosticsExportResult>,
) {
  applicationMenu = buildApplicationMenu(getMainWindow);
  Menu.setApplicationMenu(applicationMenu);

  registerIpcHandler("neud:app:getVersion", () => getCanonicalReleaseVersion());
  registerIpcHandler("neud:app:getPlatform", () => process.platform);
  registerIpcHandler("neud:app:getHostId", () => host.getHostId());
  registerIpcHandler("neud:app:openExternal", (_event, url: unknown) => {
    if (typeof url !== "string" || !url.trim()) {
      return { ok: false as const, error: "A valid URL is required." };
    }
    if (!isAllowedExternalUrl(url)) {
      return { ok: false as const, error: "External URL is not allowed." };
    }
    void shell.openExternal(url);
    return { ok: true as const };
  });
  registerIpcHandler("neud:app:getMenuLabels", () => [...APPLICATION_MENU_LABELS]);
  registerIpcHandler("neud:app:getWindowState", () => {
    const window = getMainWindow();
    return {
      isMaximized: window?.isMaximized() ?? false,
    };
  });
  registerIpcHandler(
    "neud:app:windowControl",
    (event, action: unknown): { isMaximized: boolean } | false => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || window.isDestroyed()) {
        return false;
      }

      if (action === "minimize") {
        window.minimize();
      } else if (action === "maximize") {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      } else if (action === "close") {
        window.close();
      } else {
        return false;
      }

      return { isMaximized: window.isMaximized() };
    },
  );
  registerIpcHandler(
    "neud:app:popupMenu",
    (event, label: unknown, position?: { x?: number; y?: number }) => {
      if (typeof label !== "string" || !label.trim()) {
        return false;
      }
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || window.isDestroyed() || !applicationMenu) {
        return false;
      }
      return popupApplicationMenuLabel(
        applicationMenu,
        label,
        window,
        typeof position?.x === "number" ? position.x : undefined,
        typeof position?.y === "number" ? position.y : undefined,
      );
    },
  );

  registerIpcHandler("neud:app:exportDiagnostics", async () => {
    if (!exportDiagnostics) {
      return { ok: false as const, error: "Diagnostics export is unavailable." };
    }
    return exportDiagnostics();
  });

  registerIpcHandler("neud:app:respondCloseRequest", (_event, action: unknown) => {
    if (
      action !== "cancel" &&
      action !== "confirm" &&
      action !== "force"
    ) {
      return { ok: false };
    }
    respondCloseRequest?.(action);
    return { ok: true };
  });
}
