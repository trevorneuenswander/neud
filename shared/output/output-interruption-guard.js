"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputInterruptionCanceledError = void 0;
exports.isActiveOutputSessionStatus = isActiveOutputSessionStatus;
exports.getActiveOutputs = getActiveOutputs;
exports.getActiveOutputsForStack = getActiveOutputsForStack;
exports.getActiveOutputsForStacks = getActiveOutputsForStacks;
exports.uniqueActiveOutputRouteIds = uniqueActiveOutputRouteIds;
exports.stackIdsForPinnedViewerMutation = stackIdsForPinnedViewerMutation;
exports.buildOutputInterruptionPrompt = buildOutputInterruptionPrompt;
exports.shouldConfirmOutputInterruption = shouldConfirmOutputInterruption;
function isActiveOutputSessionStatus(status) {
    return (
        status === "live" ||
        status === "starting" ||
        status === "recording" ||
        status === "finalizing"
    );
}
function sessionMentionsRecording(session) {
    return (
        session.adapterType === "disk" ||
        session.status === "recording" ||
        session.status === "finalizing"
    );
}
/** Live, starting, recording, or finalizing outputs from canonical Output Engine route views. */
function getActiveOutputs(routes) {
    const active = [];
    for (const route of routes) {
        if (!isActiveOutputSessionStatus(route.session.status))
            continue;
        active.push({
            routeId: route.id,
            name: route.name,
            projectId: route.projectId,
            sourceType: route.sourceType === "stack" ? "stack" : "display",
            sourceId: route.sourceId,
            status: route.session.status,
            adapterType: typeof route.adapterType === "string" ? route.adapterType : undefined,
        });
    }
    return active;
}
function getActiveOutputsForStack(routes, stackId) {
    const trimmed = stackId.trim();
    if (!trimmed)
        return [];
    return getActiveOutputs(routes).filter((entry) => entry.sourceType === "stack" && entry.sourceId === trimmed);
}
function getActiveOutputsForStacks(routes, stackIds) {
    const idSet = new Set([...stackIds].map((id) => id.trim()).filter(Boolean));
    if (idSet.size === 0)
        return [];
    return getActiveOutputs(routes).filter((entry) => entry.sourceType === "stack" && idSet.has(entry.sourceId));
}
function uniqueActiveOutputRouteIds(sessions) {
    return [...new Set(sessions.map((entry) => entry.routeId))];
}
/** Stack ids whose composition may change for a pinned-viewer mutation. */
function stackIdsForPinnedViewerMutation(action, params, pinnedStacks) {
    if (action === "unpinStack" || action === "reorderStack" || action === "removeFromStack") {
        const stackId = params.stackId?.trim() ?? "";
        return stackId ? [stackId] : [];
    }
    if (action !== "addToStack" || !params.target)
        return [];
    if (params.target.kind === "stack") {
        const stackId = params.target.stackId.trim();
        return stackId ? [stackId] : [];
    }
    const targetDisplayId = params.target.displayId.trim();
    if (!targetDisplayId)
        return [];
    const existing = pinnedStacks.find((stack) => stack.displayIds.includes(targetDisplayId));
    return existing ? [existing.id] : [];
}
function formatActiveOutputNames(activeOutputs) {
    const names = [...new Set(activeOutputs.map((entry) => entry.name.trim()).filter(Boolean))];
    if (names.length === 0)
        return "an active output";
    if (names.length === 1)
        return names[0];
    if (names.length === 2)
        return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
function buildOutputInterruptionPrompt(input) {
    const outputCount = uniqueActiveOutputRouteIds(input.activeOutputs).length;
    const multipleOutputs = outputCount > 1;
    const scraperActive = input.scraperActive === true;
    const hasRecording = input.activeOutputs.some(sessionMentionsRecording);
    const nameList = formatActiveOutputNames(input.activeOutputs);
    if (input.reason === "stackChange") {
        let description = `${nameList} ${multipleOutputs ? "are" : "is"} currently on air. Changing this stack may disconnect active outputs.`;
        if (hasRecording) {
            description += " Recording may be interrupted.";
        }
        return {
            title: "Display Is Currently On Air",
            description,
            cancelLabel: "Cancel",
            confirmLabel: "Disconnect Anyway",
            busyConfirmLabel: "Disconnecting…",
        };
    }
    if (input.reason === "logout") {
        let description = hasRecording
            ? "Outputs are currently live or recording. Signing out will stop all active outputs and recordings."
            : "Outputs are currently live. Signing out will stop all active outputs.";
        if (scraperActive) {
            description = hasRecording
                ? "Outputs are currently live or recording and the Webpage Scraper is running. Signing out will stop all active outputs, recordings, and data engines."
                : "Outputs are currently live and the Webpage Scraper is running. Signing out will stop all active outputs and data engines.";
        }
        else if (multipleOutputs && !hasRecording) {
            description =
                "Multiple outputs are currently live. Signing out will stop all active outputs.";
        }
        return {
            title: "Sign out?",
            description,
            cancelLabel: "Cancel",
            confirmLabel: "Sign Out and Stop Outputs",
            busyConfirmLabel: "Stopping Outputs…",
        };
    }
    let description = hasRecording
        ? "Outputs are currently live or recording. Quitting NEUD will stop all active outputs and recordings."
        : "Outputs are currently live. Quitting NEUD will stop all active outputs.";
    if (scraperActive) {
        description = hasRecording
            ? "Outputs are currently live or recording and the Webpage Scraper is running. Quitting NEUD will stop all active outputs, recordings, and the scraper session."
            : "Outputs are currently live and the Webpage Scraper is running. Quitting NEUD will stop all active outputs and the scraper session.";
    }
    else if (multipleOutputs && !hasRecording) {
        description =
            "Multiple outputs are currently live. Quitting NEUD will stop all active outputs.";
    }
    return {
        title: "Quit NEUD?",
        description,
        cancelLabel: "Cancel",
        confirmLabel: "Quit and Stop Outputs",
        busyConfirmLabel: "Stopping Outputs…",
    };
}
function shouldConfirmOutputInterruption(activeOutputs) {
    return activeOutputs.length > 0;
}
class OutputInterruptionCanceledError extends Error {
    constructor() {
        super("Output interruption canceled.");
        this.name = "OutputInterruptionCanceledError";
    }
}
exports.OutputInterruptionCanceledError = OutputInterruptionCanceledError;
