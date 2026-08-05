import { app, Menu, shell, type BrowserWindow } from "electron";
import { triggerHelpMenuCheckForUpdates } from "../services/auto-update-service";

export const APPLICATION_MENU_LABELS = ["File", "Edit", "View", "Window", "Help"] as const;

let clearLocalSessionHandler: (() => void) | null = null;

export function setClearLocalSessionHandler(handler: (() => void) | null) {
  clearLocalSessionHandler = handler;
}

export function buildApplicationMenu(getMainWindow: () => BrowserWindow | null): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => {
            app.quit();
          },
        },
      ],
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
