"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAppIpc = registerAppIpc;
const electron_1 = require("electron");
const release_version_1 = require("../app/release-version");
const application_menu_1 = require("../menu/application-menu");
const channels_1 = require("./channels");
let applicationMenu = null;
function registerAppIpc(host, getMainWindow, respondCloseRequest) {
    applicationMenu = (0, application_menu_1.buildApplicationMenu)(getMainWindow);
    electron_1.Menu.setApplicationMenu(applicationMenu);
    (0, channels_1.registerIpcHandler)("neud:app:getVersion", () => (0, release_version_1.getCanonicalReleaseVersion)());
    (0, channels_1.registerIpcHandler)("neud:app:getPlatform", () => process.platform);
    (0, channels_1.registerIpcHandler)("neud:app:getHostId", () => host.getHostId());
    (0, channels_1.registerIpcHandler)("neud:app:getMenuLabels", () => [...application_menu_1.APPLICATION_MENU_LABELS]);
    (0, channels_1.registerIpcHandler)("neud:app:getWindowState", () => {
        const window = getMainWindow();
        return {
            isMaximized: window?.isMaximized() ?? false,
        };
    });
    (0, channels_1.registerIpcHandler)("neud:app:windowControl", (event, action) => {
        const window = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!window || window.isDestroyed()) {
            return false;
        }
        if (action === "minimize") {
            window.minimize();
        }
        else if (action === "maximize") {
            if (window.isMaximized()) {
                window.unmaximize();
            }
            else {
                window.maximize();
            }
        }
        else if (action === "close") {
            window.close();
        }
        else {
            return false;
        }
        return { isMaximized: window.isMaximized() };
    });
    (0, channels_1.registerIpcHandler)("neud:app:popupMenu", (event, label, position) => {
        if (typeof label !== "string" || !label.trim()) {
            return false;
        }
        const window = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!window || window.isDestroyed() || !applicationMenu) {
            return false;
        }
        return (0, application_menu_1.popupApplicationMenuLabel)(applicationMenu, label, window, typeof position?.x === "number" ? position.x : undefined, typeof position?.y === "number" ? position.y : undefined);
    });
    (0, channels_1.registerIpcHandler)("neud:app:respondCloseRequest", (_event, action) => {
        if (action !== "cancel" &&
            action !== "confirm" &&
            action !== "force") {
            return { ok: false };
        }
        respondCloseRequest?.(action);
        return { ok: true };
    });
}
