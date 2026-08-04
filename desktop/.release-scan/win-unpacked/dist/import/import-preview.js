"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildImportPreview = buildImportPreview;
exports.sanitizeSelections = sanitizeSelections;
function buildImportPreview(pkg, context, validation) {
    return pkg.projects.map((project, index) => buildProjectPreview(project, index, context, validation));
}
function buildProjectPreview(project, index, context, validation) {
    const projectErrors = validation.errors.filter((issue) => issue.path.startsWith(`projects[${index}]`));
    const localById = context.projectsById.get(project.id);
    const localBySlug = context.projectsBySlug.get(project.slug);
    const history = context.importHistoryBySourceId.get(project.id);
    const activeConflict = Boolean(localById) &&
        project.engines.some((engine) => context.activeEngineIds.has(engine.id));
    let status = "new";
    const messages = [];
    if (projectErrors.length > 0) {
        status = "invalid";
        messages.push(...projectErrors.map((issue) => issue.message));
    }
    else if (activeConflict) {
        status = "active-conflict";
        messages.push("This project has an active local Data Engine. Import as copy or skip.");
    }
    else if (localById && history?.localProjectId === localById.id) {
        if (isSourceUpdated(project.updatedAt, history.sourceUpdatedAt)) {
            status = "source-updated";
            messages.push("Cloud project changed since the last import.");
        }
        else {
            status = "already-imported";
            messages.push("This project was already imported to this computer.");
        }
    }
    else if (localById) {
        status = "id-conflict";
        messages.push("A local project already uses this cloud project ID.");
    }
    else if (localBySlug) {
        status = "name-conflict";
        messages.push("A local project already uses this slug.");
    }
    const recommendedAction = recommendAction(status);
    const allowedActions = allowedActionsForStatus(status);
    return {
        sourceProjectId: project.id,
        name: project.name,
        slug: project.slug,
        engineCount: project.engines.length,
        scraperSourceCount: project.engines.reduce((count, engine) => count + engine.scraperSources.length, 0),
        snapshotCount: project.engines.filter((engine) => engine.latestSnapshot).length,
        status,
        recommendedAction,
        allowedActions,
        selectedAction: recommendedAction,
        messages,
    };
}
function isSourceUpdated(sourceUpdatedAt, importedSourceUpdatedAt) {
    if (!sourceUpdatedAt || !importedSourceUpdatedAt)
        return false;
    return Date.parse(sourceUpdatedAt) > Date.parse(importedSourceUpdatedAt);
}
function recommendAction(status) {
    switch (status) {
        case "new":
            return "create";
        case "already-imported":
        case "invalid":
        case "active-conflict":
            return "skip";
        case "source-updated":
        case "id-conflict":
        case "name-conflict":
            return "copy";
        default:
            return "skip";
    }
}
function allowedActionsForStatus(status) {
    switch (status) {
        case "new":
            return ["create", "skip"];
        case "source-updated":
        case "id-conflict":
        case "name-conflict":
        case "active-conflict":
            return ["copy", "skip"];
        case "already-imported":
        case "invalid":
            return ["skip"];
        default:
            return ["skip"];
    }
}
function sanitizeSelections(previewProjects, selections) {
    const previewById = new Map(previewProjects.map((project) => [project.sourceProjectId, project]));
    return selections.map((selection) => {
        const projectPreview = previewById.get(selection.sourceProjectId);
        if (!projectPreview) {
            throw new Error("Import selection includes an unknown project.");
        }
        if (!projectPreview.allowedActions.includes(selection.action)) {
            throw new Error(`Action "${selection.action}" is not allowed for project "${projectPreview.name}".`);
        }
        return selection;
    });
}
