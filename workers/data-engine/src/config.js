export function parseBoundedInteger(raw, defaultValue, min, max) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, parsed));
}

export function getProtocolTimeoutMs() {
  return parseBoundedInteger(
    process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS,
    120000,
    30000,
    900000,
  );
}

export function getPageTimeoutMs() {
  return parseBoundedInteger(process.env.PUPPETEER_PAGE_TIMEOUT_MS, 60000, 5000, 300000);
}

export function getNavigationTimeoutMs() {
  return parseBoundedInteger(
    process.env.PUPPETEER_NAVIGATION_TIMEOUT_MS,
    60000,
    5000,
    300000,
  );
}

export function getCommandStaleAfterMs() {
  return parseBoundedInteger(process.env.COMMAND_STALE_AFTER_MS, 600000, 60000, 3600000);
}
