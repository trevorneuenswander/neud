"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmail = normalizeEmail;
function normalizeEmail(email) {
    return String(email ?? "").trim().toLowerCase();
}
