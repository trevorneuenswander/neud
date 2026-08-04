"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTrustedPortalOrigin = resolveTrustedPortalOrigin;
const neud_env_1 = require("../env/neud-env");
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
function normalizeOrigin(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            return null;
        }
        return url.origin.replace(/\/$/, "");
    }
    catch {
        return null;
    }
}
function resolveTrustedPortalOrigin(options) {
    const configured = (0, neud_env_1.readNeudEnv)("NEUD_TRUSTED_PORTAL_ORIGIN");
    if (configured) {
        const origin = normalizeOrigin(configured);
        if (!origin) {
            return {
                ok: false,
                code: "invalid_trusted_portal_origin",
                message: "NEUD_TRUSTED_PORTAL_ORIGIN must be a valid http(s) origin.",
            };
        }
        return { ok: true, origin };
    }
    if (options?.allowLocalDevFallback) {
        const fallback = normalizeOrigin(options.localDevFallbackOrigin ?? "http://127.0.0.1:3000");
        if (fallback) {
            const host = new URL(fallback).hostname;
            if (LOCAL_HOSTS.has(host)) {
                return { ok: true, origin: fallback };
            }
        }
    }
    return {
        ok: false,
        code: "trusted_portal_origin_missing",
        message: "NEUD_TRUSTED_PORTAL_ORIGIN is not configured. Privileged cloud administration is unavailable.",
    };
}
