"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLotKey = getLotKey;
function getLotKey(lot) {
    if (!lot)
        return "";
    if (lot.id)
        return `id:${lot.id}`;
    const raw = (lot.lotNumber ?? lot.lot ?? "")
        .replace(/^lot\s+/i, "")
        .trim()
        .toLowerCase();
    return raw ? `lot:${raw}` : "";
}
