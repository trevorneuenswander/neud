#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

function resolveCliAppPaths() {
  const appDataRoot = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const root = path.join(appDataRoot, "NEUD");
  const dataDir = path.join(root, "data");
  return {
    root,
    data: dataDir,
    databaseFile: path.join(dataDir, "neud.sqlite"),
    backups: path.join(dataDir, "backups"),
    projects: path.join(root, "projects"),
    assets: path.join(root, "assets"),
    displays: path.join(root, "displays"),
    controllers: path.join(root, "controllers"),
    publishing: path.join(root, "publishing"),
    exports: path.join(root, "exports"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    engineLogs: path.join(root, "logs", "engines"),
    engines: path.join(root, "engines"),
    browserData: path.join(root, "browser-data"),
    browserProfiles: path.join(root, "browser-profiles"),
    cookies: path.join(root, "cookies"),
    cache: path.join(root, "cache"),
    downloads: path.join(root, "downloads"),
    serverEnvFile: path.join(root, "config", "server.env"),
    hostFile: path.join(root, "config", "host.json"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot,
  };
}

async function resolveLegacyTickerTarget() {
  const { openLocalDatabase, closeLocalDatabase } = await import(
    "../dist/database/connection.js"
  );
  const { ProjectsRepository } = await import("../dist/repositories/projects-repository.js");
  const { ProjectDisplayCodeRepository } = await import(
    "../dist/repositories/project-display-code-repository.js"
  );

  const paths = resolveCliAppPaths();
  if (!fs.existsSync(paths.databaseFile)) {
    return null;
  }

  const db = await openLocalDatabase(paths);
  const displayCode = new ProjectDisplayCodeRepository(db);
  const projects = new ProjectsRepository(db);

  let target = null;
  for (const project of projects.list()) {
    const code = displayCode.getBySlug(project.id, "legacy-ticker");
    if (code) {
      target = { projectId: project.id, slug: "legacy-ticker" };
      break;
    }
  }

  await closeLocalDatabase(db);
  return target;
}

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
    console,
    setTimeout,
    setInterval,
    clearInterval,
    cancelAnimationFrame() {},
    requestAnimationFrame(cb) {
      return setTimeout(() => cb(Date.now()), 0);
    },
    performance: { now: () => Date.now() },
    ENDPOINT: null,
    POLL: 1000,
    URLSearchParams,
    location: { search: "", origin: "http://127.0.0.1:3000" },
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

test("served legacy-ticker HTML includes legacy-live bridge markers", async () => {
  const target = await resolveLegacyTickerTarget();
  assert.ok(target, "local NEUD database with legacy-ticker display is required");

  const previewUrl = `http://127.0.0.1:8070/api/display/${encodeURIComponent(target.projectId)}/${encodeURIComponent(target.slug)}?preview=1&poll=1000`;
  const response = await fetch(previewUrl, { cache: "no-store" });
  assert.equal(response.ok, true, "local API must be running on :8070");

  const servedHtml = await response.text();
  assert.match(servedHtml, /initializeNeudTickerBridge/);
  assert.match(servedHtml, /__NEUD_TICKER_REVISION__/);
  assert.match(servedHtml, /neud-display-runtime\.js/);
  assert.doesNotMatch(servedHtml, /poll\(\);\s*setInterval\(poll,\s*POLL\);/);
});

test("legacy-live bridge renders Lot 101 when runtime publishes snapshot.next", async () => {
  const bridgeScript = fs.readFileSync(
    path.join(repoRoot, "desktop/src/displays/legacy-ticker-live-bridge.js"),
    "utf8",
  );
  const legacyScript = fs.readFileSync(
    path.join(repoRoot, "desktop/src/displays/bundled/auction-ticker-overlay-v1.html"),
    "utf8",
  );
  const legacyBlock = legacyScript.match(/<script>([\s\S]*)<\/script>/i)?.[1];
  assert.ok(legacyBlock, "legacy script block missing");

  const templates = fs.readFileSync(
    path.join(repoRoot, "desktop/src/developer-tools/templates.ts"),
    "utf8",
  );
  const bridgeStubMatch = templates.match(
    /export const DISPLAY_BRIDGE_SCRIPT = `([\s\S]*?)`;/,
  );
  assert.ok(bridgeStubMatch, "DISPLAY_BRIDGE_SCRIPT export missing");

  const sandbox = createDomSandbox();
  vm.createContext(sandbox);
  vm.runInContext(bridgeStubMatch[1], sandbox);
  vm.runInContext(
    legacyBlock.replace(/poll\(\);\s*setInterval\(poll,\s*POLL\);/, bridgeScript),
    sandbox,
  );

  sandbox.NEUDDisplay._publish(TEST_PAYLOAD, { revision: 42 });
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(
    sandbox.__NEUD_TICKER_REVISION__,
    "auction-ticker-legacy-live-v1-2026-07-26-132400",
  );
  assert.match(sandbox.elements.get("slot1Lot").textContent, /Lot 101/);
  assert.match(sandbox.elements.get("slot2Lot").textContent, /Lot 102/);
  assert.match(sandbox.elements.get("slot3Lot").textContent, /Lot 103/);
});
