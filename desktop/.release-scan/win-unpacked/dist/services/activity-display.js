"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_OVERVIEW_LIMIT = void 0;
exports.normalizeActivityEventForDisplay = normalizeActivityEventForDisplay;
exports.selectCompactActivityEvents = selectCompactActivityEvents;
const activity_message_1 = require("./activity-message");
const description_1 = require("../lib/activity/description");
const ACTIVITY_OVERVIEW_LIMIT = 50;
exports.ACTIVITY_OVERVIEW_LIMIT = ACTIVITY_OVERVIEW_LIMIT;
const ACTIVITY_TYPE_LABELS = {
    "developer-tools.scraper-published": "Scraper code published",
    "developer-tools.scraper-revision-restored": "Scraper revision restored",
    "developer-tools.display-published": "Display code published",
    "developer-tools.display-revision-restored": "Display revision restored",
    "developer-tools.display-version-deleted": "Display version deleted",
    "developer-tools.display-created": "HTML display created",
    "developer-tools.display-renamed": "Display renamed",
    "developer-tools.display-archived": "Display archived",
    "developer-tools.display-deleted": "Display deleted",
    "project.settings-updated": "Project settings updated",
    "project.marked-inactive": "Project marked inactive",
    "project.marked-active": "Project marked active",
};
function humanizeActivityType(type) {
    const mapped = ACTIVITY_TYPE_LABELS[type];
    if (mapped)
        return mapped;
    return type
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
function normalizeActivityEventForDisplay(event, project, soleProject) {
    const metadata = event.metadata ?? {};
    let projectId = typeof metadata.projectId === "string" ? metadata.projectId : null;
    let resolvedProject = project ?? null;
    if (!resolvedProject && !projectId && soleProject) {
        resolvedProject = soleProject;
        projectId = soleProject.id;
    }
    if (!projectId && resolvedProject) {
        projectId = resolvedProject.id;
    }
    if (!projectId) {
        return null;
    }
    const messageRaw = event.message?.trim() ?? "";
    const actorName = (0, activity_message_1.resolveActivityActorName)(event.actor);
    const actorId = (typeof event.actor?.id === "string" ? event.actor.id : null) ??
        (typeof metadata.userId === "string" ? metadata.userId : null) ??
        (typeof metadata.actorId === "string" ? metadata.actorId : null) ??
        undefined;
    const message = (0, description_1.getCleanActivityDescription)(messageRaw || humanizeActivityType(event.type), actorName) || humanizeActivityType(event.type);
    if (!messageRaw) {
        console.warn(`[activity] Missing message for event ${event.id}; using type fallback`);
    }
    return {
        id: event.id,
        projectId,
        projectSlug: (typeof metadata.projectSlug === "string" ? metadata.projectSlug : null) ??
            resolvedProject?.slug ??
            undefined,
        projectName: (typeof metadata.projectName === "string" ? metadata.projectName : null) ??
            resolvedProject?.name ??
            undefined,
        actorId,
        actorName,
        message,
        createdAt: event.timestamp,
        type: event.type,
        severity: event.severity,
    };
}
function selectCompactActivityEvents(events, maxItems = ACTIVITY_OVERVIEW_LIMIT) {
    const sortedNewestFirst = [...events].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    const latest = sortedNewestFirst.slice(0, maxItems);
    return [...latest].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}
