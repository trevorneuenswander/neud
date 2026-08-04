"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLocalDataIpc = registerLocalDataIpc;
const channels_1 = require("./channels");
function registerLocalDataIpc(deps) {
    (0, channels_1.registerIpcHandler)("neud:local:listProjects", () => {
        if (!deps.auth.isAccessAllowed()) {
            throw new Error("Authorization required.");
        }
        return deps.data.listProjects();
    });
    (0, channels_1.registerIpcHandler)("neud:local:getRuntimeStatus", () => {
        return {
            localApi: deps.localApi.getInfo(),
            auth: deps.auth.getStatus(),
        };
    });
}
