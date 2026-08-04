"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeDisplayPreviewWindow = void 0;
exports.registerDisplaysIpc = registerDisplaysIpc;
exports.shutdownDisplayPreviewWindows = shutdownDisplayPreviewWindows;
const display_preview_window_manager_1 = require("../services/display-preview-window-manager");
Object.defineProperty(exports, "closeDisplayPreviewWindow", { enumerable: true, get: function () { return display_preview_window_manager_1.closeDisplayPreviewWindow; } });
const channels_1 = require("./channels");
function parseOpenPreviewPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Invalid preview payload.");
    }
    const record = payload;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "Display Preview";
    const viewerUrl = typeof record.viewerUrl === "string" ? record.viewerUrl.trim() : "";
    const displayWidth = typeof record.displayWidth === "number" && Number.isFinite(record.displayWidth)
        ? record.displayWidth
        : undefined;
    const displayHeight = typeof record.displayHeight === "number" && Number.isFinite(record.displayHeight)
        ? record.displayHeight
        : undefined;
    if (!projectId || !displayId || !viewerUrl) {
        throw new Error("Preview project, display, and URL are required.");
    }
    return { projectId, displayId, title, viewerUrl, displayWidth, displayHeight };
}
function parseSaveDisplayOrderPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Invalid display order payload.");
    }
    const record = payload;
    const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
    const displayIds = Array.isArray(record.displayIds)
        ? record.displayIds.map((value) => String(value))
        : [];
    if (!projectId || displayIds.length === 0) {
        throw new Error("Project and display order are required.");
    }
    return { projectId, displayIds };
}
function registerDisplaysIpc(input) {
    (0, channels_1.registerIpcHandler)("neud:displays:openPreview", (_event, payload) => {
        const parsed = parseOpenPreviewPayload(payload);
        const userId = input.auth.getAuthenticatedUser()?.userId;
        if (!userId) {
            throw new Error("Sign in to preview displays.");
        }
        (0, display_preview_window_manager_1.openDisplayPreviewWindow)({
            userId,
            projectId: parsed.projectId,
            displayId: parsed.displayId,
            title: parsed.title,
            viewerUrl: parsed.viewerUrl,
            displayWidth: parsed.displayWidth,
            displayHeight: parsed.displayHeight,
        });
        return { ok: true };
    });
    (0, channels_1.registerIpcHandler)("neud:displays:closePreview", (_event, payload) => {
        if (!payload || typeof payload !== "object") {
            throw new Error("Invalid preview close payload.");
        }
        const record = payload;
        const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
        const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
        if (!projectId || !displayId) {
            throw new Error("Preview project and display are required.");
        }
        const userId = input.auth.getAuthenticatedUser()?.userId ?? undefined;
        (0, display_preview_window_manager_1.closeDisplayPreviewWindow)({ userId, projectId, displayId });
        return { ok: true };
    });
    (0, channels_1.registerIpcHandler)("neud:displays:saveOrder", (_event, payload) => {
        if (!input.auth.isAccessAllowed()) {
            throw new Error("Sign in to save display order.");
        }
        const parsed = parseSaveDisplayOrderPayload(payload);
        return input.data.saveUserDisplayOrder(parsed.projectId, parsed.displayIds);
    });
    (0, channels_1.registerIpcHandler)("neud:displays:getOrder", (_event, projectId) => {
        if (!input.auth.isAccessAllowed()) {
            throw new Error("Sign in to load display order.");
        }
        if (typeof projectId !== "string" || !projectId.trim()) {
            throw new Error("Project id is required.");
        }
        return {
            order: input.data.getUserDisplayOrder(projectId.trim()),
            databasePath: input.data.getDatabasePath(),
        };
    });
}
function shutdownDisplayPreviewWindows() {
    (0, display_preview_window_manager_1.closeAllDisplayPreviewWindows)();
}
