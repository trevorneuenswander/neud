/**
 * Pure host-state logic for the HTML display output route (the page behind a Local URL).
 *
 * The output host renders an empty transparent frame until it knows the display is enabled
 * and published. A single failed or early metadata request (common while the local API is
 * still starting on Windows) used to leave that transparent frame in place forever, so an
 * authored opaque display such as Stream Bid never appeared. The host now keeps retrying
 * until the display is ready.
 */

export type HtmlDisplayOutputMeta = {
  enabled?: boolean;
  publishedRevisionId?: string | null;
};

export type HtmlDisplayOutputState =
  | "resolving"
  | "unavailable"
  | "disabled"
  | "unpublished"
  | "ready";

export function resolveHtmlDisplayOutputState(input: {
  resolved: boolean;
  meta: HtmlDisplayOutputMeta | null;
  fallbackPublishedRevisionId?: string | null;
}): HtmlDisplayOutputState {
  if (!input.resolved) return "resolving";
  if (!input.meta) return "unavailable";
  if (input.meta.enabled !== true) return "disabled";
  const revisionId = input.meta.publishedRevisionId ?? input.fallbackPublishedRevisionId ?? null;
  if (!revisionId) return "unpublished";
  return "ready";
}

/** Every state except "ready" renders a transparent placeholder and must keep checking. */
export function shouldRetryHtmlDisplayOutputMeta(state: HtmlDisplayOutputState): boolean {
  return state !== "ready";
}

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000] as const;
export const HTML_DISPLAY_OUTPUT_MAX_RETRY_DELAY_MS = 5000;

/** Backoff for the Nth retry (0-based): 0.5s, 1s, 2s, 4s, then every 5s. */
export function nextHtmlDisplayOutputRetryDelayMs(attempt: number): number {
  const index = Math.max(0, Math.floor(attempt));
  return RETRY_DELAYS_MS[index] ?? HTML_DISPLAY_OUTPUT_MAX_RETRY_DELAY_MS;
}
