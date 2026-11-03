/**
 * v0.3.3 — Output rename field must retain focus while typing.
 *
 * Root cause: NeudModal re-focused the dialog whenever `onClose` identity changed
 * (OutputManager re-renders on each keystroke → new close handler → focus steal).
 *
 * Covers source contracts, a real BrowserWindow focus interaction against the
 * transpiled NeudModal, and Output Engine rename / dual-LIVE session safety.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import {
  MemoryOutputRouteStore,
  OutputEngine,
  mapComputerDisplays,
} from "../src/output/output-engine-core.ts";
import { DeckLinkOutputService, ScriptedFrameRenderer } from "../src/output/decklink-output-service.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

const mode5994 = {
  id: "1080p5994",
  name: "1080p59.94",
  width: 1920,
  height: 1080,
  frameRateNumerator: 60000,
  frameRateDenominator: 1001,
  interlaced: false,
  fieldDominance: "progressive",
  pixelFormats: ["bgra8"],
};
const mode25 = {
  id: "1080p25",
  name: "1080p25",
  width: 1920,
  height: 1080,
  frameRateNumerator: 25,
  frameRateDenominator: 1,
  interlaced: false,
  fieldDominance: "progressive",
  pixelFormats: ["bgra8"],
};

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function electronBinary() {
  const electronPath = require.resolve("electron");
  const electronDir = path.dirname(electronPath);
  const relative = fs.readFileSync(path.join(electronDir, "path.txt"), "utf8").trim();
  return path.join(electronDir, "dist", relative);
}

function transpileJsxToCjs(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName,
  }).outputText;
}

function graphic() {
  return {
    projectId: "project-1",
    projectName: "Demo",
    displayId: "display-1",
    displayName: "Stream Bid",
    slug: "stream-bid-display",
    width: 1920,
    height: 1080,
    enabled: true,
    publishedRevisionId: "rev-1",
  };
}

function displaySource() {
  return {
    id: 2,
    label: "External",
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 40, width: 1920, height: 1040 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
    rotation: 0,
    internal: false,
  };
}

function ultraStudioEndpoints() {
  return [
    {
      persistentId: "ultrastudio-a",
      modelName: "UltraStudio Monitor 3G",
      endpointName: "Output",
      endpointIndex: 0,
      available: true,
      modes: [mode5994],
    },
    {
      persistentId: "ultrastudio-b",
      modelName: "UltraStudio HD Mini",
      endpointName: "Output",
      endpointIndex: 0,
      available: true,
      modes: [mode5994, mode25],
    },
  ];
}

test("NeudModal focuses dialog only on mount (not when onClose identity changes)", () => {
  const modal = read("src/components/ui/NeudModal.tsx");
  assert.match(modal, /onCloseRef\.current = onClose/);
  assert.match(modal, /const handleClose = useCallback\(\(\) => \{\s*onCloseRef\.current\(\);\s*\}, \[\]\)/);
  assert.match(modal, /mount-only initial focus/);
  const focusEffect = modal.match(
    /Focus the dialog once on mount[\s\S]*?useEffect\(\(\) => \{[\s\S]*?focusTarget\?\.focus\(\);[\s\S]*?\}, \[\]\);/,
  );
  assert.ok(focusEffect, "expected a mount-only ([] deps) initial focus effect");
  assert.equal(
    (modal.match(/focusTarget\?\.focus\(\)/g) || []).length,
    1,
    "dialog focus must run in exactly one effect site",
  );
});

test("OutputManager keeps a stable closeRouteModal and local name draft", () => {
  const ui = read("src/components/output/OutputManager.tsx");
  assert.match(ui, /const closeRouteModal = useCallback\(\(\) => \{/);
  assert.match(ui, /data-testid="output-route-name"/);
  assert.match(
    ui,
    /onChange=\{\(event\) => setForm\(\(current\) => \(\{ \.\.\.current, name: event\.target\.value \}\)\)\}/,
  );
  // Session/device refresh paths update routes only — never rewrite the edit draft.
  const sessionRefresh = ui.match(
    /onSessionChanged\?\.\(\(\) => \{[\s\S]*?\}\);/,
  );
  assert.ok(sessionRefresh, "expected onSessionChanged refresh wiring");
  assert.doesNotMatch(sessionRefresh[0], /setForm/);
  assert.doesNotMatch(ui, /input\(\)\.focus\(|nameInputRef|\.current\.focus\(/);
  assert.match(ui, /catch \(saveError\)/);
  assert.match(ui, /setError\(message\)/);
  assert.match(ui, /setSaving\(false\)/);
});

test("BrowserWindow: Output name input retains focus across keystrokes and parent refreshes", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-rename-focus-"));
  const closeBtnSrc = read("src/components/ui/OverlayCloseButton.tsx").replace(/^"use client";\s*/m, "");
  const modalSrc = read("src/components/ui/NeudModal.tsx")
    .replace(/^"use client";\s*/m, "")
    .replace(/from "@\/components\/ui\/OverlayCloseButton"/, 'from "./OverlayCloseButton.cjs"');

  const reactPath = require.resolve("react");
  const reactDomClientPath = require.resolve("react-dom/client");
  const jsxRuntimePath = require.resolve("react/jsx-runtime");

  function rewriteReactRequires(code) {
    return code
      .replaceAll('require("react/jsx-runtime")', `require(${JSON.stringify(jsxRuntimePath)})`)
      .replaceAll("require('react/jsx-runtime')", `require(${JSON.stringify(jsxRuntimePath)})`)
      .replaceAll('require("react")', `require(${JSON.stringify(reactPath)})`)
      .replaceAll("require('react')", `require(${JSON.stringify(reactPath)})`);
  }

  fs.writeFileSync(
    path.join(tmpDir, "OverlayCloseButton.cjs"),
    rewriteReactRequires(transpileJsxToCjs(closeBtnSrc, "OverlayCloseButton.tsx")),
  );
  fs.writeFileSync(
    path.join(tmpDir, "NeudModal.cjs"),
    rewriteReactRequires(transpileJsxToCjs(modalSrc, "NeudModal.tsx")),
  );

  const modalModulePath = path.join(tmpDir, "NeudModal.cjs");
  const probeScript = path.join(tmpDir, "probe-rename-focus.cjs");
  fs.writeFileSync(
    probeScript,
    `'use strict';
const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  await win.loadURL('data:text/html,<!DOCTYPE html><html><body><div id="root"></div></body></html>');

  const result = await win.webContents.executeJavaScript(\`(async () => {
    const React = require(${JSON.stringify(reactPath)});
    const { createRoot } = require(${JSON.stringify(reactDomClientPath)});
    const { useState, useEffect } = React;
    const { NeudModal } = require(${JSON.stringify(modalModulePath)});

    const reports = [];
    let resolveReady;
    const ready = new Promise((resolve) => { resolveReady = resolve; });

    function Host() {
      const [name, setName] = useState("Feed");
      const [pollTick, setPollTick] = useState(0);
      // Intentionally unstable onClose — must not steal focus after NeudModal fix.
      const onClose = () => {};
      useEffect(() => {
        window.__renameHost = { setName, setPollTick, getName: () => name, getPollTick: () => pollTick };
        resolveReady();
      });
      return React.createElement(
        NeudModal,
        { title: "Edit Output", onClose },
        React.createElement("input", {
          "data-testid": "output-route-name",
          value: name,
          onChange: (event) => setName(event.target.value),
        }),
      );
    }

    const root = createRoot(document.getElementById("root"));
    root.render(React.createElement(Host));
    await ready;
    await new Promise((r) => setTimeout(r, 40));

    const input = () => document.querySelector('[data-testid="output-route-name"]');
    const focusOk = () => document.activeElement === input();
    const setValue = (el, value) => {
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      proto.set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    input().focus();
    reports.push({ step: "initial-focus", ok: focusOk() });

    for (const ch of [" ", "A", "B", "C"]) {
      const el = input();
      const next = el.value + ch;
      setValue(el, next);
      await new Promise((r) => setTimeout(r, 0));
      reports.push({
        step: "type-" + JSON.stringify(ch),
        ok: focusOk() && input().value === next,
        value: input().value,
        selectionStart: input().selectionStart,
      });
    }

    {
      const el = input();
      const next = el.value.slice(0, -1);
      setValue(el, next);
      await new Promise((r) => setTimeout(r, 0));
      reports.push({ step: "backspace", ok: focusOk() && input().value === next, value: input().value });
    }

    {
      const el = input();
      el.setSelectionRange(0, el.value.length);
      setValue(el, "Program Feed");
      await new Promise((r) => setTimeout(r, 0));
      reports.push({
        step: "replace-selection",
        ok: focusOk() && input().value === "Program Feed",
        value: input().value,
      });
    }

    window.__renameHost.setPollTick((n) => n + 1);
    await new Promise((r) => setTimeout(r, 0));
    reports.push({
      step: "poll-refresh",
      ok: focusOk() && input().value === "Program Feed",
      value: input().value,
      pollTick: window.__renameHost.getPollTick(),
    });

    const failed = reports.filter((entry) => !entry.ok);
    return { ok: failed.length === 0, reports, failed };
  })()\`);

  process.stdout.write(JSON.stringify(result) + "\\n");
  app.exit(result && result.ok ? 0 : 1);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
`,
  );

  try {
    const run = spawnSync(electronBinary(), [probeScript], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
      timeout: 45000,
    });
    const lines = String(run.stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const jsonLine = [...lines].reverse().find((line) => line.startsWith("{"));
    assert.ok(
      jsonLine,
      `Electron focus probe produced no JSON. status=${run.status} stderr=${run.stderr} stdout=${run.stdout}`,
    );
    const payload = JSON.parse(jsonLine);
    assert.equal(payload.ok, true, JSON.stringify(payload, null, 2));
    assert.equal(run.status, 0, `electron exit ${run.status}: ${run.stderr}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("rename while dual UltraStudio LIVE keeps sessions and native device IDs", async () => {
  const renderer = new ScriptedFrameRenderer();
  const decklink = new DeckLinkOutputService(renderer);
  decklink.setEndpoints(ultraStudioEndpoints());
  const startCalls = [];
  const stopCalls = [];
  const originalStart = decklink.start.bind(decklink);
  const originalStop = decklink.stop.bind(decklink);
  decklink.start = async (...args) => {
    startCalls.push(args[0]);
    return originalStart(...args);
  };
  decklink.stop = (...args) => {
    stopCalls.push(args[0]);
    return originalStop(...args);
  };

  const store = new MemoryOutputRouteStore();
  const engine = new OutputEngine({
    store,
    windows: {
      async open() {
        return { ok: true };
      },
      close() {},
    },
    discoverDevices: () => mapComputerDisplays([displaySource()], 9),
    resolveDisplay: () => graphic(),
    origin: () => "http://127.0.0.1:3000",
    decklink,
  });

  const routeA = engine.create({
    name: "Feed A",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:ultrastudio-a:0",
    displayModeId: "1080p5994",
  });
  const routeB = engine.create({
    name: "Feed B",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:ultrastudio-b:0",
    displayModeId: "1080p25",
  });

  assert.equal((await engine.start(routeA.id)).ok, true);
  assert.equal((await engine.start(routeB.id)).ok, true);
  const startsBeforeRename = startCalls.length;
  stopCalls.length = 0;
  startCalls.length = 0;

  const deviceABefore = store.get(routeA.id).deviceId;
  const deviceBBefore = store.get(routeB.id).deviceId;
  const modeABefore = store.get(routeA.id).configuration.decklink?.displayModeId;
  const modeBBefore = store.get(routeB.id).configuration.decklink?.displayModeId;
  const sourceABefore = store.get(routeA.id).sourceId || store.get(routeA.id).displayId;

  const renamed = engine.update(routeA.id, { name: "Program UltraStudio A" });
  assert.equal(renamed.id, routeA.id);
  assert.equal(renamed.name, "Program UltraStudio A");
  assert.equal(renamed.deviceId, deviceABefore);
  assert.equal(store.get(routeB.id).name, "Feed B");
  assert.equal(store.get(routeB.id).deviceId, deviceBBefore);

  const after = engine.list();
  assert.equal(after.find((entry) => entry.id === routeA.id).session.status, "live");
  assert.equal(after.find((entry) => entry.id === routeB.id).session.status, "live");
  assert.equal(store.get(routeA.id).configuration.decklink?.displayModeId, modeABefore);
  assert.equal(store.get(routeB.id).configuration.decklink?.displayModeId, modeBBefore);
  assert.equal(store.get(routeA.id).sourceId || store.get(routeA.id).displayId, sourceABefore);
  assert.deepEqual(startCalls, [], "rename must not restart DeckLink sessions");
  assert.deepEqual(stopCalls, [], "rename must not stop DeckLink sessions");
  assert.ok(startsBeforeRename >= 2);
});

test("rename persists across engine restart; failed save leaves prior name", () => {
  const store = new MemoryOutputRouteStore();
  const makeEngine = (routeStore = store) =>
    new OutputEngine({
      store: routeStore,
      windows: {
        async open() {
          return { ok: true };
        },
        close() {},
      },
      discoverDevices: () => mapComputerDisplays([displaySource()], 9),
      resolveDisplay: () => graphic(),
      origin: () => "http://127.0.0.1:3000",
    });

  const engine = makeEngine();
  const devices = mapComputerDisplays([displaySource()], 9);
  const route = engine.create({
    name: "Output 1",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: devices[0].id,
  });
  const updated = engine.update(route.id, { name: "Stage Left" });
  assert.equal(updated.name, "Stage Left");
  assert.equal(updated.id, route.id);

  const restarted = makeEngine();
  const restored = restarted.list().find((entry) => entry.id === route.id);
  assert.ok(restored);
  assert.equal(restored.name, "Stage Left");
  assert.equal(restored.deviceId, route.deviceId);

  const failingStore = {
    list: () => store.list(),
    get: (id) => store.get(id),
    delete: (id) => store.delete(id),
    save() {
      throw new Error("disk full");
    },
  };
  const failingEngine = makeEngine(failingStore);
  assert.throws(() => failingEngine.update(route.id, { name: "Should Not Persist" }), /disk full/);
  assert.equal(store.get(route.id).name, "Stage Left");
});
