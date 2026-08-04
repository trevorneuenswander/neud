const GENERIC_REVISION_MESSAGES = new Set([
  "Scraper code published",
  "Display code published",
  "Initial scraper seed",
  "Initial display seed",
  "Display created",
]);

export const MAX_REVISION_NAME_LENGTH = 120;
export const MAX_REVISION_CHANGE_NOTE_LENGTH = 500;

export function normalizeRevisionName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_REVISION_NAME_LENGTH);
}

export function normalizeChangeNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_REVISION_CHANGE_NOTE_LENGTH);
}

export function buildRevisionMessage(input: {
  revisionName?: string | null;
  changeNote?: string | null;
  fallback: string;
}): string {
  const revisionName = normalizeRevisionName(input.revisionName);
  if (revisionName) {
    return revisionName;
  }
  return input.fallback;
}

export function isGenericRevisionMessage(message: string | null | undefined): boolean {
  const trimmed = message?.trim();
  if (!trimmed) {
    return true;
  }
  return GENERIC_REVISION_MESSAGES.has(trimmed) || trimmed.startsWith("Restored revision");
}

const BAG_ADAPTER_FILES = [
  "index.js",
  "engine-runtime.js",
  "adapters/registry.js",
  "adapters/bag-auction.js",
  "adapters/bag-auction-legacy-runtime.js",
  "adapters/bag-lot-detail-page.js",
  "adapters/bag-photo-download.js",
  "adapters/legacy-puppeteer-resolver.js",
  "adapters/webpage-scraper/browser.js",
  "browser/resolve-puppeteer-browser.js",
  "bag-login-flow.js",
  "bag-diagnostics.js",
  "bag-runtime-config.js",
  "local-client.js",
  "snapshots.js",
  "heartbeat.js",
  "commands.js",
  "config.js",
];

const GENERIC_ADAPTER_FILES = [
  "index.js",
  "engine-runtime.js",
  "adapters/registry.js",
  "adapters/generic-webpage.js",
  "adapters/webpage-scraper/browser.js",
  "browser/resolve-puppeteer-browser.js",
  "local-client.js",
  "snapshots.js",
  "heartbeat.js",
  "commands.js",
  "config.js",
];

export function resolveRunningRuntimeFilePaths(adapterName: string | null | undefined): Set<string> {
  const paths =
    adapterName === "bag-auction"
      ? BAG_ADAPTER_FILES
      : adapterName === "generic-webpage"
        ? GENERIC_ADAPTER_FILES
        : ["index.js", "engine-runtime.js", "adapters/registry.js"];
  return new Set(paths);
}
