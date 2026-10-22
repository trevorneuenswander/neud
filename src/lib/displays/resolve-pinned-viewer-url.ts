import {
  buildLowerTickerV5ViewerPath,
  buildNewBidDisplayV1ViewerPath,
  buildNewTickerV1ViewerPath,
  buildPylonViewerPath,
  LOWER_TICKER_V5_DISPLAY_ID,
  NEW_BID_DISPLAY_V1_ID,
  NEW_TICKER_V1_ID,
  PYLON_DISPLAY_ID,
} from "@/lib/displays/registry";
import { buildProjectDisplayOutputPath } from "@/lib/displays/display-view-mode";
import { resolveDisplayPreviewProjectId } from "@/lib/displays/resolve-display-preview-project-id";

/** Built-in registry displays (Pylon, tickers, bid display) resolve to fixed viewer paths. */
function resolveRegistryViewerUrl(displayKey: string, origin: string): string | null {
  if (displayKey === PYLON_DISPLAY_ID || displayKey === "pylon") {
    return buildPylonViewerPath(origin);
  }
  if (displayKey === LOWER_TICKER_V5_DISPLAY_ID || displayKey === "lower-ticker-v5") {
    return buildLowerTickerV5ViewerPath(origin);
  }
  if (displayKey === NEW_BID_DISPLAY_V1_ID || displayKey === "new-bid-display-v1") {
    return buildNewBidDisplayV1ViewerPath(origin);
  }
  if (displayKey === NEW_TICKER_V1_ID || displayKey === "new-ticker-v1") {
    return buildNewTickerV1ViewerPath(origin);
  }
  return null;
}

export function resolvePinnedViewerUrl(input: {
  displayKey: string;
  url: string;
}): string {
  if (typeof window === "undefined") {
    return input.url;
  }
  return resolveRegistryViewerUrl(input.displayKey, window.location.origin) ?? input.url;
}

/**
 * Local URL for a pinned display — same resolution as Displays management cards:
 * - registry displays: fixed viewer path (DisplayCard)
 * - custom displays: `/display/{projectId}/{slug}?mode=output` (BroadArrowTypedDisplayCard,
 *   DeveloperHtmlDisplayCard)
 */
export function resolvePinnedDisplayLocalUrl(input: {
  projectId: string;
  displayProjectId?: string | null;
  displayKey: string;
  url: string;
  slug?: string | null;
}): string {
  if (typeof window === "undefined") {
    return input.url;
  }
  const origin = window.location.origin;
  const registryUrl = resolveRegistryViewerUrl(input.displayKey, origin);
  if (registryUrl) {
    return registryUrl;
  }
  const slug = input.slug?.trim();
  if (slug) {
    return buildProjectDisplayOutputPath(
      resolveDisplayPreviewProjectId(input.projectId, input.displayProjectId),
      slug,
      { origin },
    );
  }
  return input.url;
}
