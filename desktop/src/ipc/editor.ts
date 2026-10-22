import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import type { AuthLicenseManager } from "../services/auth-license-manager";
import type { DeveloperToolsService } from "../services/developer-tools-service";
import { persistEditableGraphicSchema } from "../services/editor-editable-schema-persist";
import type { LocalDataService } from "../services/local-data-service";
import {
  closeDisplaySettingsWindow,
  openDisplaySettingsWindow,
} from "../services/display-settings-window-manager";
import {
  closeGraphicEditorWindow,
  configureGraphicEditorClosePersistence,
  openGraphicEditorWindow,
  requestGraphicEditorClose,
  updateGraphicEditorDirtyFromContents,
  updateGraphicEditorSnapshotFromContents,
} from "../services/graphic-editor-window-manager";
import { registerIpcHandler, toNeudChannel } from "./channels";

type OpenWindowPayload = {
  projectId: string;
  displayId: string;
  projectSlug?: string;
  title?: string;
};

function parseOpenWindowPayload(payload: unknown, defaultTitle: string): OpenWindowPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid window payload.");
  }
  const record = payload as Record<string, unknown>;
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
  const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
  const projectSlug =
    typeof record.projectSlug === "string" ? record.projectSlug.trim() : undefined;
  const title =
    typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : defaultTitle;
  if (!projectId || !displayId) {
    throw new Error("Project and display are required.");
  }
  return { projectId, displayId, projectSlug, title };
}

export function registerEditorIpc(input: {
  data: LocalDataService;
  auth: AuthLicenseManager;
  developerTools: DeveloperToolsService;
}) {
  configureGraphicEditorClosePersistence({
    auth: input.auth,
    developerTools: input.developerTools,
  });

  ipcMain.on(
    toNeudChannel("editor:dirtyStateChanged"),
    (event, payload: unknown) => {
      if (!payload || typeof payload !== "object") {
        return;
      }
      const record = payload as Record<string, unknown>;
      if (typeof record.dirty !== "boolean") {
        return;
      }
      updateGraphicEditorDirtyFromContents(event.sender, record.dirty);
    },
  );

  ipcMain.on(toNeudChannel("editor:snapshotUpdated"), (event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const record = payload as Record<string, unknown>;
    updateGraphicEditorSnapshotFromContents(event.sender, record.editableGraphicSchema);
  });

  registerIpcHandler("neud:editor:getEditableSchema", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid editor schema payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectSlug =
      typeof record.projectSlug === "string" ? record.projectSlug.trim() : "";
    const displayId =
      typeof record.displayId === "string" ? record.displayId.trim() : "";
    if (!projectSlug || !displayId) {
      throw new Error("Project slug and display are required.");
    }
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to use the graphic editor.");
    }
    return { result: input.developerTools.getEditableGraphicSchema(projectSlug, displayId) };
  });

  registerIpcHandler("neud:editor:saveEditableSchema", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid editor save payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectSlug =
      typeof record.projectSlug === "string" ? record.projectSlug.trim() : "";
    const displayId =
      typeof record.displayId === "string" ? record.displayId.trim() : "";
    const schema = record.editableGraphicSchema ?? record.schema;
    if (!projectSlug || !displayId) {
      throw new Error("Project slug and display are required.");
    }
    if (!schema || typeof schema !== "object") {
      throw new Error("Editable graphic schema is required.");
    }
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to save the graphic editor draft.");
    }
    const result = persistEditableGraphicSchema({
      auth: input.auth,
      developerTools: input.developerTools,
      projectSlug,
      displayId,
      schema,
    });
    return { result };
  });

  registerIpcHandler("neud:editor:importDisplayAsset", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid editor import asset payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectSlug =
      typeof record.projectSlug === "string" ? record.projectSlug.trim() : "";
    const displayId =
      typeof record.displayId === "string" ? record.displayId.trim() : "";
    const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";
    const mimeType = typeof record.mimeType === "string" ? record.mimeType : undefined;
    const dataBase64 = typeof record.dataBase64 === "string" ? record.dataBase64 : "";
    if (!projectSlug || !displayId || !fileName) {
      throw new Error("Project, display, and file name are required.");
    }
    if (!dataBase64) {
      throw new Error("Asset data is required.");
    }
    if (!input.auth.isAccessAllowed()) {
      throw new Error("Sign in to import display assets.");
    }
    console.info("[neud-editor-save] ipc importDisplayAsset", { projectSlug, displayId, fileName });
    const result = input.developerTools.importDisplayAsset(projectSlug, displayId, {
      fileName,
      mimeType,
      dataBase64,
    });
    return { result };
  });

  registerIpcHandler("neud:editor:pickImageFile", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Import Image",
      properties: ["openFile"] as ("openFile")[],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
        },
      ],
    };
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) {
      return { canceled: true as const };
    }
    const filePath = picked.filePaths[0]!;
    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const mimeType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : ext === ".svg"
                ? "image/svg+xml"
                : "application/octet-stream";
    return {
      canceled: false as const,
      fileName,
      mimeType,
      dataBase64: buffer.toString("base64"),
    };
  });

  registerIpcHandler("neud:editor:open", (_event, payload: unknown) => {
    const parsed = parseOpenWindowPayload(payload, "Graphic Editor");
    const userId = input.auth.getAuthenticatedUser()?.userId;
    if (!userId) {
      throw new Error("Sign in to open the graphic editor.");
    }

    const baseUrl = input.data.getViewerBaseUrl().replace(/\/$/, "");
    const params = new URLSearchParams({
      projectId: parsed.projectId,
      displayId: parsed.displayId,
    });
    if (parsed.projectSlug) {
      params.set("projectSlug", parsed.projectSlug);
    }
    const editorUrl = `${baseUrl}/editor/graphic?${params.toString()}`;

    if (!parsed.projectSlug) {
      throw new Error("Project slug is required to open the graphic editor.");
    }

    openGraphicEditorWindow({
      userId,
      projectId: parsed.projectId,
      projectSlug: parsed.projectSlug,
      displayId: parsed.displayId,
      title: parsed.title ?? "Graphic Editor",
      editorUrl,
    });
    return { ok: true, editorUrl };
  });

  registerIpcHandler("neud:editor:requestClose", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("Unable to close graphic editor window.");
    }
    requestGraphicEditorClose(window);
    return { ok: true };
  });

  registerIpcHandler("neud:editor:close", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid editor close payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
    if (!projectId || !displayId) {
      throw new Error("Editor project and display are required.");
    }
    const userId = input.auth.getAuthenticatedUser()?.userId ?? undefined;
    closeGraphicEditorWindow({ userId, projectId, displayId });
    return { ok: true };
  });

  registerIpcHandler("neud:displaySettings:open", (_event, payload: unknown) => {
    const parsed = parseOpenWindowPayload(payload, "Display Settings");
    const userId = input.auth.getAuthenticatedUser()?.userId;
    if (!userId) {
      throw new Error("Sign in to open display settings.");
    }

    const baseUrl = input.data.getViewerBaseUrl().replace(/\/$/, "");
    // Prefer slug path when available; fall back to projectId route.
    const slugOrId = parsed.projectSlug || parsed.projectId;
    const settingsUrl = `${baseUrl}/projects/${encodeURIComponent(slugOrId)}/displays/${encodeURIComponent(parsed.displayId)}/edit?window=settings`;

    openDisplaySettingsWindow({
      userId,
      projectId: parsed.projectId,
      displayId: parsed.displayId,
      title: parsed.title ?? "Display Settings",
      settingsUrl,
    });
    return { ok: true, settingsUrl };
  });

  registerIpcHandler("neud:displaySettings:close", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid display settings close payload.");
    }
    const record = payload as Record<string, unknown>;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
    if (!projectId || !displayId) {
      throw new Error("Project and display are required.");
    }
    const userId = input.auth.getAuthenticatedUser()?.userId ?? undefined;
    closeDisplaySettingsWindow({ userId, projectId, displayId });
    return { ok: true };
  });
}
