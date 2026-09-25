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

  registerIpcHandler("neud:displays:getPinnedViewer", (_event, projectId: unknown) => {
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to load pinned viewer.");
    }
    if (typeof projectId !== "string" || !projectId.trim()) {
      throw new Error("Project id is required.");
    }
    return input.data.getPinnedViewerState(projectId.trim());
  });

  registerIpcHandler("neud:displays:unpinIfPinned", (_event, payload: unknown) => {
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to update pinned viewer.");
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid unpin payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
    if (!projectId || !displayId) {
      throw new Error("Project and display are required.");
    }
    input.data.unpinDisplayIfPinned(projectId, displayId);
    return input.data.getPinnedViewerState(projectId);
  });

  registerIpcHandler("neud:displays:togglePin", (_event, payload: unknown) => {
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to pin displays.");
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid pin payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
    if (!projectId || !displayId) {
      throw new Error("Project and display are required.");
    }
    input.data.togglePinnedDisplay(projectId, displayId);
    return input.data.getPinnedViewerState(projectId);
  });

  registerIpcHandler("neud:displays:patchPinnedViewer", (_event, payload: unknown) => {
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to update pinned viewer.");
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid pinned viewer payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    if (!projectId) {
      throw new Error("Project id is required.");
    }
    const action = typeof record.action === "string" ? record.action : "";
    if (action === "addToStack" && typeof record.sourceDisplayId === "string") {
      const target = record.target;
      if (!target || typeof target !== "object") {
        throw new Error("Stack target is required.");
      }
      const targetRecord = target as Record<string, unknown>;
      if (targetRecord.kind === "display" && typeof targetRecord.displayId === "string") {
        input.data.addPinnedDisplayToStack(projectId, {
          sourceDisplayId: record.sourceDisplayId.trim(),
          target: { kind: "display", displayId: targetRecord.displayId.trim() },
        });
      } else if (targetRecord.kind === "stack" && typeof targetRecord.stackId === "string") {
        input.data.addPinnedDisplayToStack(projectId, {
          sourceDisplayId: record.sourceDisplayId.trim(),
          target: { kind: "stack", stackId: targetRecord.stackId.trim() },
        });
      } else {
        throw new Error("Invalid stack target.");
      }
      return input.data.getPinnedViewerState(projectId);
    }
    if (
      action === "removeFromStack" &&
      typeof record.stackId === "string" &&
      typeof record.displayId === "string"
    ) {
      input.data.removePinnedDisplayFromStack(projectId, {
        stackId: record.stackId.trim(),
        displayId: record.displayId.trim(),
      });
      return input.data.getPinnedViewerState(projectId);
    }
    if (action === "unpinStack" && typeof record.stackId === "string") {
      input.data.unpinPinnedViewerStack(projectId, record.stackId.trim());
      return input.data.getPinnedViewerState(projectId);
    }
    throw new Error("Unsupported pinned viewer action.");
  });

  registerIpcHandler("neud:displays:setPinnedViewerHeight", (_event, payload: unknown) => {
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to resize pinned viewer.");
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid pinned viewer height payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    const viewerHeightPx = Number(record.viewerHeightPx);
    if (!projectId || !Number.isFinite(viewerHeightPx)) {
      throw new Error("Project and viewer height are required.");
    }
    input.data.setPinnedViewerHeight(projectId, viewerHeightPx);
    return input.data.getPinnedViewerState(projectId);
  });
}

export function shutdownDisplayPreviewWindows() {
  closeAllDisplayPreviewWindows();
}

export { closeDisplayPreviewWindow };
