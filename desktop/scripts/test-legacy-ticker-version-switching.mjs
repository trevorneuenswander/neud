#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

const TEST_PAYLOAD = {
  enabled: true,
  source: "webpage-scraper",
  dataSource: "webpage-scraper",
  revision: 42,
  next: [
    { lot: "101", title: "1967 Shelby GT500" },
    { lot: "102", title: "1955 Mercedes-Benz 300 SL" },
    { lot: "103", title: "1973 Porsche 911 Carrera RS" },
  ],
};

function createDomSandbox() {
  const elements = new Map();

  function makeEl(id, text = "—") {
    return {
      id,
      textContent: text,
      classList: {
        _values: new Set(),
        add(...values) {
          values.forEach((value) => this._values.add(value));
        },
        remove(...values) {
          values.forEach((value) => this._values.delete(value));
        },
        contains(value) {
          return this._values.has(value);
        },
      },
      style: {},
      setAttribute() {},
      getAttribute(name) {
        return name === "data-title" ? text : null;
      },
      querySelector() {
        return {
          textContent: text,
          style: {},
          setAttribute() {},
          getAttribute() {
            return "";
          },
          getBoundingClientRect() {
            return { width: 100 };
          },
          scrollWidth: 100,
        };
      },
      offsetWidth: 100,
      getBoundingClientRect() {
        return { width: 100 };
      },
      clientWidth: 200,
      parentElement: null,
    };
  }

  for (const id of [
    "status",
    "slot1",
    "slot2",
    "slot3",
    "slot1Lot",
    "slot2Lot",
    "slot3Lot",
    "slot1Title",
    "slot2Title",
    "slot3Title",
  ]) {
    elements.set(id, makeEl(id));
  }

  const sandbox = {
    document: {
      getElementById(id) {
        return elements.get(id) ?? null;
      },
    },
    listeners: {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    cancelAnimationFrame() {},
    requestAnimationFrame(cb) {
      return setTimeout(() => cb(Date.now()), 0);
    },
    performance: { now: () => Date.now() },
    console,
    ENDPOINT: null,
    POLL: 1000,
    URLSearchParams,
    location: { search: "", origin: "http://127.0.0.1:3000", href: "http://127.0.0.1:3000" },
    elements,
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
    dispatchEvent(event) {
      const handlers = this.listeners[event.type] || [];
      handlers.forEach((handler) => handler(event));
      return true;
    },
    postMessage() {},
  };

  sandbox.window = sandbox;
  sandbox.window.parent = sandbox.window;
  return sandbox;
}

async function loadServeTransformModule() {
  const { transformLegacyTickerHtmlForServing, hasEmbeddedLegacyTickerBridge } =
    await import("../dist/displays/legacy-display-v2-transform.js");
  const { applyHtmlDisplayRuntimeAdapters, resolveDisplayRuntimeAdapterKey } =
    await import("../dist/displays/html-display-runtime-adapters.js");
  const { wrapStandaloneDisplayHtml } = await import("../dist/developer-tools/templates.js");
  return {
    transformLegacyTickerHtmlForServing,
    hasEmbeddedLegacyTickerBridge,
    applyHtmlDisplayRuntimeAdapters,
    resolveDisplayRuntimeAdapterKey,
    wrapStandaloneDisplayHtml,
  };
}

function legacyTickerAdapterContext() {
  return {
    projectId: "project-id",
    projectSlug: "broad-arrow-auctions",
    displayId: "display-id",
    slug: "legacy-ticker",
    displayKey: "legacy-ticker",
    settings: { runtimeAdapterKey: "broad-arrow-legacy-ticker" },
  };
}

test("Version 1 original HTML keeps stored hash and gains adapter only when served", async () => {
  const originalHtml = readSrc("desktop/src/displays/bundled/auction-ticker-overlay-v1.html");
  const storedHash = sha256(originalHtml);

  assert.match(originalHtml, /poll\(\);\s*setInterval\(poll,\s*POLL\);/);
  assert.doesNotMatch(originalHtml, /initializeNeudTickerBridge/);

  const {
    applyHtmlDisplayRuntimeAdapters,
    wrapStandaloneDisplayHtml,
  } = await loadServeTransformModule();

  const adaptedHtml = applyHtmlDisplayRuntimeAdapters(
    originalHtml,
    legacyTickerAdapterContext(),
  );
  assert.notEqual(sha256(adaptedHtml), storedHash);
  assert.match(adaptedHtml, /initializeNeudTickerBridge/);
  assert.match(adaptedHtml, /__NEUD_RUNTIME_MANAGED_DISPLAY__/);
  assert.match(
    adaptedHtml,
    /if \(!window\.__NEUD_RUNTIME_MANAGED_DISPLAY__\)\s*\{\s*poll\(\);\s*setInterval\(poll,\s*POLL\);\s*\}/,
  );
  assert.equal(sha256(originalHtml), storedHash, "stored HTML hash must remain unchanged");

  const servedHtml = wrapStandaloneDisplayHtml({
    html: adaptedHtml,
    dataUrl: "/api/display/project/legacy-ticker/data?preview=1",
    displayInfo: { slug: "legacy-ticker" },
  });
  assert.match(servedHtml, /__NEUD_DISPLAY_CONFIG__/);
  assert.match(servedHtml, /window\.NEUDDisplay/);
  assert.match(
    servedHtml,
    /neud-display-runtime\.js/,
    "runtime script must still inject when bridge references runtime marker text",
  );
});

test("Version 2 legacy-live HTML does not receive duplicate adapter injection", async () => {
  const liveHtml = readSrc(
    "desktop/src/displays/bundled/auction-ticker-legacy-live-v1-2026-07-26-132400.html",
  );
  const storedHash = sha256(liveHtml);

  const { applyHtmlDisplayRuntimeAdapters } = await loadServeTransformModule();
  const adaptedHtml = applyHtmlDisplayRuntimeAdapters(
    liveHtml,
    legacyTickerAdapterContext(),
  );

  assert.equal(sha256(adaptedHtml), storedHash);
  assert.match(adaptedHtml, /initializeNeudTickerBridge/);
  assert.equal(
    (adaptedHtml.match(/initializeNeudTickerBridge/g) ?? []).length,
    1,
    "embedded bridge must not be duplicated at serve time",
  );
});

test("served Version 1 renders Lot 101 through one NEUD subscription", async () => {
  const originalHtml = readSrc("desktop/src/displays/bundled/auction-ticker-overlay-v1.html");
  const bridgeScript = readSrc("desktop/src/displays/legacy-ticker-live-bridge.js");
  const templates = readSrc("desktop/src/developer-tools/templates.ts");
  const bridgeStubMatch = templates.match(
    /export const DISPLAY_BRIDGE_SCRIPT = `([\s\S]*?)`;/,
  );
  assert.ok(bridgeStubMatch, "DISPLAY_BRIDGE_SCRIPT export missing");

  const { transformLegacyTickerHtmlForServing } = await loadServeTransformModule();
  const adaptedHtml = transformLegacyTickerHtmlForServing(originalHtml, bridgeScript);
  const scriptBlocks = [...adaptedHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1],
  );
  const legacyBlock = scriptBlocks.find(
    (block) => block.includes("function placeNextLots") && !block.includes("initializeNeudTickerBridge"),
  );
  const bridgeBlock = scriptBlocks.find((block) => block.includes("initializeNeudTickerBridge"));
  assert.ok(legacyBlock, "legacy script block missing after serve transform");
  assert.ok(bridgeBlock, "bridge script block missing after serve transform");

  const sandbox = createDomSandbox();
  sandbox.__NEUD_RUNTIME_MANAGED_DISPLAY__ = true;
  sandbox.__NEUD_DISPLAY_CONFIG__ = { dataUrl: "/api/display/project/legacy-ticker/data" };
  vm.createContext(sandbox);
  vm.runInContext(bridgeStubMatch[1], sandbox);
  vm.runInContext(legacyBlock, sandbox);
  vm.runInContext(bridgeBlock, sandbox);

  sandbox.NEUDDisplay._publish(TEST_PAYLOAD, { revision: 42 });
  await new Promise((resolve) => setTimeout(resolve, 700));

  assert.match(sandbox.elements.get("slot1Lot").textContent, /Lot 101/);
  assert.equal(sandbox.__NEUD_LEGACY_TICKER_ADAPTER_INSTALLED__, true);
});

test("Version 1 → Version 2 → Version 1 switching keeps stored bytes stable", async () => {
  const version1Html = readSrc("desktop/src/displays/bundled/auction-ticker-overlay-v1.html");
  const version2Html = readSrc(
    "desktop/src/displays/bundled/auction-ticker-legacy-live-v1-2026-07-26-132400.html",
  );
  const version1Hash = sha256(version1Html);
  const version2Hash = sha256(version2Html);

  const { applyHtmlDisplayRuntimeAdapters } = await loadServeTransformModule();
  const context = legacyTickerAdapterContext();

  for (const activeHtml of [version1Html, version2Html, version1Html, version2Html]) {
    const served = applyHtmlDisplayRuntimeAdapters(activeHtml, context);
    assert.match(served, /initializeNeudTickerBridge/);
    assert.doesNotMatch(
      served,
      /initializeNeudTickerBridge[\s\S]*initializeNeudTickerBridge/,
      "duplicate bridge markers must not appear in served HTML",
    );
  }

  assert.equal(sha256(version1Html), version1Hash);
  assert.equal(sha256(version2Html), version2Hash);
});

test("generic HTML display does not receive Legacy Ticker adapter", async () => {
  const genericHtml = "<!doctype html><html><body><h1>Generic</h1></body></html>";
  const { applyHtmlDisplayRuntimeAdapters } = await loadServeTransformModule();
  const served = applyHtmlDisplayRuntimeAdapters(genericHtml, {
    projectId: "project-id",
    projectSlug: "other-project",
    displayId: "display-id",
    slug: "custom-html",
    displayKey: "custom-html",
    settings: {},
  });
  assert.equal(served, genericHtml);
});

test("resolveDisplayViewer applies runtime adapter at serve time", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  const viewerBlock = service.slice(
    service.indexOf("resolveDisplayViewer("),
    service.indexOf("getDisplayViewerEnabled("),
  );
  assert.match(viewerBlock, /applyHtmlDisplayRuntimeAdapters/);
  assert.match(viewerBlock, /servedHtml/);
  assert.doesNotMatch(viewerBlock, /transformLegacyTickerToLiveBridge/);
});

test("publishDisplay stores user HTML without runtime adapter injection", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  const publishBlock = service.slice(
    service.indexOf("publishDisplay("),
    service.indexOf("createDisplay("),
  );
  assert.doesNotMatch(publishBlock, /applyHtmlDisplayRuntimeAdapters/);
  assert.doesNotMatch(publishBlock, /transformLegacyTickerHtmlForServing/);
});

test("legacy bridge script installs global duplicate guard", () => {
  const bridge = readSrc("desktop/src/displays/legacy-ticker-live-bridge.js");
  assert.match(bridge, /__NEUD_LEGACY_TICKER_ADAPTER_INSTALLED__/);
});
