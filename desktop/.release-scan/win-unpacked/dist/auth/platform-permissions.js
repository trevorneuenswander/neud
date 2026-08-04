"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPlatformAdministrator = isPlatformAdministrator;
exports.canManageApplication = canManageApplication;
exports.canCreateProject = canCreateProject;
exports.canDeleteProject = canDeleteProject;
exports.canManageProject = canManageProject;
exports.canCreateUser = canCreateUser;
exports.canInviteUser = canInviteUser;
exports.canViewUserList = canViewUserList;
exports.canAssignUserToProject = canAssignUserToProject;
exports.canRemoveUserFromProject = canRemoveUserFromProject;
exports.canAssignRole = canAssignRole;
exports.canEditUser = canEditUser;
exports.canDeleteUser = canDeleteUser;
exports.canOperateProject = canOperateProject;
exports.canViewProject = canViewProject;
exports.hasGlobalProjectAccess = hasGlobalProjectAccess;
const application_roles_1 = require("./application-roles");
function actorRole(actor) {
    return (0, application_roles_1.getApplicationRole)(actor);
}
function isPlatformAdministrator(actor) {
    return (0, application_roles_1.isElevatedApplicationRole)(actorRole(actor));
}
function canManageApplication(actor) {
    return isPlatformAdministrator(actor);
}
function canCreateProject(actor) {
    const role = actorRole(actor);
    return role === "owner" || role === "admin";
}
function canDeleteProject(actor) {
    const role = actorRole(actor);
    return role === "owner" || role === "admin";
}
function canManageProject(actor) {
    return isPlatformAdministrator(actor);
}
function canCreateUser(actor) {
    return isPlatformAdministrator(actor);
}
function canInviteUser(actor) {
    return canCreateUser(actor);
}
function canViewUserList(actor) {
    return isPlatformAdministrator(actor);
}
function canAssignUserToProject(actor) {
    return isPlatformAdministrator(actor);
}
function canRemoveUserFromProject(actor) {
    return isPlatformAdministrator(actor);
}
function canAssignRole(actor, targetUser, requestedRole) {
    const actorAppRole = actorRole(actor);
    const targetAppRole = (0, application_roles_1.getApplicationRole)(targetUser);
    const nextRole = (0, application_roles_1.getApplicationRole)({ role: requestedRole });
    if (actorAppRole === "viewer" || actorAppRole === "operator") {
        return false;
    }
    if (actorAppRole === "admin") {
        if (nextRole === "owner") {
            return false;
        }
        if (targetAppRole === "owner") {
            return false;
        }
        if (targetAppRole === "admin" && actor?.id !== targetUser.id) {
            return false;
        }
        return nextRole === "admin" || nextRole === "operator" || nextRole === "viewer";
    }
    if (actorAppRole === "owner") {
        return (nextRole === "owner" ||
            nextRole === "admin" ||
            nextRole === "operator" ||
            nextRole === "viewer");
    }
    return false;
}
function canEditUser(actor, targetUser) {
    const actorAppRole = actorRole(actor);
    const targetAppRole = (0, application_roles_1.getApplicationRole)(targetUser);
    if (actorAppRole === "viewer" || actorAppRole === "operator") {
        return false;
    }
    if (actorAppRole === "owner") {
        if (targetAppRole === "owner") {
            return actor?.id === targetUser.id;
        }
        return true;
    }
    if (actorAppRole === "admin") {
        if (targetAppRole === "owner") {
            return false;
        }
        if (targetAppRole === "admin") {
            return actor?.id === targetUser.id;
        }
        return targetAppRole === "operator" || targetAppRole === "viewer";
    }
    return false;
}
function canDeleteUser(actor, targetUser, options) {
    const actorAppRole = actorRole(actor);
    const targetAppRole = (0, application_roles_1.getApplicationRole)(targetUser);
    if (actorAppRole === "viewer" || actorAppRole === "operator") {
        return false;
    }
    if (targetAppRole === "owner") {
        if (actorAppRole !== "owner") {
            return false;
        }
        return (options?.activeOwnerCount ?? 0) > 1;
    }
    if (targetAppRole === "admin") {
        return actorAppRole === "owner";
    }
    if (actorAppRole === "owner" || actorAppRole === "admin") {
        return targetAppRole === "operator" || targetAppRole === "viewer";
    }
    return false;
}
function canOperateProject(actor) {
    const role = actorRole(actor);
    return role === "owner" || role === "admin" || role === "operator";
}
function canViewProject(actor) {
    const role = actorRole(actor);
    return (role === "owner" ||
        role === "admin" ||
        role === "operator" ||
        role === "viewer");
}
function hasGlobalProjectAccess(actor) {
    return isPlatformAdministrator(actor);
}
