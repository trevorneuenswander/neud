import { app, Menu, shell, type BrowserWindow } from "electron";
import { triggerHelpMenuCheckForUpdates } from "../services/auto-update-service";
import { requestGraphicEditorClose } from "../services/graphic-editor-window-manager";

export const APPLICATION_MENU_LABELS = ["File", "Edit", "View", "Window", "Help"] as const;

export type GraphicEditorMenuAction =
  | "save"
  | "saveAs"
  | "importImage"
  | "importNeudGraphic"
  | "exportNeudGraphic"
  | "closeWindow";

let clearLocalSessionHandler: (() => void) | null = null;
let exportDiagnosticsHandler: (() => void) | null = null;
let storedMainApplicationMenu: Menu | null = null;

export function setClearLocalSessionHandler(handler: (() => void) | null) {
  clearLocalSessionHandler = handler;
}

export function setExportDiagnosticsHandler(handler: (() => void) | null) {
  exportDiagnosticsHandler = handler;
}

export function setStoredMainApplicationMenu(menu: Menu | null) {
  storedMainApplicationMenu = menu;
}

export function restoreMainApplicationMenu() {
  if (storedMainApplicationMenu) {
    Menu.setApplicationMenu(storedMainApplicationMenu);
  }
}

function sendGraphicEditorMenuAction(
  editorWindow: BrowserWindow,
  action: GraphicEditorMenuAction,
) {
  if (editorWindow.isDestroyed()) return;
  editorWindow.webContents.send("neud:editor:menu", { action });
}

export function installGraphicEditorApplicationMenu(editorWindow: BrowserWindow): void {
  const send = (action: GraphicEditorMenuAction) =>
    sendGraphicEditorMenuAction(editorWindow, action);

  const fileSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Save Draft",
      accelerator: "CmdOrCtrl+S",
      click: () => send("save"),
    },
    {
      label: "Save As…",
      accelerator: "CmdOrCtrl+Shift+S",
      click: () => send("saveAs"),
    },
    { type: "separator" },
    {
      label: "Import",
      submenu: [
        {
          label: "Image…",
          click: () => send("importImage"),
        },
        {
          label: "NEUD Graphic…",
          click: () => send("importNeudGraphic"),
        },
      ],
    },
    {
      label: "Export",
      submenu: [
        {
          label: "NEUD Graphic…",
          click: () => send("exportNeudGraphic"),
        },
      ],
    },
    { type: "separator" },
    {
      label: "Close Window",
      accelerator: "CmdOrCtrl+W",
      click: () => requestGraphicEditorClose(editorWindow),
    },
  ];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: fileSubmenu,
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            if (!editorWindow.isDestroyed()) {
              editorWindow.webContents.reload();
            }
          },
        },
        {
          label: "Toggle Developer Tools",
          accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: () => {
            if (!editorWindow.isDestroyed()) {
              editorWindow.webContents.toggleDevTools();
            }
          },
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        {
          label: "Close Window",
          accelerator: "CmdOrCtrl+W",
          click: () => requestGraphicEditorClose(editorWindow),
        },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function buildApplicationMenu(getMainWindow: () => BrowserWindow | null): Menu {
  const fileSubmenu: Electron.MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [{ role: "close" }]
      : [
          {
            label: "Exit",
            accelerator: "Alt+F4",
            click: () => {
              app.quit();
            },
          },
        ];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: fileSubmenu,
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            getMainWindow()?.webContents.reload();
          },
        },
        {
          label: "Force Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            getMainWindow()?.webContents.reloadIgnoringCache();
          },
        },
        {
          label: "Toggle Developer Tools",
          accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: () => {
            getMainWindow()?.webContents.toggleDevTools();
          },
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        {
          label: "Close",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            getMainWindow()?.close();
          },
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Clear Local Session",
          accelerator: "CmdOrCtrl+Shift+L",
          click: () => {
            clearLocalSessionHandler?.();
          },
        },
        {
          label: "Check for Updates…",
          click: () => {
            triggerHelpMenuCheckForUpdates();
          },
        },
        {
          label: "Export Diagnostics…",
          click: () => {
            exportDiagnosticsHandler?.();
          },
        },
        { type: "separator" },
        {
          label: "NEUD Documentation",
          click: () => {
            void shell.openExternal("https://github.com/trevorneuenswander/neud");
          },
        },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  return Menu.buildFromTemplate(template);
}

export function popupApplicationMenuLabel(
  menu: Menu,
  label: string,
  window: BrowserWindow,
  x?: number,
  y?: number,
): boolean {
  const item = menu.items.find((entry) => entry.label === label);
  if (!item?.submenu) return false;
  item.submenu.popup({ window, x, y });
  return true;
}
