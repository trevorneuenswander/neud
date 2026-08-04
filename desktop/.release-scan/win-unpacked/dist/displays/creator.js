"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREATOR_ACCOUNT_EMAIL = exports.DEFAULT_PROJECT_CREATOR = void 0;
exports.resolveProjectCreator = resolveProjectCreator;
const default_owner_email_1 = require("../auth/default-owner-email");
exports.DEFAULT_PROJECT_CREATOR = {
    name: "Trevor Neuenswander",
    email: default_owner_email_1.DEFAULT_OWNER_EMAIL,
};
exports.CREATOR_ACCOUNT_EMAIL = exports.DEFAULT_PROJECT_CREATOR.email.toLowerCase();
function resolveProjectCreator(authUser) {
    const email = authUser?.email?.trim().toLowerCase() ?? "";
    if (email === exports.CREATOR_ACCOUNT_EMAIL) {
        const name = authUser?.displayName?.trim() ||
            authUser?.fullName?.trim() ||
            exports.DEFAULT_PROJECT_CREATOR.name;
        return {
            name,
            email: authUser?.email?.trim() || exports.DEFAULT_PROJECT_CREATOR.email,
        };
    }
    return exports.DEFAULT_PROJECT_CREATOR;
}
