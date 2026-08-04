"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesktopAdminApiClient = void 0;
class DesktopAdminApiClient {
    trustedPortalOrigin;
    cloud;
    constructor(trustedPortalOrigin, cloud) {
        this.trustedPortalOrigin = trustedPortalOrigin;
        this.cloud = cloud;
    }
    assertTrustedOrigin() {
        const url = new URL(this.trustedPortalOrigin);
        const isLocal = url.hostname === "127.0.0.1" ||
            url.hostname === "localhost" ||
            url.hostname === "::1";
        if (!isLocal && url.protocol !== "https:") {
            throw new Error("Trusted portal origin must use HTTPS in production.");
        }
    }
    async inviteUser(input) {
        this.assertTrustedOrigin();
        const client = await this.cloud.getClient();
        if (!client) {
            return {
                ok: false,
                code: "cloud_session_required",
                message: "Online account session required.",
            };
        }
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (sessionError || !accessToken) {
            return {
                ok: false,
                code: "cloud_session_required",
                message: "Online account session required.",
            };
        }
        const response = await fetch(`${this.trustedPortalOrigin}/api/desktop/admin/invite-user`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(input),
        });
        const payload = (await response.json().catch(() => null));
        if (!response.ok || !payload || payload.ok !== true) {
            return {
                ok: false,
                code: payload && "code" in payload && payload.code ? payload.code : "invite_failed",
                message: payload && "message" in payload && payload.message
                    ? payload.message
                    : "Unable to invite user.",
            };
        }
        return { ok: true, userId: payload.userId };
    }
}
exports.DesktopAdminApiClient = DesktopAdminApiClient;
