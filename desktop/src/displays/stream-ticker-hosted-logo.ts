import { STREAM_TICKER_LOGO_DATA_URI } from "./stream-ticker-logo-data-uri.generated.js";

export const STREAM_TICKER_LOGO_ASSET_PATH = "/displays/pylon/logo.png";

export function isStreamTickerLogoReference(html: string): boolean {
  return html.includes(STREAM_TICKER_LOGO_ASSET_PATH);
}

export function inlineStreamTickerLogoForHosted(
  html: string,
  logoDataUri: string = STREAM_TICKER_LOGO_DATA_URI,
): string {
  if (!logoDataUri.startsWith("data:image/")) {
    return html;
  }
  return html.replace(
    new RegExp(`src="${STREAM_TICKER_LOGO_ASSET_PATH.replace(/\//g, "\\/")}"`, "gi"),
    `src="${logoDataUri}"`,
  );
}

export function resolveStreamTickerLogoFailureStage(input: {
  htmlPresent: boolean;
  logoReferencePresent: boolean;
  logoInlined: boolean;
  logoDataUriPresent: boolean;
}) {
  if (!input.htmlPresent) {
    return "asset_not_synced";
  }
  if (!input.logoReferencePresent && !input.logoInlined) {
    return "local_asset_reference_invalid";
  }
  if (input.logoReferencePresent && !input.logoInlined) {
    return "relative_url_without_base";
  }
  if (input.logoInlined) {
    return "none";
  }
  return "hosted_asset_url_missing";
}
