"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveBroadArrowReserveStatusLabel = deriveBroadArrowReserveStatusLabel;
exports.readReserveDetailsFromDetail = readReserveDetailsFromDetail;
function deriveBroadArrowReserveStatusLabel(input) {
    if (input.noReserve) {
        return "No Reserve";
    }
    if (input.reservesOff) {
        return "Reserve Off";
    }
    if (input.reservePrice !== null && input.reservePrice > 0) {
        return "Reserve";
    }
    return "Unknown";
}
function readReserveDetailsFromDetail(detail) {
    return {
        noReserve: detail.noReserve === true,
        reservesOff: detail.reservesOff === true,
        reservePriceRaw: typeof detail.reservePriceRaw === "string" ? detail.reservePriceRaw : null,
        reservePrice: typeof detail.reservePrice === "number" && Number.isFinite(detail.reservePrice)
            ? detail.reservePrice
            : null,
    };
}
