"use strict";
/** Calendar-day helpers using the runtime local timezone. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.localStatsDayKey = localStatsDayKey;
exports.startOfDayInLocalTimezone = startOfDayInLocalTimezone;
exports.isTimestampOnLocalCalendarDay = isTimestampOnLocalCalendarDay;
exports.isTimestampSinceStartOfLocalDay = isTimestampSinceStartOfLocalDay;
function localStatsDayKey(now = new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function startOfDayInLocalTimezone(now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
}
function isTimestampOnLocalCalendarDay(isoTimestamp, dayKey = localStatsDayKey()) {
    const parsed = new Date(isoTimestamp);
    if (Number.isNaN(parsed.getTime())) {
        return false;
    }
    return localStatsDayKey(parsed) === dayKey;
}
function isTimestampSinceStartOfLocalDay(isoTimestamp, now = new Date()) {
    const parsed = new Date(isoTimestamp);
    if (Number.isNaN(parsed.getTime())) {
        return false;
    }
    const start = startOfDayInLocalTimezone(now).getTime();
    const ts = parsed.getTime();
    return ts >= start && ts <= now.getTime();
}
