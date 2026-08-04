"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_API_ERROR_CODES = void 0;
exports.localApiErrorResponse = localApiErrorResponse;
exports.LOCAL_API_ERROR_CODES = {
    AUTH_REQUIRED: "AUTH_REQUIRED",
    FORBIDDEN: "FORBIDDEN",
    PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
    LOCAL_IDENTITY_UNAVAILABLE: "LOCAL_IDENTITY_UNAVAILABLE",
    ENGINE_INITIALIZATION_FAILED: "ENGINE_INITIALIZATION_FAILED",
};
function localApiErrorResponse(code, message) {
    return { error: message, code };
}
