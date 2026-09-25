"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_OWNER_REMOVAL_MESSAGE = exports.PROJECT_OWNER_REMOVAL_ERROR_CODE = void 0;
exports.isProtectedNeudOwnerUser = isProtectedNeudOwnerUser;
const DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com";
function normalize(value) {
    return value.trim().toLowerCase();
}
function isProtectedNeudOwnerUser(user) {
    return (normalize(user.email) === normalize(DEFAULT_OWNER_EMAIL) &&
        (user.platformRole ?? "").toLowerCase() === "owner");
}
exports.PROJECT_OWNER_REMOVAL_ERROR_CODE = "owner_protected";
exports.PROJECT_OWNER_REMOVAL_MESSAGE = "The NEUD Owner cannot be removed from a project.";
