"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENERIC_LOGIN_SOURCE_KEY = exports.GENERIC_PAGE_SOURCE_KEY = exports.GENERIC_EXTRACTION_TYPES = void 0;
exports.isGenericWebpageSnapshot = isGenericWebpageSnapshot;
exports.GENERIC_EXTRACTION_TYPES = ["text", "html", "attribute"];
exports.GENERIC_PAGE_SOURCE_KEY = "page";
exports.GENERIC_LOGIN_SOURCE_KEY = "login";
function isGenericWebpageSnapshot(data) {
    return (data?.adapter === "generic-webpage" &&
        data?.schemaVersion === 1 &&
        typeof data.sourceUrl === "string");
}
