"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEnginesIpc = registerEnginesIpc;
const validate_1 = require("../utils/validate");
const credentials_1 = require("./credentials");
const channels_1 = require("./channels");
function parseControlPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Invalid control payload.");
    }
    const record = payload;
    const engineId = (0, validate_1.assertEngineId)(String(record.engineId ?? ""));
    const requestedBy = typeof record.requestedBy === "string" && (0, validate_1.isValidUuid)(record.requestedBy)
        ? record.requestedBy
        : null;
    return { engineId, requestedBy };
}
function registerEnginesIpc(engineManager) {
    (0, channels_1.registerIpcHandler)("neud:engines:getLocalStatus", (_event, engineId) => {
        return engineManager.getLocalStatus((0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:engines:start", (_event, payload) => {
        const { engineId, requestedBy } = parseControlPayload(payload);
        return engineManager.start(engineId, requestedBy);
    });
    (0, channels_1.registerIpcHandler)("neud:engines:stop", (_event, payload) => {
        const { engineId, requestedBy } = parseControlPayload(payload);
        return engineManager.stop(engineId, requestedBy);
    });
    (0, channels_1.registerIpcHandler)("neud:engines:restart", (_event, payload) => {
        const { engineId, requestedBy } = parseControlPayload(payload);
        return engineManager.restart(engineId, requestedBy);
    });
    (0, channels_1.registerIpcHandler)("neud:engines:runOnce", (_event, payload) => {
        const { engineId, requestedBy } = parseControlPayload(payload);
        return engineManager.runOnce(engineId, requestedBy);
    });
    (0, channels_1.registerIpcHandler)("neud:engines:subscribeLogs", (event, engineId) => {
        engineManager.subscribeLogs((0, credentials_1.getSenderWindow)(event), (0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:engines:unsubscribeLogs", (event, engineId) => {
        engineManager.unsubscribeLogs((0, credentials_1.getSenderWindow)(event), (0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:engines:subscribeExecutionLogs", (event, engineId) => {
        engineManager.subscribeExecutionLogs((0, credentials_1.getSenderWindow)(event), (0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:engines:unsubscribeExecutionLogs", (event, engineId) => {
        engineManager.unsubscribeExecutionLogs((0, credentials_1.getSenderWindow)(event), (0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:engines:clearSessionLogs", (_event, engineId) => {
        engineManager.clearSessionLogs((0, validate_1.assertEngineId)(String(engineId)));
        return { ok: true };
    });
    (0, channels_1.registerIpcHandler)("neud:engines:subscribeEngineStatus", (event, engineId) => {
        engineManager.subscribeEngineStatus((0, credentials_1.getSenderWindow)(event), (0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:engines:unsubscribeEngineStatus", (event, engineId) => {
        engineManager.unsubscribeEngineStatus((0, credentials_1.getSenderWindow)(event), (0, validate_1.assertEngineId)(String(engineId)));
    });
    (0, channels_1.registerIpcHandler)("neud:engines:getBrowserSessionState", (_event, engineId) => {
        return engineManager.getBrowserSessionState((0, validate_1.assertEngineId)(String(engineId)));
    });
}
