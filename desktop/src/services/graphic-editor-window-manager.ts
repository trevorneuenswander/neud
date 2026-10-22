import path from "path";
import { BrowserWindow, dialog, screen, type WebContents } from "electron";
import type { AuthLicenseManager } from "./auth-license-manager";
import type { DeveloperToolsService } from "./developer-tools-service";
import { persistEditableGraphicSchema } from "./editor-editable-schema-persist";
import {
  installGraphicEditorApplicationMenu,
  restoreMainApplicationMenu,
} from "../menu/application-menu";

type EditorWindowKey = string;

type EditorWindowRecord = {
  window: BrowserWindow;
  key: EditorWindowKey;
  displayId: string;
  projectId: string;
  projectSlug: string;
  dirty: boolean;
  latestSchemaSnapshot: unknown | null;
  saveInProgress: boolean;
  allowClose: boolean;
};

const editorWindows = new Map<EditorWindowKey, EditorWindowRecord>();

let closePersistence: {
  auth: AuthLicenseManager;
  developerTools: DeveloperToolsService;
} | null = null;

export function configureGraphicEditorClosePersistence(input: {
  auth: AuthLicenseManager;
  developerTools: DeveloperToolsService;
}): void {
  closePersistence = input;
}

function buildEditorKey(input: {
  userId: string;
  projectId: string;
  displayId: string;
}): EditorWindowKey {
  return `${input.userId}:${input.projectId}:${input.displayId}`;
}

function findRecordByWindow(window: BrowserWindow): EditorWindowRecord | null {
  for (const record of editorWindows.values()) {
    if (record.window === window) {
      return record;
    }
  }
  return null;
}

function findRecordByWebContents(contents: WebContents): EditorWindowRecord | null {
  const window = BrowserWindow.fromWebContents(contents);
  if (!window) {
    return null;
  }
  return findRecordByWindow(window);
}

function destroyGraphicEditorWindow(record: EditorWindowRecord): void {
  if (record.window.isDestroyed()) {
    return;
  }
  console.info("[editor-close] destroy", {
    projectId: record.projectId,
    displayId: record.displayId,
  });
  record.allowClose = true;
  record.window.destroy();
}

export function requestGraphicEditorClose(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  console.info("[editor-close] requested");
  window.close();
}

function attachGraphicEditorCloseHandler(record: EditorWindowRecord): void {
  const { window } = record;
  window.on("close", (event) => {
    if (record.allowClose) {
      console.info("[editor-close] closed", {
        projectId: record.projectId,
        displayId: record.displayId,
      });
      return;
    }

    event.preventDefault();
    console.info("[editor-close] dirty", {
      dirty: record.dirty,
      projectId: record.projectId,
      displayId: record.displayId,
    });

    if (!record.dirty) {
      record.allowClose = true;
      destroyGraphicEditorWindow(record);
      return;
    }

    void (async () => {
      if (window.isDestroyed()) {
        return;
      }
      console.info("[editor-close] dialog", {
        projectId: record.projectId,
        displayId: record.displayId,
      });
      const { response } = await dialog.showMessageBox(window, {
        type: "question",
        title: "Graphic Editor",
        message: "Save Changes Before Closing?",
        detail: "Your draft has unsaved changes.",
        buttons: ["Save and Close", "Don't Save", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });

      if (response === 2 || window.isDestroyed()) {
        return;
      }

      if (response === 1) {
        record.allowClose = true;
        record.dirty = false;
        destroyGraphicEditorWindow(record);
        return;
      }

      if (!closePersistence) {
        await dialog.showMessageBox(window, {
          type: "error",
          title: "Unable to Save",
          message: "Unable to save changes.",
          detail: "Editor save is not configured.",
          buttons: ["OK"],
        });
        record.dirty = true;
        return;
      }

      if (!record.projectSlug || !record.latestSchemaSnapshot) {
        await dialog.showMessageBox(window, {
          type: "error",
          title: "Unable to Save",
          message: "Unable to save changes.",
          detail: "No draft snapshot is available to save.",
          buttons: ["OK"],
        });
        record.dirty = true;
        return;
      }

      record.saveInProgress = true;
      console.info("[editor-close] save", {
        projectId: record.projectId,
        displayId: record.displayId,
      });
      try {
        persistEditableGraphicSchema({
          auth: closePersistence.auth,
          developerTools: closePersistence.developerTools,
          projectSlug: record.projectSlug,
          displayId: record.displayId,
          schema: record.latestSchemaSnapshot,
        });
        record.dirty = false;
        record.allowClose = true;
        destroyGraphicEditorWindow(record);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unable to save changes.";
        await dialog.showMessageBox(window, {
          type: "error",
          title: "Unable to Save",
          message: "Unable to save changes.",
          detail,
          buttons: ["OK"],
        });
        record.dirty = true;
      } finally {
        record.saveInProgress = false;
      }
    })();
  });
}

export function updateGraphicEditorDirtyFromContents(
  contents: WebContents,
  dirty: boolean,
): void {
  const record = findRecordByWebContents(contents);
  if (!record || record.saveInProgress) {
    return;
  }
  record.dirty = dirty;
}

export function updateGraphicEditorSnapshotFromContents(
  contents: WebContents,
  editableGraphicSchema: unknown,
): void {
  const record = findRecordByWebContents(contents);
  if (!record || !editableGraphicSchema || typeof editableGraphicSchema !== "object") {
    return;
  }
  record.latestSchemaSnapshot = editableGraphicSchema;
}

export function openGraphicEditorWindow(input: {
  userId: string;
  projectId: string;
  projectSlug: string;
  displayId: string;
  title: string;
  editorUrl: string;
}): BrowserWindow {
  const key = buildEditorKey(input);
  const existing = editorWindows.get(key);
  if (existing && !existing.window.isDestroyed()) {
    existing.window.focus();
    return existing.window;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1600, workArea.width - 40);
  const height = Math.min(1000, workArea.height - 40);
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);
  const preloadPath = path.join(__dirname, "preload.js");

  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 1100,
    minHeight: 700,
    resizable: true,
    fullscreen: false,
    fullscreenable: true,
    title: input.title,
    backgroundColor: "#1a2332",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: {
            color: "#1a2332",
            symbolColor: "#e8eef7",
            height: 36,
          },
        }
      : {}),
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const record: EditorWindowRecord = {
    window,
    key,
    displayId: input.displayId,
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    dirty: false,
    latestSchemaSnapshot: null,
    saveInProgress: false,
    allowClose: false,
  };

  window.setMenuBarVisibility(process.platform !== "darwin");
  attachGraphicEditorCloseHandler(record);
  window.on("focus", () => {
    installGraphicEditorApplicationMenu(window);
  });
  window.on("closed", () => {
    editorWindows.delete(key);
    record.dirty = false;
    record.latestSchemaSnapshot = null;
    record.saveInProgress = false;
    record.allowClose = false;
    console.info("[editor-close] closed", {
      projectId: record.projectId,
      displayId: record.displayId,
    });
    restoreMainApplicationMenu();
  });
  installGraphicEditorApplicationMenu(window);

  editorWindows.set(key, record);
  void window.loadURL(input.editorUrl);
  return window;
}

export function closeGraphicEditorWindow(input: {
  userId?: string;
  projectId: string;
  displayId: string;
}): void {
  for (const record of editorWindows.values()) {
    if (input.userId && !record.key.startsWith(`${input.userId}:`)) {
      continue;
    }
    if (record.projectId !== input.projectId || record.displayId !== input.displayId) {
      continue;
    }
    requestGraphicEditorClose(record.window);
  }
}

export function closeAllGraphicEditorWindows(): void {
  for (const record of [...editorWindows.values()]) {
    if (!record.window.isDestroyed()) {
      record.allowClose = true;
      record.window.destroy();
    }
  }
  editorWindows.clear();
}
