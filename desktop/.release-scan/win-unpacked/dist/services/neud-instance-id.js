"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEUD_INSTANCE_ID_SETTING_KEY = void 0;
exports.getOrCreateNeudInstanceId = getOrCreateNeudInstanceId;
const crypto_1 = require("crypto");
exports.NEUD_INSTANCE_ID_SETTING_KEY = "neud.instanceId";
function getOrCreateNeudInstanceId(settings) {
    const existing = settings.get(exports.NEUD_INSTANCE_ID_SETTING_KEY, null);
    if (typeof existing === "string" && existing.trim()) {
        return existing.trim();
    }
    const instanceId = (0, crypto_1.randomUUID)();
    settings.set(exports.NEUD_INSTANCE_ID_SETTING_KEY, instanceId);
    return instanceId;
}
