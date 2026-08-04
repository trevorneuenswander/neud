"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCredentialsIpc = registerCredentialsIpc;
exports.getSenderWindow = getSenderWindow;
const electron_1 = require("electron");
const validate_1 = require("../utils/validate");
const channels_1 = require("./channels");
function registerCredentialsIpc(credentials) {
    (0, channels_1.registerIpcHandler)("neud:credentials:has", (_event, engineId) => {
        return credentials.hasRunnableAuth((0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:credentials:getMeta", (_event, engineId) => {
        return credentials.getCredentialMeta((0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:credentials:get", (_event, engineId) => {
        return credentials.getCredentialsForRenderer((0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:credentials:save", (_event, engineId, payload) => {
        const id = (0, validate_1.assertEngineId)(String(engineId));
        if (!payload || typeof payload !== "object") {
            throw new Error("Invalid credentials payload.");
        }
        const record = payload;
        const passwordValue = String(record.password ?? "");
        if (!passwordValue.trim()) {
            throw new Error("Auction Password is required.");
        }
        credentials.saveCredentials(id, {
            email: (0, validate_1.assertEmail)(String(record.email ?? "")),
            password: (0, validate_1.assertPassword)(passwordValue),
        });
    });
    (0, channels_1.registerIpcHandler)("neud:credentials:clear", (_event, engineId) => {
        credentials.clearCredentials((0, validate_1.assertEngineId)(String(engineId)));
    });
}
function getSenderWindow(event) {
    const window = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!window) {
        throw new Error("Unable to resolve sender window.");
    }
    return window;
}
