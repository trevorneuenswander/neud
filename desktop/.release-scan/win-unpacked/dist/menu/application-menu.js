"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPLICATION_MENU_LABELS = void 0;
exports.setClearLocalSessionHandler = setClearLocalSessionHandler;
exports.buildApplicationMenu = buildApplicationMenu;
exports.popupApplicationMenuLabel = popupApplicationMenuLabel;
const electron_1 = require("electron");
exports.APPLICATION_MENU_LABELS = ["File", "Edit", "View", "Window", "Help"];
let clearLocalSessionHandler = null;
function setClearLocalSessionHandler(handler) {
    clearLocalSessionHandler = handler;
}
function buildApplicationMenu(getMainWindow) {
    const template = [
        {
            label: "File",
            submenu: [
                {
                    label: "Exit",
                    accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
                    click: () => {
                        electron_1.app.quit();
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
                { type: "separator" },
                {
                    label: "NEUD Documentation",
                    click: () => {
                        void electron_1.shell.openExternal("https://github.com/");
                    },
                },
            ],
        },
    ];
    if (process.platform === "darwin") {
        template.unshift({
            label: electron_1.app.name,
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
    return electron_1.Menu.buildFromTemplate(template);
}
function popupApplicationMenuLabel(menu, label, window, x, y) {
    const item = menu.items.find((entry) => entry.label === label);
    if (!item?.submenu)
        return false;
    item.submenu.popup({ window, x, y });
    return true;
}
