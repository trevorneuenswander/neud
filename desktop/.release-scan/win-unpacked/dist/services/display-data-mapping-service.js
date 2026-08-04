"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisplayDataMappingService = void 0;
exports.injectDisplayMappingRuntime = injectDisplayMappingRuntime;
const crypto_1 = require("crypto");
const project_permissions_1 = require("../projects/project-permissions");
const application_roles_1 = require("../auth/application-roles");
class DisplayDataMappingService {
    projects;
    displays;
    mappings;
    auth;
    memberships;
    recordActivity;
    constructor(projects, displays, mappings, auth, memberships, recordActivity = null) {
        this.projects = projects;
        this.displays = displays;
        this.mappings = mappings;
        this.auth = auth;
        this.memberships = memberships;
        this.recordActivity = recordActivity;
    }
    assertManageAccess(projectId) {
        const user = this.auth.getAuthenticatedUser();
        if (!user) {
            throw new Error("Sign in to your NEUD account to continue.");
        }
        const membershipRole = this.memberships.getProjectRole(user.userId, projectId);
        const role = membershipRole ?? (0, application_roles_1.getApplicationRole)({ role: user.role });
        if (!(0, project_permissions_1.canManageProjectSettings)(role)) {
            throw new Error("You do not have permission to manage display mappings.");
        }
        return {
            userId: user.userId,
            name: user.displayName ?? user.email ?? "Unknown User",
            email: user.email,
        };
    }
    listForDisplay(projectSlug, displayId) {
        const project = this.projects.getBySlug(projectSlug);
        if (!project)
            throw new Error("Project not found.");
        this.assertManageAccess(project.id);
        const display = this.displays.getById(displayId);
        if (!display || display.projectId !== project.id) {
            throw new Error("Display not found.");
        }
        return this.mappings.listByDisplayId(displayId).map((row) => ({
            id: row.id,
            displayId: row.displayId,
            jsonPath: row.jsonPath,
            targetSelector: row.targetSelector,
            targetType: row.targetType,
            targetProperty: row.targetProperty,
            formatter: row.formatter,
            condition: row.conditionJson ? JSON.parse(row.conditionJson) : null,
            fallbackValue: row.fallbackValue,
            sortOrder: row.sortOrder,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            createdByUserId: row.createdByUserId,
            updatedByUserId: row.updatedByUserId,
        }));
    }
    listRuntimeMappings(displayId) {
        return this.mappings.listByDisplayId(displayId).map((row) => ({
            jsonPath: row.jsonPath,
            targetSelector: row.targetSelector,
            targetType: row.targetType,
            targetProperty: row.targetProperty,
            formatter: row.formatter,
            condition: row.conditionJson ? JSON.parse(row.conditionJson) : null,
            fallbackValue: row.fallbackValue,
        }));
    }
    saveForDisplay(projectSlug, displayId, mappings, options) {
        const project = this.projects.getBySlug(projectSlug);
        if (!project)
            throw new Error("Project not found.");
        const actor = this.assertManageAccess(project.id);
        const display = this.displays.getById(displayId);
        if (!display || display.projectId !== project.id) {
            throw new Error("Display not found.");
        }
        const normalized = mappings.map((mapping, index) => {
            const jsonPath = mapping.jsonPath.trim();
            const targetSelector = mapping.targetSelector.trim();
            if (!jsonPath || !targetSelector) {
                throw new Error("Each mapping requires a JSON path and target selector.");
            }
            return {
                id: mapping.id ?? (0, crypto_1.randomUUID)(),
                jsonPath,
                targetSelector,
                targetType: mapping.targetType,
                targetProperty: mapping.targetProperty ?? null,
                formatter: mapping.formatter ?? "none",
                conditionJson: mapping.condition ? JSON.stringify(mapping.condition) : null,
                fallbackValue: mapping.fallbackValue ?? null,
                sortOrder: mapping.sortOrder ?? index + 1,
            };
        });
        const saved = this.mappings.replaceForDisplay({
            displayId,
            mappings: normalized,
            userId: actor.userId,
        });
        if (!options?.skipActivity) {
            this.recordActivity?.({
                type: "display.data-mappings-updated",
                message: `Updated data mappings for "${options?.displayName ?? display.name}".`,
                actor: { id: actor.userId, name: actor.name, email: actor.email },
                metadata: {
                    projectId: project.id,
                    displayId,
                    mappingCount: saved.length,
                },
            });
        }
        return saved;
    }
}
exports.DisplayDataMappingService = DisplayDataMappingService;
function injectDisplayMappingRuntime(html, mappings) {
    if (mappings.length === 0)
        return html;
    const payload = `<script>window.__NEUD_DISPLAY_MAPPINGS__=${JSON.stringify(mappings)};</script>`;
    const runtime = `<script src="/displays/shared/display-data-mapping.js?v=20260721"></script>`;
    const injection = `${payload}${runtime}`;
    if (html.includes("</body>")) {
        return html.replace("</body>", `${injection}</body>`);
    }
    return `${html}${injection}`;
}
