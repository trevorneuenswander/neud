import { isBroadArrowCanonicalProject } from "../bag/broad-arrow-phase";
import {
  hasEmbeddedLegacyPylonBridge,
  hasEmbeddedLegacyTickerBridge,
  readLegacyPylonLiveBridgeScript,
  readLegacyTickerLiveBridgeScript,
  transformLegacyPylonHtmlForServing,
  transformLegacyTickerHtmlForServing,
} from "./legacy-display-v2-transform";

export const LEGACY_TICKER_RUNTIME_ADAPTER_KEY = "broad-arrow-legacy-ticker";
export const LEGACY_PYLON_RUNTIME_ADAPTER_KEY = "broad-arrow-legacy-pylon";

export type DisplayRuntimeAdapterContext = {
  projectId: string;
  projectSlug: string;
  displayId: string;
  slug: string;
  displayKey: string;
  settings?: Record<string, unknown>;
  runtimeAdapterKey?: string | null;
};

export type HtmlDisplayRuntimeAdapter = {
  id: string;
  appliesTo: (display: DisplayRuntimeAdapterContext) => boolean;
  transformServedHtml: (html: string) => string;
};

export function resolveDisplayRuntimeAdapterKey(
  display: DisplayRuntimeAdapterContext,
): string | null {
  const configured = display.runtimeAdapterKey ?? display.settings?.runtimeAdapterKey;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }

  if (
    (display.slug === "legacy-ticker" || display.displayKey === "legacy-ticker") &&
    isBroadArrowCanonicalProject({ slug: display.projectSlug })
  ) {
    return LEGACY_TICKER_RUNTIME_ADAPTER_KEY;
  }

  if (
    (display.slug === "legacy-pylon" || display.displayKey === "legacy-pylon") &&
    isBroadArrowCanonicalProject({ slug: display.projectSlug })
  ) {
    return LEGACY_PYLON_RUNTIME_ADAPTER_KEY;
  }

  return null;
}

const HTML_DISPLAY_RUNTIME_ADAPTERS: HtmlDisplayRuntimeAdapter[] = [
  {
    id: LEGACY_TICKER_RUNTIME_ADAPTER_KEY,
    appliesTo: (display) =>
      resolveDisplayRuntimeAdapterKey(display) === LEGACY_TICKER_RUNTIME_ADAPTER_KEY,
    transformServedHtml: (html) => transformLegacyTickerHtmlForServing(html),
  },
  {
    id: LEGACY_PYLON_RUNTIME_ADAPTER_KEY,
    appliesTo: (display) =>
      resolveDisplayRuntimeAdapterKey(display) === LEGACY_PYLON_RUNTIME_ADAPTER_KEY,
    transformServedHtml: (html) => transformLegacyPylonHtmlForServing(html),
  },
];

export function applyHtmlDisplayRuntimeAdapters(
  html: string,
  display: DisplayRuntimeAdapterContext,
): string {
  let result = html;
  for (const adapter of HTML_DISPLAY_RUNTIME_ADAPTERS) {
    if (adapter.appliesTo(display)) {
      result = adapter.transformServedHtml(result);
    }
  }
  return result;
}

export function listHtmlDisplayRuntimeAdapters(): HtmlDisplayRuntimeAdapter[] {
  return [...HTML_DISPLAY_RUNTIME_ADAPTERS];
}

export function readLegacyTickerAdapterScriptForTests(): string {
  return readLegacyTickerLiveBridgeScript();
}

export function readLegacyPylonAdapterScriptForTests(): string {
  return readLegacyPylonLiveBridgeScript();
}

export function hasLegacyTickerAdapterMarkers(html: string): boolean {
  return hasEmbeddedLegacyTickerBridge(html);
}

export function hasLegacyPylonAdapterMarkers(html: string): boolean {
  return hasEmbeddedLegacyPylonBridge(html);
}
