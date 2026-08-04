"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DESKTOP_FALLBACK_LANDING_PATH = exports.DESKTOP_DEFAULT_STARTUP_PATH = exports.DESKTOP_LAST_ROUTE_SETTING_KEY = void 0;
exports.isInternalStartupPath = isInternalStartupPath;
exports.migrateStartupPath = migrateStartupPath;
exports.normalizeStartupPath = normalizeStartupPath;
exports.joinRendererUrl = joinRendererUrl;
exports.resolveDesktopStartupPath = resolveDesktopStartupPath;
exports.resolveVerifiedProjectStartupPath = resolveVerifiedProjectStartupPath;
exports.readSavedStartupPath = readSavedStartupPath;
exports.persistStartupPath = persistStartupPath;
exports.clearSavedStartupPath = clearSavedStartupPath;
exports.DESKTOP_LAST_ROUTE_SETTING_KEY = "ui.last_route";
/** Root login route; auth middleware chooses the post-login destination. */
exports.DESKTOP_DEFAULT_STARTUP_PATH = "/";
exports.DESKTOP_FALLBACK_LANDING_PATH = "/projects";
const EXACT_PATH_MIGRATIONS = {
    "/overview": exports.DESKTOP_FALLBACK_LANDING_PATH,
    "/hmg": exports.DESKTOP_FALLBACK_LANDING_PATH,
    "/hmg-graphics-server": exports.DESKTOP_FALLBACK_LANDING_PATH,
    "/projects/hmg-graphics-server": exports.DESKTOP_FALLBACK_LANDING_PATH,
    "/project-x": exports.DESKTOP_FALLBACK_LANDING_PATH,
};
const OBSOLETE_PROJECT_SUBROUTES = ["/controllers", "/members"];
function isInternalStartupPath(path) {
    const trimmed = path.trim();
    return (trimmed.startsWith("/") &&
        !trimmed.startsWith("//") &&
        !trimmed.includes("://") &&
        !trimmed.includes("\\"));
}
function migrateStartupPath(pathname) {
    const exact = EXACT_PATH_MIGRATIONS[pathname];
    if (exact) {
        return exact;
    }
    for (const segment of OBSOLETE_PROJECT_SUBROUTES) {
        if (pathname.endsWith(segment)) {
            const projectRoot = pathname.slice(0, -segment.length);
            return projectRoot.length > 0 ? projectRoot : exports.DESKTOP_FALLBACK_LANDING_PATH;
        }
    }
    return pathname;
}
function normalizeStartupPath(savedPath, fallback = exports.DESKTOP_DEFAULT_STARTUP_PATH) {
    if (!savedPath) {
        return fallback;
    }
    const trimmed = savedPath.trim();
    if (!isInternalStartupPath(trimmed)) {
        return fallback;
    }
    const pathname = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
    if (!pathname) {
        return fallback;
    }
    return migrateStartupPath(pathname);
}
function joinRendererUrl(baseUrl, path) {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    if (path === "/") {
        return `${normalizedBase}/`;
    }
    return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}
function resolveDesktopStartupPath(input) {
    const saved = normalizeStartupPath(input.savedPath, exports.DESKTOP_DEFAULT_STARTUP_PATH);
    if (saved !== exports.DESKTOP_DEFAULT_STARTUP_PATH) {
        return saved;
    }
    if (input.preferredPath) {
        return normalizeStartupPath(input.preferredPath, exports.DESKTOP_DEFAULT_STARTUP_PATH);
    }
    return exports.DESKTOP_DEFAULT_STARTUP_PATH;
}
function resolveVerifiedProjectStartupPath(input) {
    const slug = input.defaultProjectSlug?.trim();
    if (slug && input.projectExists(slug)) {
        return `/projects/${slug}/data-engines`;
    }
    return exports.DESKTOP_FALLBACK_LANDING_PATH;
}
function readSavedStartupPath(settings) {
    const value = settings.get(exports.DESKTOP_LAST_ROUTE_SETTING_KEY, null);
    return typeof value === "string" ? value : null;
}
function persistStartupPath(settings, path) {
    const normalized = normalizeStartupPath(path, exports.DESKTOP_DEFAULT_STARTUP_PATH);
    if (normalized === exports.DESKTOP_DEFAULT_STARTUP_PATH) {
        return;
    }
    settings.set(exports.DESKTOP_LAST_ROUTE_SETTING_KEY, normalized);
}
function clearSavedStartupPath(settings) {
    settings.set(exports.DESKTOP_LAST_ROUTE_SETTING_KEY, null);
}
