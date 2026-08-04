import { BrowserWindow } from "electron";
import type { AuthLicenseManager } from "../services/auth-license-manager";
import type { LocalDataService } from "../services/local-data-service";
import {
  closeAllDisplayPreviewWindows,
  closeDisplayPreviewWindow,
  openDisplayPreviewWindow,
} from "../services/display-preview-window-manager";
import { registerIpcHandler } from "./channels";

type OpenPreviewPayload = {
  projectId: string;
  displayId: string;
  title: string;
  viewerUrl: string;
  displayWidth?: number;
  displayHeight?: number;
};

type SaveDisplayOrderPayload = {
  projectId: string;
  displayIds: string[];
};

function parseOpenPreviewPayload(payload: unknown): OpenPreviewPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid preview payload.");
  }
  const record = payload as Record<string, unknown>;
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
  const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "Display Preview";
  const viewerUrl = typeof record.viewerUrl === "string" ? record.viewerUrl.trim() : "";
  const displayWidth =
    typeof record.displayWidth === "number" && Number.isFinite(record.displayWidth)
      ? record.displayWidth
      : undefined;
  const displayHeight =
    typeof record.displayHeight === "number" && Number.isFinite(record.displayHeight)
      ? record.displayHeight
      : undefined;
  if (!projectId || !displayId || !viewerUrl) {
    throw new Error("Preview project, display, and URL are required.");
  }
  return { projectId, displayId, title, viewerUrl, displayWidth, displayHeight };
}

function parseSaveDisplayOrderPayload(payload: unknown): SaveDisplayOrderPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid display order payload.");
  }
  const record = payload as Record<string, unknown>;
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
  const displayIds = Array.isArray(record.displayIds)
    ? record.displayIds.map((value) => String(value))
    : [];
  if (!projectId || displayIds.length === 0) {
    throw new Error("Project and display order are required.");
  }
  return { projectId, displayIds };
}

export function registerDisplaysIpc(input: {
  data: LocalDataService;
  auth: AuthLicenseManager;
}) {
  registerIpcHandler("neud:displays:openPreview", (_event, payload: unknown) => {
    const parsed = parseOpenPreviewPayload(payload);
    const userId = input.auth.getAuthenticatedUser()?.userId;
    if (!userId) {
      throw new Error("Sign in to preview displays.");
    }
    openDisplayPreviewWindow({
      userId,
      projectId: parsed.projectId,
      displayId: parsed.displayId,
      title: parsed.title,
      viewerUrl: parsed.viewerUrl,
      displayWidth: parsed.displayWidth,
      displayHeight: parsed.displayHeight,
    });
    return { ok: true };
  });

  registerIpcHandler("neud:displays:closePreview", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid preview close payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
    if (!projectId || !displayId) {
      throw new Error("Preview project and display are required.");
    }
    const userId = input.auth.getAuthenticatedUser()?.userId ?? undefined;
    closeDisplayPreviewWindow({ userId, projectId, displayId });
    return { ok: true };
  });

  registerIpcHandler("neud:displays:saveOrder", (_event, payload: unknown) => {
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to save display order.");
    }
    const parsed = parseSaveDisplayOrderPayload(payload);
    return input.data.saveUserDisplayOrder(parsed.projectId, parsed.displayIds);
  });

  registerIpcHandler("neud:displays:getOrder", (_event, projectId: unknown) => {
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to load display order.");
    }
    if (typeof projectId !== "string" || !projectId.trim()) {
      throw new Error("Project id is required.");
    }
    return {
      order: input.data.getUserDisplayOrder(projectId.trim()),
      databasePath: input.data.getDatabasePath(),
    };
  });
}

export function shutdownDisplayPreviewWindows() {
  closeAllDisplayPreviewWindows();
}

export { closeDisplayPreviewWindow };
