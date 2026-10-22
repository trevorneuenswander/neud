import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  MemoryOutputRouteStore,
  OutputEngine,
  PRIMARY_MONITOR_WARNING,
  STACK_UNAVAILABLE_FOR_OUTPUT,
  buildOutputRenderUrl,
  buildOutputStackRenderUrl,
  mapComputerDisplays,
  normalizeOutputRouteSource,
  serializeOutputDevice,
} from "../src/output/output-engine-core.ts";
import {
  displaySelectorMessage,
  encodeOutputSourceValue,
  monitorSelectorMessage,
  outputDisplayChoices,
  outputSourceChoices,
  parseOutputSourceValue,
  projectSelectorMessage,
} from "../../src/lib/output/add-output-hydration.ts";
import {
  adapterTypeToOperatorLabel,
  formatExternalPortLabel,
} from "../../src/lib/output/output-adapter-labels.ts";
import { buildProjectDisplayOutputPath } from "../../src/lib/displays/display-view-mode.ts";

function layerZIndexForDisplayInStack(displayId, orderedMemberDisplayIds) {
  const index = orderedMemberDisplayIds.indexOf(displayId);
  if (index < 0) return 1;
  return orderedMemberDisplayIds.length - index;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

function display(overrides = {}) {
  return {
    id: 2,
    label: "DELL U2720Q",
    bounds: { x: 1920, y: 0, width: 3840, height: 2160 },
    workArea: { x: 1920, y: 0, width: 3840, height: 2160 },
    size: { width: 3840, height: 2160 },
    scaleFactor: 1,
    rotation: 0,
    internal: false,
    ...overrides,
  };
}

function primary() {
  return display({
    id: 1,
    label: "Built-in Retina Display",
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    workArea: { x: 0, y: 0, width: 1512, height: 982 },
    size: { width: 1512, height: 982 },
    scaleFactor: 2,
    internal: true,
  });
}

const graphic = {
  projectId: "project-1",
  projectName: "Broad Arrow",
  displayId: "display-1",
  displayName: "Stream Bid",
  slug: "stream-bid-display",
  width: 3840,
  height: 2160,
  enabled: true,
  publishedRevisionId: "rev-29",
};

function harness(devices, displays = [graphic], options = {}) {
  const opened = [];
  const closed = [];
  const engine = new OutputEngine({
    store: new MemoryOutputRouteStore(),
    windows: {
      async open(input) {
        opened.push(input);
        return { ok: true };
      },
      close(routeId) {
        closed.push(routeId);
      },
    },
    discoverDevices: () => devices,
    resolveDisplay: (id) => displays.find((entry) => entry.displayId === id) ?? null,
    resolveStack: options.resolveStack,
    origin: () => "http://127.0.0.1:3000",
    now: () => "2026-10-01T12:00:00.000Z",
  });
  return { engine, opened, closed };
}

test("device discovery maps electron displays without using array index as identity", () => {
  const devices = mapComputerDisplays([primary(), display()], 1);
  assert.equal(devices.length, 2);
  assert.equal(devices[1].name, "DELL U2720Q");
  assert.equal(devices[1].capabilities.width, 3840);
  assert.equal(devices[1].primary, false);
  assert.notEqual(devices[0].id, devices[1].id);
  assert.match(devices[1].id, /^display:2:/);
});

test("route identity stays stable across restart and a second route", async () => {
  const devices = mapComputerDisplays([primary(), display()], 1);
  const { engine } = harness(devices);
  const external = devices.find((device) => !device.primary);
  const first = engine.create({
    name: "Bid",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: external.id,
  });
  const second = engine.create({
    name: "Ticker",
    projectId: graphic.projectId,
    displayId: "display-2",
    deviceId: devices.find((device) => device.primary).id,
  });
  assert.notEqual(first.id, second.id);
  const again = engine.list().map((route) => route.id).sort();
  assert.deepEqual(again, [first.id, second.id].sort());
});

test("route crud and start stop use separate sessions", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const { engine, opened, closed } = harness(devices);
  const created = engine.create({
    name: "Program",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  const started = await engine.start(created.id);
  assert.equal(started.ok, true);
  assert.equal(started.route.session.status, "live");
  assert.equal(opened.length, 1);
  const stopped = engine.stop(created.id);
  assert.equal(stopped.session.status, "stopped");
  assert.deepEqual(closed, [created.id]);
  engine.delete(created.id);
  assert.equal(engine.list().length, 0);
});

test("missing display and missing monitor do not launch a window", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const missingGraphic = harness(devices, []);
  const missingDisplay = missingGraphic.engine.create({
    name: "Gone",
    projectId: graphic.projectId,
    displayId: "missing",
    deviceId: devices[0].id,
  });
  const displayResult = await missingGraphic.engine.start(missingDisplay.id);
  assert.equal(displayResult.ok, false);
  assert.equal(displayResult.code, "missing-display");
  assert.equal(missingGraphic.opened.length, 0);

  let current = [];
  const engine = new OutputEngine({
    store: new MemoryOutputRouteStore(),
    windows: {
      async open() {
        return { ok: true };
      },
      close() {},
    },
    discoverDevices: () => current,
    resolveDisplay: () => graphic,
    origin: () => "http://127.0.0.1:3000",
  });
  const saved = engine.create({
    name: "Dark",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  current = [];
  const deviceResult = await engine.start(saved.id);
  assert.equal(deviceResult.code, "device-unavailable");
});

test("disconnect freezes the route and reconnect recognizes the same monitor", async () => {
  let devices = mapComputerDisplays([display()], 9);
  const opened = [];
  const store = new MemoryOutputRouteStore();
  const engine = new OutputEngine({
    store,
    windows: {
      async open(input) {
        opened.push(input);
        return { ok: true };
      },
      close() {},
    },
    discoverDevices: () => devices,
    resolveDisplay: () => graphic,
    origin: () => "http://127.0.0.1:3000",
  });
  const route = engine.create({
    name: "Program",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  await engine.start(route.id);
  devices = [];
  engine.refreshDevices();
  assert.equal(engine.list()[0].session.status, "device-unavailable");
  const returned = display({ id: 8, label: "DELL U2720Q" });
  devices = mapComputerDisplays([returned], 9);
  engine.refreshDevices();
  const liveAgain = await engine.start(route.id);
  assert.equal(liveAgain.ok, true);
  assert.equal(liveAgain.route.deviceId, devices[0].id);
});

test("primary monitor requires confirmation and is not used as a fallback", async () => {
  const devices = mapComputerDisplays([primary()], 1);
  const { engine, opened } = harness(devices);
  const route = engine.create({
    name: "Ops",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  const blocked = await engine.start(route.id);
  assert.equal(blocked.code, "primary-warning");
  assert.match(blocked.error, /primary display/);
  assert.equal(PRIMARY_MONITOR_WARNING.includes("operator interface"), true);
  assert.equal(opened.length, 0);
  const confirmed = await engine.start(route.id, { confirmPrimary: true });
  assert.equal(confirmed.ok, true);
});

test("published output url matches the canonical output path and current revision slug", () => {
  const canonical = buildProjectDisplayOutputPath(graphic.projectId, graphic.slug, {
    origin: "http://127.0.0.1:3000",
  });
  const exact = buildOutputRenderUrl({
    origin: "http://127.0.0.1:3000",
    projectId: graphic.projectId,
    slug: graphic.slug,
    authoredWidth: 3840,
    authoredHeight: 2160,
    outputWidth: 3840,
    outputHeight: 2160,
  });
  assert.match(exact, /window-fit/);
  assert.match(exact, /surface=computer/);
  assert.match(exact, /cursor=none/);
  assert.match(decodeURIComponent(exact), /api\/display-html/);
  assert.match(decodeURIComponent(exact), /output=1/);
  assert.doesNotMatch(exact, /preview=1/);
  const fitted = buildOutputRenderUrl({
    origin: "http://127.0.0.1:3000",
    projectId: graphic.projectId,
    slug: graphic.slug,
    authoredWidth: 3840,
    authoredHeight: 2160,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.match(fitted, /window-fit/);
  assert.match(fitted, /surface=computer/);
  assert.match(decodeURIComponent(fitted), /api\/display-html/);
  assert.match(decodeURIComponent(fitted), /output=1/);
});

test("two live routes cannot occupy one monitor", async () => {
  const devices = mapComputerDisplays([display(), display({ id: 3, label: "Samsung", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } })], 9);
  const ticker = { ...graphic, displayId: "display-2", slug: "stream-ticker" };
  const { engine } = harness(devices, [graphic, ticker]);
  const first = engine.create({
    name: "A",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  const second = engine.create({
    name: "B",
    projectId: graphic.projectId,
    displayId: ticker.displayId,
    deviceId: devices[0].id,
  });
  assert.equal((await engine.start(first.id)).ok, true);
  const collision = await engine.start(second.id);
  assert.equal(collision.code, "device-busy");
});

test("shutdown and sign-out stop output sessions", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const { engine, closed } = harness(devices);
  const route = engine.create({
    name: "Program",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  await engine.start(route.id);
  engine.stopAll();
  assert.equal(engine.hasActiveSession(), false);
  assert.ok(closed.includes(route.id));
  const main = fs.readFileSync(path.join(repoRoot, "desktop/src/main.ts"), "utf8");
  const shutdown = main.indexOf("async function performGracefulShutdown");
  const signOut = main.indexOf("forceSignOutFromMain = async");
  assert.ok(main.indexOf("outputEngine?.stopAll()", shutdown) > shutdown);
  assert.ok(main.indexOf("outputEngine?.stopAll()", signOut) > signOut);
});

test("diagnostics include route session and render url without secrets", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const { engine } = harness(devices);
  const route = engine.create({
    name: "Program",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  await engine.start(route.id);
  const [entry] = engine.diagnostics();
  assert.equal(entry.routeId, route.id);
  assert.equal(entry.displayId, graphic.displayId);
  assert.equal(entry.sessionState, "live");
  assert.match(entry.renderUrl, /stream-bid-display/);
  assert.equal(JSON.stringify(entry).includes("token"), false);
  const exporter = fs.readFileSync(
    path.join(repoRoot, "desktop/src/services/diagnostics-export-service.ts"),
    "utf8",
  );
  assert.match(exporter, /output-engine.json/);
});

test("add output hydrates accessible projects and published displays", () => {
  const choices = outputDisplayChoices([
    { id: "bid", name: "Stream Bid Display", enabled: true },
    { id: "ticker", name: "Stream Ticker", enabled: true },
    { id: "quail", name: "LED Display (Quail)", enabled: false },
    { id: "old", name: "Archived", enabled: true, archived: true },
  ]);
  assert.deepEqual(choices.map((choice) => choice.name), [
    "Stream Bid Display",
    "Stream Ticker",
  ]);
  assert.equal(
    outputDisplayChoices(
      [
        { id: "bid", name: "Stream Bid Display", enabled: true },
        { id: "quail", name: "LED Display (Quail)", enabled: false },
        { id: "ticker", name: "Stream Ticker", enabled: false },
      ],
      { currentDisplayId: "ticker" },
    ).map((choice) => choice.label).join("|"),
    "Stream Bid Display|Stream Ticker (disabled)",
  );
  assert.equal(projectSelectorMessage("empty"), "No projects available");
  assert.equal(projectSelectorMessage("error"), "Failed to load projects");
  assert.equal(displaySelectorMessage({ projectSelected: false, state: "idle" }), "Select a project first");
  assert.equal(displaySelectorMessage({ projectSelected: true, state: "loading" }), "Loading displays…");
  assert.equal(displaySelectorMessage({ projectSelected: true, state: "empty" }), "No active displays available");
  assert.equal(
    monitorSelectorMessage({ desktop: false, state: "ready" }),
    "Monitor discovery unavailable outside the NEUD desktop app",
  );
  assert.equal(monitorSelectorMessage({ desktop: true, state: "empty" }), "No monitors detected");
  const manager = fs.readFileSync(
    path.join(repoRoot, "src/components/output/OutputManager.tsx"),
    "utf8",
  );
  assert.match(manager, /localListProjects/);
  assert.match(manager, /localGetProjectDisplays/);
  assert.match(manager, /localGetProjectsMeta/);
  assert.doesNotMatch(manager, /output\.catalog/);
  assert.match(manager, /isDesktopRenderer/);
  const preload = fs.readFileSync(path.join(repoRoot, "desktop/src/preload.ts"), "utf8");
  assert.match(preload, /listDevices:/);
  assert.match(preload, /neud:output:devicesChanged/);
  const ipc = fs.readFileSync(path.join(repoRoot, "desktop/src/ipc/output.ts"), "utf8");
  assert.match(ipc, /serializeOutputDevice/);
  const discovery = fs.readFileSync(
    path.join(repoRoot, "desktop/src/output/electron-display-discovery.ts"),
    "utf8",
  );
  assert.match(discovery, /screen\.getAllDisplays/);
  assert.match(discovery, /display-added/);
  assert.match(discovery, /display-removed/);
  const main = fs.readFileSync(path.join(repoRoot, "desktop/src/main.ts"), "utf8");
  assert.match(main, /neud:output:devicesChanged/);
});

test("outputs ui polish: sidebar, add modal, active displays, live locks", () => {
  const nav = fs.readFileSync(path.join(repoRoot, "src/lib/portal/navigation.ts"), "utf8");
  assert.match(nav, /href: \"\/outputs\",\s*label: \"Outputs\"/);
  assert.match(nav, /\"\/outputs\": \"Outputs\"/);
  assert.doesNotMatch(nav, /href: \"\/outputs\",\s*label: \"Output\"/);
  const appMenu = fs.readFileSync(path.join(repoRoot, "desktop/src/menu/application-menu.ts"), "utf8");
  assert.doesNotMatch(appMenu, /label: \"Outputs\"/);
  assert.doesNotMatch(appMenu, /label: \"Output\"/);
  assert.doesNotMatch(appMenu, /setOpenOutputHandler/);
  assert.match(appMenu, /role: \"close\"/);

  const manager = fs.readFileSync(path.join(repoRoot, "src/components/output/OutputManager.tsx"), "utf8");
  assert.match(manager, /openAddModal/);
  assert.match(manager, /title=\{formMode === \"edit\" \? \"Edit Output\" : \"Add Output\"\}/);
  assert.match(manager, /data-output-route-form=\{formMode/);
  assert.match(manager, /Stop this output to change its routing or video mode\./);
  assert.match(manager, /disabled=\{routingLocked\}/);
  assert.match(manager, /disabled:bg-surface-raised disabled:text-muted/);
  assert.match(manager, /currentSourceId: formMode === \"edit\" \? form\.sourceId : null/);
  assert.match(manager, /Add Output/);
  assert.match(manager, /Refresh Devices/);
  assert.match(manager, /adapterTypeToOperatorLabel\(\"decklink\"\)/);
  assert.match(manager, /needsPairedKeyPort/);
  assert.match(manager, /Key \+ Fill/);
  assert.match(manager, /EXTERNAL_NO_DEVICES/);
  assert.match(manager, /operatorFacingExternalDeviceUnavailable/);
  assert.match(manager, /optgroup label=\"Displays\"/);
  assert.match(manager, /optgroup label=\"Stacks\"/);
  assert.doesNotMatch(manager, /Blackmagic DeckLink/);
  assert.doesNotMatch(manager, /DeckLink output/);
  assert.doesNotMatch(manager, /Select a DeckLink/);
  assert.doesNotMatch(manager, /\{adding \? \"Close\" : \"Add Output\"\}/);
  assert.doesNotMatch(manager, /<section className=\"grid gap-3 rounded-lg border border-border bg-surface-raised p-4\">\s*<h2[^>]*>Add Output/);

  const labels = fs.readFileSync(path.join(repoRoot, "src/lib/output/output-adapter-labels.ts"), "utf8");
  assert.match(labels, /adapterTypeToOperatorLabel/);
  assert.match(labels, /formatExternalPortLabel/);
  assert.match(labels, /External Device/);
  assert.match(labels, /Port \$\{portNumber\}/);

  const hydration = fs.readFileSync(path.join(repoRoot, "src/lib/output/add-output-hydration.ts"), "utf8");
  assert.match(hydration, /outputSourceChoices/);
  assert.match(hydration, /display\.enabled !== false \|\| display\.id === currentDisplayId/);

  const modal = fs.readFileSync(path.join(repoRoot, "src/components/ui/NeudModal.tsx"), "utf8");
  assert.match(modal, /max-h-\[min\(90vh,42rem\)\]/);
  assert.match(modal, /overflow-y-auto/);
  assert.match(modal, /closeOnEscape/);
  assert.match(modal, /aria-modal/);
});

test("generic external-device port labels and terminology", () => {
  assert.equal(adapterTypeToOperatorLabel("display"), "Computer Display");
  assert.equal(adapterTypeToOperatorLabel("decklink"), "External Device");
  assert.equal(formatExternalPortLabel("UltraStudio HD Mini", 0), "UltraStudio HD Mini Port 1");
  assert.equal(formatExternalPortLabel("DeckLink Duo 2", 2), "DeckLink Duo 2 Port 3");
  const uiLabels = fs.readFileSync(path.join(repoRoot, "src/lib/output/output-adapter-labels.ts"), "utf8");
  const desktopLabels = fs.readFileSync(path.join(repoRoot, "desktop/src/output/decklink-model.ts"), "utf8");
  assert.match(uiLabels, /External Device/);
  assert.match(desktopLabels, /External Device/);
  assert.match(desktopLabels, /formatExternalPortLabel/);
  assert.match(desktopLabels, /Blackmagic DeckLink is unavailable/);
  assert.match(
    fs.readFileSync(path.join(repoRoot, "desktop/src/output/output-engine-core.ts"), "utf8"),
    /adapterType === \"decklink\"/,
  );
});

test("starting a route with a disabled display is blocked", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const engine = new OutputEngine({
    store: new MemoryOutputRouteStore(),
    windows: { async open() { return { ok: true }; }, close() {} },
    discoverDevices: () => devices,
    resolveDisplay: () => ({ ...graphic, enabled: false }),
    origin: () => "http://127.0.0.1:3000",
  });
  const route = engine.create({
    name: "Program",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  const started = await engine.start(route.id);
  assert.equal(started.ok, false);
  assert.equal(started.code, "display-disabled");
  assert.match(started.error, /display is disabled/i);
});

test("built-in and external monitors serialize for the renderer", () => {
  const devices = mapComputerDisplays([primary(), display()], 1);
  const builtIn = devices.find((device) => device.primary);
  const external = devices.find((device) => !device.primary);
  assert.ok(builtIn);
  assert.equal(builtIn.capabilities.internal, true);
  assert.equal(external.capabilities.width, 3840);
  const payload = devices.map(serializeOutputDevice);
  assert.equal(JSON.parse(JSON.stringify(payload)).length, 2);
  assert.equal(payload[0].id, devices[0].id);
  assert.equal(typeof payload[0].capabilities.bounds.x, "number");
});

test("save uses canonical project display and device ids and does not start the window", async () => {
  const devices = mapComputerDisplays([primary(), display()], 1);
  const external = devices.find((device) => !device.primary);
  const opened = [];
  const store = new MemoryOutputRouteStore();
  const engine = new OutputEngine({
    store,
    windows: {
      async open(input) {
        opened.push(input);
        return { ok: true };
      },
      close() {},
    },
    discoverDevices: () => devices,
    resolveDisplay: (id) => (id === graphic.displayId ? graphic : null),
    origin: () => "http://127.0.0.1:3000",
  });
  const payload = {
    name: "Stream Bid",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: external.id,
  };
  assert.match(payload.deviceId, /^display:\d+:/);
  assert.notEqual(payload.deviceId, String(external.capabilities.electronDisplayId));
  const saved = engine.create(payload);
  assert.equal(saved.projectId, graphic.projectId);
  assert.equal(saved.displayId, graphic.displayId);
  assert.equal(saved.deviceId, external.id);
  assert.equal(saved.session.status, "stopped");
  assert.equal(opened.length, 0);
  const reloaded = new OutputEngine({
    store,
    windows: { async open() { return { ok: true }; }, close() {} },
    discoverDevices: () => devices,
    resolveDisplay: () => graphic,
    origin: () => "http://127.0.0.1:3000",
  });
  assert.equal(reloaded.list()[0].id, saved.id);
  assert.equal(reloaded.list()[0].session.status, "stopped");
  const missingProject = engine.create({
    ...payload,
    displayId: "missing-display",
  });
  const rejected = await engine.start(missingProject.id);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "missing-display");
});

test("migration 039 registers output_routes and a route survives reload", async () => {
  const migrate = fs.readFileSync(path.join(repoRoot, "desktop/src/database/migrate.ts"), "utf8");
  const files = [...migrate.matchAll(/"(\d+_[^"]+\.sql)"/g)].map((entry) => entry[1]);
  assert.ok(files.includes("039_output_routes.sql"));
  assert.equal(
    files.indexOf("039_output_routes.sql"),
    files.indexOf("038_user_pinned_viewer_stacks.sql") + 1,
  );
  const manager = fs.readFileSync(path.join(repoRoot, "src/components/output/OutputManager.tsx"), "utf8");
  assert.match(manager, /Unable to save output/);
  assert.match(manager, /projectId &&[\s\S]*sourceId &&[\s\S]*deviceId &&[\s\S]*name\.trim\(\)/);
  assert.match(fs.readFileSync(path.join(repoRoot, "desktop/src/preload.ts"), "utf8"), /neud:output:create/);
  assert.match(fs.readFileSync(path.join(repoRoot, "desktop/src/ipc/output.ts"), "utf8"), /neud:output:create/);

  const sqlJsRoot = path.join(repoRoot, "node_modules", "sql.js");
  const initSqlJs = require(sqlJsRoot);
  const SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsRoot, "dist", file) });
  const raw = new SQL.Database();
  raw.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  raw.exec(
    Array.from({ length: 38 }, (_, index) => {
      const version = index + 1;
      return `INSERT INTO schema_migrations (version, name) VALUES (${version}, 'seeded-${version}');`;
    }).join("\n"),
  );
  const db = {
    exec(sql) { raw.exec(sql); },
    prepare(sql) {
      return {
        all(...params) {
          const stmt = raw.prepare(sql);
          if (params.length) stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        get(...params) {
          return this.all(...params)[0];
        },
        run(...params) {
          const stmt = raw.prepare(sql);
          if (params.length) stmt.bind(params);
          stmt.step();
          stmt.free();
        },
      };
    },
  };
  const { runMigrations } = await import(
    pathToFileURL(path.join(repoRoot, "desktop/dist/database/migrate.js")).href,
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-output-039-"));
  fs.mkdirSync(path.join(tmpDir, "backups"), { recursive: true });
  runMigrations(db, {
    databaseFile: path.join(tmpDir, "neud.sqlite"),
    backups: path.join(tmpDir, "backups"),
  });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'output_routes'").all();
  assert.equal(tables.length, 1);
  const { SqliteOutputRouteStore } = require(
    path.join(repoRoot, "desktop/dist/output/sqlite-output-route-store.js"),
  );
  const store = new SqliteOutputRouteStore(db);
  const route = {
    id: "route-1",
    name: "Stream Bid",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    sourceType: "display",
    sourceId: graphic.displayId,
    adapterType: "display",
    deviceId: "display:1:built-in:1512x982",
    mode: "borderless",
    enabled: true,
    configuration: {
      scaleMode: "fit",
      background: "#000000",
      electronDisplayId: 1,
      deviceLabel: "Built-in Retina Display",
      deviceWidth: 1512,
      deviceHeight: 982,
    },
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
  };
  store.save(route);
  const reloaded = new SqliteOutputRouteStore(db);
  assert.equal(reloaded.list()[0].displayId, graphic.displayId);
  assert.equal(reloaded.list()[0].sourceType, "display");
  assert.equal(reloaded.list()[0].sourceId, graphic.displayId);
  assert.equal(reloaded.list()[0].deviceId, route.deviceId);
  assert.equal(reloaded.get(route.id).configuration.scaleMode, "fit");
});

test("computer display presentation defaults and does not change preview graphics", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const opened = [];
  const engine = new OutputEngine({
    store: new MemoryOutputRouteStore(),
    windows: {
      async open(input) {
        opened.push(input);
        return { ok: true };
      },
      close(routeId) {
        opened.push({ closed: routeId });
      },
    },
    discoverDevices: () => devices,
    resolveDisplay: () => graphic,
    origin: () => "http://127.0.0.1:3000",
  });
  const route = engine.create({
    name: "Program",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    deviceId: devices[0].id,
  });
  assert.equal(route.configuration.alwaysOnTop, true);
  assert.equal(route.configuration.hideCursor, true);
  assert.equal(route.configuration.background, "#000000");
  const started = await engine.start(route.id);
  assert.equal(started.ok, true);
  assert.equal(opened[0].alwaysOnTop, true);
  assert.equal(opened[0].hideCursor, true);
  assert.match(opened[0].url, /surface=computer/);
  assert.match(opened[0].url, /cursor=none/);
  const cursorOff = engine.update(route.id, { hideCursor: false, alwaysOnTop: false });
  assert.equal(cursorOff.configuration.hideCursor, false);
  assert.equal(cursorOff.configuration.alwaysOnTop, false);
  engine.stop(route.id);
  assert.equal(engine.list()[0].session.status, "stopped");
  devices.length = 0;
  await engine.start(route.id);
  engine.refreshDevices();
  assert.equal(engine.list()[0].session.status, "device-unavailable");
  const diagnostics = engine.diagnostics()[0];
  assert.equal(diagnostics.outputBackground, "#000000");
  assert.equal(diagnostics.hideCursor, false);
  assert.equal(diagnostics.alwaysOnTop, false);
  assert.ok(
    diagnostics.fullscreenMode === "fullscreen" ||
      diagnostics.fullscreenMode === "presentation-window",
  );
  const windowHost = fs.readFileSync(path.join(repoRoot, "desktop/src/output/output-window-host.ts"), "utf8");
  assert.doesNotMatch(windowHost, /setSimpleFullScreen/);
  assert.doesNotMatch(windowHost, /setKiosk\(true\)/);
  assert.doesNotMatch(windowHost, /restoring fullscreen/);
  assert.match(windowHost, /input\.platform === "darwin"/);
  assert.match(windowHost, /setAlwaysOnTop\(true, "screen-saver"\)/);
  assert.match(windowHost, /window\.setFullScreen\(true\)/);
  assert.match(windowHost, /showInactive\(\)/);
  assert.match(
    fs.readFileSync(path.join(repoRoot, "desktop/src/developer-tools/templates.ts"), "utf8"),
    /neud-output-cursor/,
  );
  assert.match(
    fs.readFileSync(path.join(repoRoot, "src/lib/displays/display-view-mode.ts"), "utf8"),
    /hideCursor/,
  );
  assert.match(windowHost, /setBounds\(input\.bounds\)/);
  assert.match(windowHost, /showInactive\(\)/);
  assert.doesNotMatch(windowHost, /leave-full-screen/);
  assert.match(windowHost, /focusable: !darwin/);
  const outputView = fs.readFileSync(
    path.join(repoRoot, "src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx"),
    "utf8",
  );
  assert.match(outputView, /hideCursor/);
  assert.match(outputView, /neud-output-cursor/);
  assert.match(outputView, /surface"\) === "computer"/);
  assert.match(windowHost, /setBounds\(input\.bounds\)/);
  assert.match(windowHost, /Escape/);
  const fitClient = fs.readFileSync(
    path.join(repoRoot, "src/components/displays/DisplayWindowFitClient.tsx"),
    "utf8",
  );
  assert.match(fitClient, /cursor: none !important/);
  assert.match(fitClient, /pointerEvents: computerOutput \? "none"/);
  assert.match(fitClient, /if \(!computerOutput \|\| !hideCursor\) return/);
  const styles = fs.readFileSync(
    path.join(repoRoot, "src/components/displays/useDisplayWindowFitViewerStyles.ts"),
    "utf8",
  );
  assert.match(styles, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  assert.match(styles, /surface === "computer"/);
  assert.match(styles, /hideCursor \? "none"/);
  const ticker = fs.readFileSync(
    path.join(repoRoot, "desktop/src/displays/bundled/stream-ticker-v1.html"),
    "utf8",
  );
  assert.match(ticker, /background:\s*transparent/);
  const bid = fs.readFileSync(
    path.join(repoRoot, "desktop/src/displays/bundled/stream-bid-display-v1.html"),
    "utf8",
  );
  assert.match(bid, /#ffffff|white-field/);
  const main = fs.readFileSync(path.join(repoRoot, "desktop/src/main.ts"), "utf8");
  assert.match(main, /outputEngine\?\.stopAll\(\)/);
});

test("monitor discovery source stays shared across windows and macos", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "desktop/src/output/electron-display-discovery.ts"),
    "utf8",
  );
  assert.match(source, /screen.getAllDisplays/);
  assert.match(source, /display-added/);
  assert.match(source, /display-removed/);
  assert.doesNotMatch(source, /process\.platform/);
  assert.match(
    fs.readFileSync(path.join(repoRoot, "desktop/src/output/output-window-host.ts"), "utf8"),
    /frame: false/,
  );
  assert.match(
    fs.readFileSync(path.join(repoRoot, "desktop/src/output/output-window-host.ts"), "utf8"),
    /roundedCorners:\s*false/,
  );
  assert.match(
    fs.readFileSync(path.join(repoRoot, "desktop/src/output/output-window-host.ts"), "utf8"),
    /hasShadow:\s*false/,
  );
});

test("mac native presentation stays window-scoped and leaves Windows fullscreen alone", () => {
  const host = fs.readFileSync(path.join(repoRoot, "desktop/src/output/output-window-host.ts"), "utf8");
  const bridge = fs.readFileSync(
    path.join(repoRoot, "desktop/src/platform/macos/mac-output-presentation.ts"),
    "utf8",
  );
  const native = fs.readFileSync(path.join(repoRoot, "desktop/native/mac-output/mac-output.mm"), "utf8");
  const engine = fs.readFileSync(path.join(repoRoot, "desktop/src/output/output-engine-core.ts"), "utf8");
  const main = fs.readFileSync(path.join(repoRoot, "desktop/src/main.ts"), "utf8");
  const builder = fs.readFileSync(path.join(repoRoot, "desktop/scripts/build-mac-output-addon.mjs"), "utf8");
  const packaging = fs.readFileSync(path.join(repoRoot, "desktop/electron-builder.yml"), "utf8");

  assert.match(bridge, /process\.platform !== "darwin"/);
  assert.match(builder, /process\.platform !== "darwin"/);
  assert.match(host, /window\.setFullScreen\(true\)/);
  assert.match(host, /setAlwaysOnTop\(input\.alwaysOnTop, "floating"\)/);
  assert.match(host, /input\.platform !== "darwin"/);
  assert.match(host, /coverSystemUi: input\.alwaysOnTop/);
  assert.match(host, /hideCursor: input\.hideCursor/);
  assert.match(host, /restoreMacOutputWindow\(output\.getNativeWindowHandle\(\)\)/);
  assert.match(host, /configureMacOutputWindow/);
  assert.match(host, /output\.getNativeWindowHandle\(\)/);
  assert.doesNotMatch(host, /operator\.getNativeWindowHandle/);
  assert.match(host, /releaseMacOutputPresentation\(window\)/);
  const releaseAt = host.indexOf("releaseMacOutputPresentation(window)");
  const closeAt = host.indexOf("window.close()", releaseAt);
  assert.ok(releaseAt > 0 && closeAt > releaseAt, "native restore runs before the output window closes");

  assert.match(engine, /windows\.close\(id\)/);
  assert.match(engine, /windows\.close\(route\.id\)/);
  assert.match(engine, /this\.stop\(route\.id\)/);
  assert.match(engine, /windows\.reconfigure/);
  assert.match(main, /outputEngine\?\.stopAll\(\)/);

  assert.match(native, /NSStatusWindowLevel \+ 1/);
  assert.match(native, /addCursorRect/);
  assert.match(native, /resetCursorRects/);
  assert.match(native, /NSTrackingActiveAlways/);
  assert.match(native, /NeudInvisibleCursor/);
  assert.match(native, /constrainFrameRect:toScreen:/);
  assert.doesNotMatch(native, /NSApplicationPresentationHideDock/);
  assert.doesNotMatch(native, /NSApplicationPresentationHideMenuBar/);
  assert.doesNotMatch(native, /setPresentationOptions/);
  assert.doesNotMatch(native, /NSCursor hide/);
  assert.doesNotMatch(native, /setVisibleOnAllWorkspaces|setFullScreen|setSimpleFullScreen|setKiosk/);
  assert.match(packaging, /dist\/platform\/macos\/\*\.node/);
  assert.match(engine, /COMPUTER_DISPLAY_OUTPUT_BACKGROUND/);
  assert.match(engine, /surface: "computer"/);
});

const stackGraphicA = {
  ...graphic,
  displayId: "display-a",
  displayName: "Stream Bid",
  slug: "stream-bid-display",
};
const stackGraphicB = {
  ...graphic,
  displayId: "display-b",
  displayName: "Stream Ticker",
  slug: "stream-ticker",
  width: 3840,
  height: 2160,
};

function sampleStack(overrides = {}) {
  const ordered = overrides.orderedMemberIds ?? [stackGraphicA.displayId, stackGraphicB.displayId];
  return {
    projectId: graphic.projectId,
    stackId: "stack:display-a|display-b",
    stackName: "Stack · Stream Bid + Stream Ticker",
    width: 3840,
    height: 2160,
    layers: ordered.map((displayId) => {
      const display = displayId === stackGraphicB.displayId ? stackGraphicB : stackGraphicA;
      return {
        displayId: display.displayId,
        displayName: display.displayName,
        slug: display.slug,
        width: display.width,
        height: display.height,
        enabled: true,
        zIndex: layerZIndexForDisplayInStack(displayId, ordered),
      };
    }),
    ...overrides,
  };
}

test("1 existing display route migrates/loads as sourceType=display", () => {
  const legacy = normalizeOutputRouteSource({ displayId: "display-1" });
  assert.equal(legacy.sourceType, "display");
  assert.equal(legacy.sourceId, "display-1");
  assert.equal(legacy.displayId, "display-1");

  const store = new MemoryOutputRouteStore();
  store.save({
    id: "legacy-route",
    name: "Legacy",
    projectId: graphic.projectId,
    displayId: graphic.displayId,
    // Intentionally omit sourceType/sourceId to simulate pre-Pass-7 rows.
    adapterType: "display",
    deviceId: "display:2:dell:3840x2160",
    mode: "borderless",
    enabled: true,
    configuration: {
      scaleMode: "fit",
      background: "#000000",
      electronDisplayId: 2,
      deviceLabel: "DELL",
      deviceWidth: 3840,
      deviceHeight: 2160,
      alwaysOnTop: true,
      hideCursor: true,
    },
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
  });
  const loaded = store.get("legacy-route");
  assert.equal(loaded.sourceType, "display");
  assert.equal(loaded.sourceId, graphic.displayId);
  assert.equal(loaded.displayId, graphic.displayId);
});

test("2 stack is selectable in output source choices", () => {
  const choices = outputSourceChoices({
    displays: [
      { id: "display-a", name: "Stream Bid", enabled: true },
      { id: "display-b", name: "Stream Ticker", enabled: true },
    ],
    stacks: [
      {
        id: "stack:display-a|display-b",
        label: "Stack · Stream Bid + Stream Ticker",
        memberCount: 2,
      },
    ],
  });
  assert.ok(choices.some((choice) => choice.sourceType === "display" && choice.sourceId === "display-a"));
  assert.ok(choices.some((choice) => choice.sourceType === "stack" && choice.group === "Stacks"));
  assert.equal(encodeOutputSourceValue("stack", "stack:a|b"), "stack|stack:a|b");
  assert.deepEqual(parseOutputSourceValue("stack|stack:a|b"), {
    sourceType: "stack",
    sourceId: "stack:a|b",
  });
});

test("3 disabled display is excluded from selector", () => {
  const choices = outputSourceChoices({
    displays: [
      { id: "on", name: "Enabled", enabled: true },
      { id: "off", name: "Disabled", enabled: false },
    ],
    stacks: [],
  });
  assert.deepEqual(
    choices.filter((choice) => choice.sourceType === "display").map((choice) => choice.sourceId),
    ["on"],
  );
});

test("4 valid stack is included in selector", () => {
  const choices = outputSourceChoices({
    displays: [{ id: "a", name: "A", enabled: true }],
    stacks: [
      { id: "stack:valid", label: "Stack · A + B", memberCount: 2 },
      { id: "stack:invalid", label: "Too small", memberCount: 1 },
    ],
  });
  assert.ok(choices.some((choice) => choice.sourceId === "stack:valid"));
  assert.equal(
    choices.filter((choice) => choice.sourceId === "stack:invalid").length,
    0,
  );
});

test("5 stack layers render via stack-fit compositor URL", async () => {
  const devices = mapComputerDisplays([display()], 9);
  let stack = sampleStack();
  const { engine, opened } = harness(devices, [stackGraphicA, stackGraphicB], {
    resolveStack: (stackId, projectId) =>
      stackId === stack.stackId && projectId === stack.projectId ? stack : null,
  });
  const created = engine.create({
    name: "Program Stack",
    projectId: graphic.projectId,
    sourceType: "stack",
    sourceId: stack.stackId,
    deviceId: devices[0].id,
  });
  assert.equal(created.sourceType, "stack");
  assert.equal(created.sourceId, stack.stackId);
  assert.equal(created.displayId, "");
  const started = await engine.start(created.id);
  assert.equal(started.ok, true);
  assert.match(opened[0].url, /\/display\/stack-fit\?/);
  assert.match(opened[0].url, /stackId=/);
  assert.match(opened[0].url, /layers=/);
  assert.match(opened[0].url, /stream-bid-display/);
  assert.match(opened[0].url, /stream-ticker/);
  assert.doesNotMatch(opened[0].url, /pinned/);
});

test("6 stack hierarchy uses TOP…BOTTOM z-index from pinned order", () => {
  const ordered = [stackGraphicA.displayId, stackGraphicB.displayId];
  assert.equal(layerZIndexForDisplayInStack(stackGraphicA.displayId, ordered), 2);
  assert.equal(layerZIndexForDisplayInStack(stackGraphicB.displayId, ordered), 1);
  const url = buildOutputStackRenderUrl({
    origin: "http://127.0.0.1:3000",
    projectId: graphic.projectId,
    stackId: "stack:x",
    layers: sampleStack({ orderedMemberIds: ordered }).layers,
    authoredWidth: 3840,
    authoredHeight: 2160,
    surface: "computer",
  });
  const layers = JSON.parse(new URL(url).searchParams.get("layers"));
  assert.equal(layers[0].zIndex, 2);
  assert.equal(layers[1].zIndex, 1);
  const client = fs.readFileSync(
    path.join(repoRoot, "src/components/displays/DisplayStackFitClient.tsx"),
    "utf8",
  );
  assert.match(client, /zIndex: layer\.zIndex/);
  assert.match(client, /data-output-stack-layer/);
  assert.doesNotMatch(client, /MANAGEMENT_PREVIEW_CHECKERBOARD/);
  assert.doesNotMatch(client, /pinned-display-title/);
});

test("7 reorder updates hierarchy on next resolve/start", async () => {
  const devices = mapComputerDisplays([display()], 9);
  let ordered = [stackGraphicA.displayId, stackGraphicB.displayId];
  const { engine, opened } = harness(devices, [stackGraphicA, stackGraphicB], {
    resolveStack: () => sampleStack({ orderedMemberIds: ordered }),
  });
  const created = engine.create({
    name: "Reorder Stack",
    projectId: graphic.projectId,
    sourceType: "stack",
    sourceId: "stack:display-a|display-b",
    deviceId: devices[0].id,
  });
  await engine.start(created.id);
  const firstLayers = JSON.parse(new URL(opened[0].url).searchParams.get("layers"));
  assert.equal(firstLayers[0].displayId, stackGraphicA.displayId);
  engine.stop(created.id);
  ordered = [stackGraphicB.displayId, stackGraphicA.displayId];
  await engine.start(created.id);
  const secondLayers = JSON.parse(new URL(opened[1].url).searchParams.get("layers"));
  assert.equal(secondLayers[0].displayId, stackGraphicB.displayId);
  assert.equal(secondLayers[0].zIndex, 2);
  assert.equal(secondLayers[1].displayId, stackGraphicA.displayId);
  assert.equal(secondLayers[1].zIndex, 1);
});

test("8 live data wiring reaches every stack layer", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const stack = sampleStack();
  const { engine, opened } = harness(devices, [stackGraphicA, stackGraphicB], {
    resolveStack: () => stack,
  });
  const created = engine.create({
    name: "Live Layers",
    projectId: graphic.projectId,
    sourceType: "stack",
    sourceId: stack.stackId,
    deviceId: devices[0].id,
  });
  await engine.start(created.id);
  const layers = JSON.parse(new URL(opened[0].url).searchParams.get("layers"));
  assert.equal(layers.length, 2);
  assert.notEqual(layers[0].slug, layers[1].slug);
  const client = fs.readFileSync(
    path.join(repoRoot, "src/components/displays/DisplayStackFitClient.tsx"),
    "utf8",
  );
  assert.match(client, /output:\s*"1"/);
  assert.match(client, /stackLayer:\s*"1"/);
  assert.match(client, /api\/display-html\/\$\{encodeURIComponent\(projectId\)\}\/\$\{encodeURIComponent\(layer\.slug\)\}/);
});

test("9 stack deletion leaves route saved but unavailable", async () => {
  const devices = mapComputerDisplays([display()], 9);
  let stack = sampleStack();
  const { engine } = harness(devices, [stackGraphicA, stackGraphicB], {
    resolveStack: () => stack,
  });
  const created = engine.create({
    name: "Gone Stack",
    projectId: graphic.projectId,
    sourceType: "stack",
    sourceId: stack.stackId,
    deviceId: devices[0].id,
  });
  stack = null;
  const view = engine.list().find((route) => route.id === created.id);
  assert.equal(view.sourceAvailable, false);
  assert.equal(view.displayName, STACK_UNAVAILABLE_FOR_OUTPUT);
  assert.equal(view.sourceId, created.sourceId);
  const started = await engine.start(created.id);
  assert.equal(started.ok, false);
  assert.equal(started.code, "stack-unavailable");
  assert.equal(started.error, STACK_UNAVAILABLE_FOR_OUTPUT);
  assert.equal(engine.list()[0].sourceId, created.sourceId);
});

test("10 computer output stack composites over black", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const { engine, opened } = harness(devices, [stackGraphicA, stackGraphicB], {
    resolveStack: () => sampleStack(),
  });
  const created = engine.create({
    name: "Black Stack",
    projectId: graphic.projectId,
    sourceType: "stack",
    sourceId: "stack:display-a|display-b",
    deviceId: devices[0].id,
  });
  await engine.start(created.id);
  assert.equal(opened[0].background, "#000000");
  assert.match(opened[0].url, /surface=computer/);
  const client = fs.readFileSync(
    path.join(repoRoot, "src/components/displays/DisplayStackFitClient.tsx"),
    "utf8",
  );
  assert.match(client, /backgroundColor:.*#000000/);
  assert.match(client, /computerOutput \? \"#000000\"/);
});

test("11 external Fill stack render uses decklink surface then existing Fill pipeline", async () => {
  const url = buildOutputStackRenderUrl({
    origin: "http://127.0.0.1:3000",
    projectId: graphic.projectId,
    stackId: "stack:display-a|display-b",
    layers: sampleStack().layers,
    authoredWidth: 3840,
    authoredHeight: 2160,
    surface: "decklink",
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.match(url, /\/display\/stack-fit\?/);
  assert.match(url, /surface=decklink/);
  assert.match(url, /outputWidth=1920/);
  assert.match(url, /outputHeight=1080/);
  const client = fs.readFileSync(
    path.join(repoRoot, "src/components/displays/DisplayStackFitClient.tsx"),
    "utf8",
  );
  assert.match(client, /surface === \"decklink\"/);
  assert.match(client, /backgroundColor: \"transparent\"/);
});

test("12 Key+Fill alpha contract stays one final stack frame into existing pipeline", () => {
  const engine = fs.readFileSync(path.join(repoRoot, "desktop/src/output/output-engine-core.ts"), "utf8");
  assert.match(engine, /buildOutputStackRenderUrl/);
  assert.match(engine, /presentationMode/);
  assert.match(engine, /deps\.decklink\.start/);
  // Single renderUrl / authored size — not per-layer DeckLink starts.
  assert.doesNotMatch(engine, /for \(const layer of .*\)[\s\S]*decklink\.start/);
  const processor = fs.readFileSync(path.join(repoRoot, "desktop/src/output/key-fill-processor.ts"), "utf8");
  assert.match(processor, /premultiplied|premul/i);
});

test("13 diagnostics identify sourceType and sourceId", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const { engine } = harness(devices, [stackGraphicA, stackGraphicB], {
    resolveStack: () => sampleStack(),
  });
  const displayRoute = engine.create({
    name: "Display Route",
    projectId: graphic.projectId,
    displayId: stackGraphicA.displayId,
    deviceId: devices[0].id,
  });
  const stackRoute = engine.create({
    name: "Stack Route",
    projectId: graphic.projectId,
    sourceType: "stack",
    sourceId: "stack:display-a|display-b",
    deviceId: devices[0].id,
  });
  const diagnostics = engine.diagnostics();
  const displayDiag = diagnostics.find((entry) => entry.routeId === displayRoute.id);
  const stackDiag = diagnostics.find((entry) => entry.routeId === stackRoute.id);
  assert.equal(displayDiag.sourceType, "display");
  assert.equal(displayDiag.sourceId, stackGraphicA.displayId);
  assert.equal(stackDiag.sourceType, "stack");
  assert.equal(stackDiag.sourceId, "stack:display-a|display-b");
  assert.equal(stackDiag.displayId, "");
});

test("14 restart persistence keeps stack source identity", async () => {
  const devices = mapComputerDisplays([display()], 9);
  const store = new MemoryOutputRouteStore();
  const engine = new OutputEngine({
    store,
    windows: { async open() { return { ok: true }; }, close() {} },
    discoverDevices: () => devices,
    resolveDisplay: (id) =>
      [stackGraphicA, stackGraphicB].find((entry) => entry.displayId === id) ?? null,
    resolveStack: () => sampleStack(),
    origin: () => "http://127.0.0.1:3000",
  });
  const created = engine.create({
    name: "Persist Stack",
    projectId: graphic.projectId,
    sourceType: "stack",
    sourceId: "stack:display-a|display-b",
    deviceId: devices[0].id,
  });
  const reloaded = new OutputEngine({
    store,
    windows: { async open() { return { ok: true }; }, close() {} },
    discoverDevices: () => devices,
    resolveDisplay: () => stackGraphicA,
    resolveStack: () => sampleStack(),
    origin: () => "http://127.0.0.1:3000",
  });
  const route = reloaded.list()[0];
  assert.equal(route.id, created.id);
  assert.equal(route.sourceType, "stack");
  assert.equal(route.sourceId, "stack:display-a|display-b");
  assert.equal(route.displayId, "");
  assert.notEqual(route.displayId, route.sourceId);
});

test("migration 042 adds source columns and never stores stack ids in display_id", async () => {
  const migrate = fs.readFileSync(path.join(repoRoot, "desktop/src/database/migrate.ts"), "utf8");
  assert.ok(migrate.includes("042_output_route_source.sql"));
  const sql = fs.readFileSync(
    path.join(repoRoot, "desktop/src/database/migrations/042_output_route_source.sql"),
    "utf8",
  );
  assert.match(sql, /source_type/);
  assert.match(sql, /source_id/);
  assert.match(sql, /source_id = display_id/);
});
