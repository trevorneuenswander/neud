/**
 * ESM preload hook for untouched legacy server.js submit instrumentation.
 * Patches ElementHandle.click without altering server.js login logic.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const legacyRoot = process.env.NEUD_LEGACY_SERVER_ROOT
  ? path.resolve(process.env.NEUD_LEGACY_SERVER_ROOT)
  : path.resolve(process.cwd());

const diagnosticFile = process.env.NEUD_LEGACY_DIAG_FILE?.trim();
const elementHandlePath = path.join(
  legacyRoot,
  "node_modules",
  "puppeteer-core",
  "lib",
  "esm",
  "puppeteer",
  "api",
  "ElementHandle.js",
);

const { ElementHandle } = await import(pathToFileURL(elementHandlePath).href);
const originalClick = ElementHandle.prototype.click;

function sanitizeOuterHtml(outerHTML) {
  return String(outerHTML ?? "")
    .replace(/value="[^"]*"/gi, 'value="[redacted]"')
    .replace(/value='[^']*'/gi, "value='[redacted]'")
    .slice(0, 500);
}

function attachPageListeners(page, sink) {
  const onFrameNavigated = (frame) => {
    if (frame === page.mainFrame()) {
      sink.events.push({ type: "framenavigated", url: frame.url() });
    }
  };
  const onRequest = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      sink.events.push({
        type: "request",
        url: request.url(),
        method: request.method(),
      });
    }
  };
  const onResponse = (response) => {
    const request = response.request();
    if (request.isNavigationRequest()) {
      sink.events.push({
        type: "response",
        url: response.url(),
        status: response.status(),
      });
    }
  };
  const onConsole = (message) => {
    sink.events.push({ type: "console", text: message.text().slice(0, 200) });
  };
  const onPageError = (error) => {
    sink.events.push({
      type: "pageerror",
      text: error instanceof Error ? error.message : String(error).slice(0, 200),
    });
  };

  page.on("framenavigated", onFrameNavigated);
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  return () => {
    page.off("framenavigated", onFrameNavigated);
    page.off("request", onRequest);
    page.off("response", onResponse);
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  };
}

ElementHandle.prototype.click = async function legacyInstrumentedClick(...args) {
  const page = this.frame?.()?.page?.();
  const diagnostics = {
    events: [],
    urlBeforeSubmit: page?.url?.() ?? null,
    urlAfterSubmit: null,
    submitSelectorFound: true,
    submitClicked: false,
    submitClickStartedAt: new Date().toISOString(),
    submitClickCompletedAt: null,
    submitClickDurationMs: null,
    navigationStarted: false,
    submitCompatibilityFallbackUsed: false,
    loginRouteRemaining: null,
    submitElement: null,
  };

  let detachListeners = () => {};
  if (page) {
    detachListeners = attachPageListeners(page, diagnostics);

    try {
      diagnostics.submitElement = await page.evaluate(() => {
        const element = document.querySelector(
          'button[type="submit"], input[type="submit"]',
        );
        if (!element) return null;
        const clone = element.cloneNode(true);
        if (clone instanceof HTMLInputElement) {
          clone.value = "[redacted]";
        }
        return {
          tagName: element.tagName,
          type: element.getAttribute("type"),
          outerHTML: clone.outerHTML,
          visible: !!(
            element.offsetWidth ||
            element.offsetHeight ||
            element.getClientRects().length
          ),
          enabled: !element.disabled,
          connected: element.isConnected,
        };
      });
      if (diagnostics.submitElement?.outerHTML) {
        diagnostics.submitElement.outerHTML = sanitizeOuterHtml(
          diagnostics.submitElement.outerHTML,
        );
      }
    } catch {
      diagnostics.submitElement = null;
    }

    const markNavigationStarted = () => {
      diagnostics.navigationStarted = true;
    };
    page.on("framenavigated", markNavigationStarted);

    try {
      await originalClick.apply(this, args);
      diagnostics.submitClicked = true;
    } finally {
      page.off("framenavigated", markNavigationStarted);
      detachListeners();
    }
  } else {
    await originalClick.apply(this, args);
    diagnostics.submitClicked = true;
  }

  diagnostics.submitClickCompletedAt = new Date().toISOString();
  diagnostics.submitClickDurationMs =
    Date.parse(diagnostics.submitClickCompletedAt) -
    Date.parse(diagnostics.submitClickStartedAt);
  diagnostics.urlAfterSubmit = page?.url?.() ?? diagnostics.urlBeforeSubmit;
  diagnostics.loginRouteRemaining = Boolean(
    diagnostics.urlAfterSubmit?.includes("/users/sign_in"),
  );

  if (diagnosticFile) {
    fs.mkdirSync(path.dirname(diagnosticFile), { recursive: true });
    fs.writeFileSync(diagnosticFile, JSON.stringify(diagnostics, null, 2));
  }

  return undefined;
};
