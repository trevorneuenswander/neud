"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareLotNumbers = compareLotNumbers;
function readLotSortKey(lotNumber) {
    const trimmed = lotNumber.replace(/^lot\s+/i, "").trim();
    const match = trimmed.match(/^(\d+)(.*)$/i);
    if (!match) {
        return { prefix: Number.MAX_SAFE_INTEGER, suffix: trimmed.toLowerCase() };
    }
    return {
        prefix: Number.parseInt(match[1], 10),
        suffix: (match[2] ?? "").toLowerCase(),
    };
}
function compareLotNumbers(left, right) {
    const leftKey = readLotSortKey(left);
    const rightKey = readLotSortKey(right);
    if (leftKey.prefix !== rightKey.prefix) {
        return leftKey.prefix - rightKey.prefix;
    }
    if (leftKey.suffix !== rightKey.suffix) {
        return leftKey.suffix.localeCompare(rightKey.suffix, undefined, { numeric: true });
    }
    return left.localeCompare(right, undefined, { numeric: true });
}
