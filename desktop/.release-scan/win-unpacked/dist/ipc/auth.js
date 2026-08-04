"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuthIpc = registerAuthIpc;
const zod_1 = require("zod");
const channels_1 = require("./channels");
const verifiedSessionSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    email: zod_1.z.string().email(),
    displayName: zod_1.z.string().nullable().optional(),
    team: zod_1.z.string().nullable().optional(),
    role: zod_1.z.string().min(1),
    entitlement: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    deviceId: zod_1.z.string().uuid(),
    cloudSession: zod_1.z
        .object({
        accessToken: zod_1.z.string().min(1),
        refreshToken: zod_1.z.string().min(1),
        expiresAt: zod_1.z.number().int().positive(),
    })
        .optional(),
});
function registerAuthIpc(auth, options) {
    (0, channels_1.registerIpcHandler)("neud:auth:getStatus", () => auth.getStatus());
    (0, channels_1.registerIpcHandler)("neud:auth:storeVerifiedSession", (_event, payload) => {
        const parsed = verifiedSessionSchema.parse(payload);
        const { cloudSession, ...sessionPayload } = parsed;
        const result = auth.storeVerifiedSession(sessionPayload);
        if (cloudSession) {
            options?.userSession?.storeSession({
                userId: parsed.userId,
                accessToken: cloudSession.accessToken,
                refreshToken: cloudSession.refreshToken,
                expiresAt: cloudSession.expiresAt,
            });
        }
        options?.onSessionStored?.();
        return result;
    });
    (0, channels_1.registerIpcHandler)("neud:auth:clear", () => {
        auth.clear();
        options?.userSession?.clearSession();
        options?.onSessionCleared?.();
    });
    (0, channels_1.registerIpcHandler)("neud:auth:forceSignOut", async () => {
        if (!options?.forceSignOut) {
            auth.clear();
            options?.userSession?.clearSession();
            options?.onSessionCleared?.();
            return { ok: true };
        }
        return options.forceSignOut();
    });
}
