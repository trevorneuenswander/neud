import {
  DISPLAY_RUNTIME_PUBLISHER_SCRIPT,
  HOSTED_BRIDGE_INBOUND_SCRIPT,
  NORMALIZE_DISPLAY_RUNTIME_SCRIPT,
} from "./display-runtime-embedded.generated.js";
import {
  inlineStreamTickerLogoForHosted,
  isStreamTickerLogoReference,
} from "../../../shared/display-runtime/stream-ticker-hosted-logo";
import {
  applyHostedLegacyDisplayAdapters,
  type HostedLegacyDisplayAdapterContext,
} from "./hosted-legacy-display-adapters";

export { HOSTED_BRIDGE_INBOUND_SCRIPT };

export const DISPLAY_BRIDGE_SCRIPT = `${NORMALIZE_DISPLAY_RUNTIME_SCRIPT}
${DISPLAY_RUNTIME_PUBLISHER_SCRIPT}
window.NEUDDisplay = window.NEUDDisplay || window.createNeudDisplayBridge();`;

const HOSTED_RUNTIME_DISCONNECT_SCRIPT =
  '<script>window.__NEUD_DISPLAY_DATA_DISCONNECTED__=true;</script>';

const HOSTED_RUNTIME_BOOTSTRAP_SCRIPT = `<script>(function bootstrapNeudHostedRuntimeReady(){
  if (!window.__NEUD_DISPLAY_DATA_DISCONNECTED__) {
    return;
  }
  function emitReady() {
    if (window.NEUDDisplay && typeof window.NEUDDisplay.signalReady === "function") {
      window.NEUDDisplay.signalReady();
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", emitReady);
  } else {
    emitReady();
  }
})();</script>`;

export const HOSTED_DISPLAY_BRIDGE_MARKER = "<!-- neud-hosted-bridge:v3 -->";

function injectIntoHead(html: string, injection: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${injection}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1>\n<head>${injection}</head>`);
  }
  return `${injection}\n${html}`;
}

/** Prepare published HTML for hosted parent-push runtime (no self-polling). */
export function prepareHostedDisplayDocument(
  htmlContent: string,
  context: HostedLegacyDisplayAdapterContext = {},
): string {
  const legacyAdaptedHtml = applyHostedLegacyDisplayAdapters(htmlContent, context);
  const hostedHtml = isStreamTickerLogoReference(legacyAdaptedHtml)
    ? inlineStreamTickerLogoForHosted(legacyAdaptedHtml)
    : legacyAdaptedHtml;
  const transparentDocumentStyle =
    '<style id="neud-hosted-transparent-doc">html,body{background:transparent!important;}</style>';
  const bridgeInjection = `${HOSTED_DISPLAY_BRIDGE_MARKER}
<script>${DISPLAY_BRIDGE_SCRIPT}</script>
${HOSTED_RUNTIME_DISCONNECT_SCRIPT}
<script>${HOSTED_BRIDGE_INBOUND_SCRIPT}</script>
${HOSTED_RUNTIME_BOOTSTRAP_SCRIPT}`;
  if (/<html[\s>]/i.test(htmlContent)) {
    const withBridge = injectIntoHead(hostedHtml, bridgeInjection);
    if (withBridge.includes('id="neud-hosted-transparent-doc"')) {
      return withBridge;
    }
    return injectIntoHead(withBridge, transparentDocumentStyle);
  }
  return buildDisplayPreviewDocument({ html: hostedHtml });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDisplayPreviewDocument(input: {
  html: string;
  css?: string;
  javascript?: string;
  title?: string;
  dataUrl?: string;
  displayInfo?: Record<string, unknown>;
}): string {
  const configScript = input.dataUrl
    ? `<script>window.__NEUD_DISPLAY_CONFIG__ = ${JSON.stringify({
        dataUrl: input.dataUrl,
        displayInfo: input.displayInfo ?? {},
        localApiBase: "http://127.0.0.1:8070",
        debug: true,
      })};</script>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title ?? "NEUD Display Preview")}</title>
    <style>${input.css ?? ""}</style>
    <script>${DISPLAY_BRIDGE_SCRIPT}</script>
    ${configScript}
    ${input.dataUrl ? `<script src="/neud-display-runtime.js"></script>` : ""}
  </head>
  <body>
    ${input.html}
    <script>${input.javascript ?? ""}</script>
  </body>
</html>`;
}
