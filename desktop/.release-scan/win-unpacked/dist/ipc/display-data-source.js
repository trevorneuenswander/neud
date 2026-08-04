"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDisplayDataSourceIpc = registerDisplayDataSourceIpc;
const credentials_1 = require("./credentials");
const channels_1 = require("./channels");
function registerDisplayDataSourceIpc(data) {
    (0, channels_1.registerIpcHandler)("neud:displayDataSource:get", () => {
        return data.getDisplayDataSource();
    });
    (0, channels_1.registerIpcHandler)("neud:displayDataSource:set", (_event, source) => {
        return data.setDisplayDataSource(source);
    });
    (0, channels_1.registerIpcHandler)("neud:displayDataSource:subscribe", (event) => {
        const window = (0, credentials_1.getSenderWindow)(event);
        if (window) {
            data.subscribeDisplayDataSource(window);
        }
    });
    (0, channels_1.registerIpcHandler)("neud:displayDataSource:unsubscribe", (event) => {
        const window = (0, credentials_1.getSenderWindow)(event);
        if (window) {
            data.unsubscribeDisplayDataSource(window);
        }
    });
}
