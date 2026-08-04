"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPollingInterval = formatPollingInterval;
function formatPollingInterval(ms) {
    if (ms === null)
        return "—";
    const totalSeconds = ms / 1000;
    if (totalSeconds < 60) {
        if (totalSeconds === 1) {
            return "1 second";
        }
        const label = Number.isInteger(totalSeconds) ? String(totalSeconds) : String(totalSeconds);
        return `${label} seconds`;
    }
    const wholeMinutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds - wholeMinutes * 60);
    if (seconds === 0) {
        if (wholeMinutes === 60) {
            return "1 hour";
        }
        return wholeMinutes === 1 ? "1 minute" : `${wholeMinutes} minutes`;
    }
    const minuteLabel = wholeMinutes === 1 ? "1 minute" : `${wholeMinutes} minutes`;
    const secondLabel = seconds === 1 ? "1 second" : `${seconds} seconds`;
    return `${minuteLabel} ${secondLabel}`;
}
