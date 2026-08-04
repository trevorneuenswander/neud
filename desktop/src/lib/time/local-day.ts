/** Calendar-day helpers using the runtime local timezone. */

export function localStatsDayKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfDayInLocalTimezone(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function isTimestampOnLocalCalendarDay(
  isoTimestamp: string,
  dayKey = localStatsDayKey(),
): boolean {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return localStatsDayKey(parsed) === dayKey;
}

export function isTimestampSinceStartOfLocalDay(
  isoTimestamp: string,
  now = new Date(),
): boolean {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const start = startOfDayInLocalTimezone(now).getTime();
  const ts = parsed.getTime();
  return ts >= start && ts <= now.getTime();
}
