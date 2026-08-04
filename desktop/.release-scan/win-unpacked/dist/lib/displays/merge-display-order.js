"use strict";
/** Merge saved per-user display order with the current display list. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeDisplayOrder = mergeDisplayOrder;
function mergeDisplayOrder(displays, savedOrder) {
    if (displays.length === 0)
        return displays;
    if (savedOrder.length === 0) {
        return [...displays].sort((left, right) => {
            const leftCreated = left.created_at ?? left.createdAt ?? "";
            const rightCreated = right.created_at ?? right.createdAt ?? "";
            return leftCreated.localeCompare(rightCreated);
        });
    }
    const byId = new Map(displays.map((display) => [display.id, display]));
    const ordered = [];
    const seen = new Set();
    const sortedSaved = [...savedOrder].sort((left, right) => left.sortIndex - right.sortIndex);
    for (const entry of sortedSaved) {
        const display = byId.get(entry.displayId);
        if (display && !seen.has(display.id)) {
            ordered.push(display);
            seen.add(display.id);
        }
    }
    const fallback = [...displays]
        .filter((display) => !seen.has(display.id))
        .sort((left, right) => {
        const leftCreated = left.created_at ?? left.createdAt ?? "";
        const rightCreated = right.created_at ?? right.createdAt ?? "";
        return leftCreated.localeCompare(rightCreated);
    });
    return [...ordered, ...fallback];
}
