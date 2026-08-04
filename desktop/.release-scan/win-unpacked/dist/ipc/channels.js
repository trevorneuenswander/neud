"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toNeudChannel = toNeudChannel;
exports.registerIpcHandler = registerIpcHandler;
exports.broadcastToAllRenderers = broadcastToAllRenderers;
exports.sendToRenderer = sendToRenderer;
const electron_1 = require("electron");
const NEUD_PREFIX = "neud:";
function toNeudChannel(channel) {
    return channel.startsWith(NEUD_PREFIX) ? channel : `${NEUD_PREFIX}${channel}`;
}
function registerIpcHandler(channel, handler) {
    electron_1.ipcMain.handle(toNeudChannel(channel), handler);
}
function broadcastToAllRenderers(channel, ...args) {
    for (const window of electron_1.BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
            sendToRenderer(window, channel, ...args);
        }
    }
}
function sendToRenderer(target, channel, ...args) {
    const webContents = "webContents" in target ? target.webContents : target;
    webContents.send(toNeudChannel(channel), ...args);
}
