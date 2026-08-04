"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashCanonicalProjectData = hashCanonicalProjectData;
const crypto_1 = require("crypto");
function stableSerialize(value) {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
    }
    const record = value;
    const keys = Object.keys(record).sort();
    return `{${keys
        .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
        .join(",")}}`;
}
function hashCanonicalProjectData(data) {
    return (0, crypto_1.createHash)("sha256").update(stableSerialize(data)).digest("hex");
}
