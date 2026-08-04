"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSafeResourceId = assertSafeResourceId;
exports.resolvePathWithinRoot = resolvePathWithinRoot;
exports.sanitizeDisplaySlug = sanitizeDisplaySlug;
const path_1 = __importDefault(require("path"));
const SAFE_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
function assertSafeResourceId(value, label) {
    const trimmed = value.trim();
    if (!trimmed || !SAFE_ID_PATTERN.test(trimmed) || trimmed.includes("..")) {
        throw new Error(`Invalid ${label}.`);
    }
}
function resolvePathWithinRoot(root, ...segments) {
    const resolvedRoot = path_1.default.resolve(root);
    const resolved = path_1.default.resolve(resolvedRoot, ...segments);
    if (resolved !== resolvedRoot &&
        !resolved.startsWith(`${resolvedRoot}${path_1.default.sep}`)) {
        throw new Error("Path traversal rejected.");
    }
    return resolved;
}
function sanitizeDisplaySlug(value) {
    return value.trim().toLowerCase();
}
