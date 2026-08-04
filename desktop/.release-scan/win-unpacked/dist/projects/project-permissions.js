"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canManageProjectSettings = canManageProjectSettings;
exports.normalizeProjectIsActive = normalizeProjectIsActive;
exports.canAccessProject = canAccessProject;
exports.resolveAuthenticatedProjectRole = resolveAuthenticatedProjectRole;
const application_roles_1 = require("../auth/application-roles");
function canManageProjectSettings(role) {
    return role === "owner" || role === "admin";
}
function normalizeProjectIsActive(project) {
    if (typeof project.isActive === "boolean") {
        return project.isActive;
    }
    if (typeof project.is_active === "boolean") {
        return project.is_active;
    }
    if (typeof project.is_active === "number") {
        return project.is_active !== 0;
    }
    return true;
}
function canAccessProject(role, project) {
    if (normalizeProjectIsActive(project)) {
        return true;
    }
    return canManageProjectSettings(role);
}
function resolveAuthenticatedProjectRole(user) {
    return (0, application_roles_1.getApplicationRole)(user);
}
