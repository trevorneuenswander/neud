"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidUuid = isValidUuid;
exports.assertEngineId = assertEngineId;
exports.assertEmail = assertEmail;
exports.assertPassword = assertPassword;
exports.createWorkerId = createWorkerId;
const crypto_1 = require("crypto");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(value) {
    return UUID_PATTERN.test(value);
}
function assertEngineId(engineId) {
    if (!isValidUuid(engineId)) {
        throw new Error("Invalid engine ID.");
    }
    return engineId;
}
function assertEmail(email) {
    const trimmed = email.trim();
    if (!trimmed || trimmed.length > 320 || !trimmed.includes("@")) {
        throw new Error("Invalid email.");
    }
    return trimmed;
}
function assertPassword(password) {
    if (!password || password.length > 512) {
        throw new Error("Invalid password.");
    }
    return password;
}
function createWorkerId(hostId, pid) {
    return `${hostId}-${pid}-${(0, crypto_1.randomUUID)().slice(0, 8)}`;
}
