#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 17 — Stream Bid viewBox fix, Graphic Editor Phase 5,
 * and live Output/Stack safety guards (tests 1–52 contract coverage).
 *
 * Bitmap acceptance for Stream Bid runs in test-stream-bid-descender-fixture.mjs.
 * Editor draw/handle unit tests: test-neud-graphic-editor-pass-17.mjs
 * Phase 5 wiring: test-graphic-editor-phase5.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  MemoryOutputRouteStore,
  OutputEngine,
  mapComputerDisplays,
} from "../src/output/output-engine-core.ts";
import {
  buildOutputInterruptionPrompt,
  getActiveOutputs,
  getActiveOutputsForStack,
  getActiveOutputsForStacks,
  shouldConfirmOutputInterruption,
  stackIdsForPinnedViewerMutation,
  uniqueActiveOutputRouteIds,
} from "../../shared/output/output-interruption-guard.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function routeView(overrides = {}) {
  return {
    id: "route-1",
    name: "Output 1",
    projectId: "project-1",
    sourceType: "stack",
    sourceId: "stack-live",
    session: { status: "live" },
    ...overrides,
  };
}

test("42: live stack modification warning copy", () => {
  const copy = buildOutputInterruptionPrompt({
    reason: "stackChange",
    activeOutputs: [{ ...routeView(), routeId: "route-1", status: "live" }],
  });
  assert.equal(copy.title, "Display Is Currently On Air");
  assert.match(copy.description, /on air/i);
  assert.match(copy.description, /Output 1/);
  assert.equal(copy.confirmLabel, "Disconnect Anyway");
  assert.equal(copy.cancelLabel, "Cancel");
});

test("43–44: guard helpers identify live stack outputs", () => {
  const routes = [
    routeView({ id: "a", session: { status: "live" } }),
    routeView({ id: "b", sourceId: "other", session: { status: "starting" } }),
    routeView({ id: "c", sourceType: "display", sourceId: "d1", session: { status: "stopped" } }),
  ];
  const liveForStack = getActiveOutputsForStack(routes, "stack-live");
  assert.equal(liveForStack.length, 1);
  assert.equal(liveForStack[0]?.routeId, "a");
  assert.equal(shouldConfirmOutputInterruption(liveForStack), true);
});

test("45: multiple live outputs on the same stack", () => {
  const routes = [
    routeView({ id: "out-a", session: { status: "live" } }),
    routeView({ id: "out-b", session: { status: "starting" } }),
  ];
  const affected = getActiveOutputsForStacks(routes, ["stack-live"]);
  assert.equal(affected.length, 2);
  assert.equal(uniqueActiveOutputRouteIds(affected).length, 2);
  const copy = buildOutputInterruptionPrompt({
    reason: "stackChange",
    activeOutputs: affected,
  });
  assert.equal(copy.title, "Display Is Currently On Air");
  assert.match(copy.description, /are currently on air/i);
  assert.equal(copy.confirmLabel, "Disconnect Anyway");
});

test("46–48: quit wiring stops outputs then exits", () => {
  const main = read("desktop/src/main.ts");
  const dialogHost = read("src/components/portal/NeudAppDialogHost.tsx");
  assert.match(main, /outputEngine\?\.hasActiveSession\(\)/);
  assert.match(main, /readLiveOutputSessions/);
  assert.match(main, /activeOutputs: readLiveOutputSessions\(\)/);
  assert.match(main, /outputEngine\?\.stopAll\(\)/);
  assert.match(dialogHost, /getOutputInterruptionPromptCopy\("quit"/);
  const quitCopy = buildOutputInterruptionPrompt({
    reason: "quit",
    activeOutputs: [routeView()],
  });
  assert.equal(quitCopy.confirmLabel, "Quit and Stop Outputs");
});

test("49–51: logout warning uses shared confirmOutputInterruption", () => {
  const signOut = read("src/lib/auth/force-local-sign-out.ts");
  const dialogHost = read("src/components/portal/NeudAppDialogHost.tsx");
  assert.match(signOut, /confirmOutputInterruption\("logout"/);
  assert.match(signOut, /stopActiveOutputRoutes/);
  assert.match(signOut, /uniqueActiveOutputRouteIds/);
  assert.match(dialogHost, /neud-output-interruption-request/);
  const logoutCopy = buildOutputInterruptionPrompt({
    reason: "logout",
    activeOutputs: [routeView()],
  });
  assert.equal(logoutCopy.confirmLabel, "Sign Out and Stop Outputs");
});

test("52: no warning when no outputs live", () => {
  const routes = [
    routeView({ session: { status: "stopped" } }),
    routeView({ id: "two", session: { status: "error" } }),
  ];
  assert.equal(getActiveOutputs(routes).length, 0);
  assert.equal(shouldConfirmOutputInterruption([]), false);
});

test("displayChange: warn when deleting/archiving/disabling a live source display", async () => {
  const {
    getActiveOutputsAffectedByDisplay,
    getActiveOutputsForDisplay,
    buildOutputInterruptionPrompt: buildPrompt,
  } = await import("../../shared/output/output-interruption-guard.ts");
  const routes = [
    routeView({
      id: "direct",
      sourceType: "display",
      sourceId: "disp-1",
      session: { status: "live" },
    }),
    routeView({
      id: "stack-out",
      sourceType: "stack",
      sourceId: "stack-a",
      session: { status: "recording" },
    }),
  ];
  assert.equal(getActiveOutputsForDisplay(routes, "disp-1").length, 1);
  const affected = getActiveOutputsAffectedByDisplay(routes, "disp-1", [
    { id: "stack-a", displayIds: ["disp-1", "disp-2"] },
  ]);
  assert.equal(affected.length, 2);
  const copy = buildPrompt({ reason: "displayChange", activeOutputs: affected });
  assert.equal(copy.title, "Display Is Currently On Air");
  assert.match(copy.description, /Deleting, archiving, or disabling/i);
  assert.equal(copy.confirmLabel, "Disconnect Anyway");
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /confirmAndStopOutputsForDisplay/);
  const card = read("src/components/displays/DisplayCard.tsx");
  assert.match(card, /confirmAndStopOutputsForDisplay/);
});

test("OutputEngine.getActiveOutputs reflects live sessions", async () => {
  const monitor = mapComputerDisplays(
    [
      {
        id: 2,
        label: "External",
        bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
        workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
        size: { width: 1920, height: 1080 },
        scaleFactor: 1,
        rotation: 0,
        internal: false,
      },
    ],
    9,
  )[0];
  const store = new MemoryOutputRouteStore();
  const engine = new OutputEngine({
    store,
    origin: () => "http://127.0.0.1:3000",
    resolveDisplay: () => null,
    resolveStack: () => ({
      projectId: "project-1",
      stackId: "stack-live",
      stackName: "Live Stack",
      width: 1920,
      height: 1080,
      layers: [
        {
          displayId: "d1",
          displayName: "A",
          slug: "a",
          width: 1920,
          height: 1080,
          enabled: true,
          zIndex: 2,
        },
        {
          displayId: "d2",
          displayName: "B",
          slug: "b",
          width: 1920,
          height: 1080,
          enabled: true,
          zIndex: 1,
        },
      ],
    }),
    windows: {
      open: async () => ({ ok: true }),
      close: () => {},
    },
    discoverDevices: () => [monitor],
  });

  const created = engine.create({
    projectId: "project-1",
    sourceType: "stack",
    sourceId: "stack-live",
    deviceId: monitor.id,
  });
  const started = await engine.start(created.id);
  assert.equal(started.ok, true);

  const active = engine.getActiveOutputs();
  assert.equal(active.length, 1);
  assert.equal(active[0]?.sourceId, "stack-live");

  engine.stopRoutes([created.id]);
  assert.equal(engine.getActiveOutputs().length, 0);
});

test("stack mutation resolves affected stack ids", () => {
  const stacks = [{ id: "stack-abc", displayIds: ["d1", "d2"] }];
  assert.deepEqual(
    stackIdsForPinnedViewerMutation("unpinStack", { stackId: "stack-abc" }, stacks),
    ["stack-abc"],
  );
  assert.deepEqual(
    stackIdsForPinnedViewerMutation(
      "addToStack",
      { target: { kind: "stack", stackId: "stack-abc" } },
      stacks,
    ),
    ["stack-abc"],
  );
  assert.deepEqual(
    stackIdsForPinnedViewerMutation(
      "addToStack",
      { target: { kind: "display", displayId: "d1" } },
      stacks,
    ),
    ["stack-abc"],
  );
  assert.deepEqual(
    stackIdsForPinnedViewerMutation(
      "addToStack",
      { target: { kind: "display", displayId: "d9" } },
      stacks,
    ),
    [],
  );
});

test("shared guard module wired in stack UI and IPC", () => {
  assert.ok(fs.existsSync(path.join(repoRoot, "shared/output/output-interruption-guard.ts")));
  const pinned = read("src/lib/displays/pinned-viewer-context.tsx");
  const outputIpc = read("desktop/src/ipc/output.ts");
  assert.match(pinned, /guardPinnedStackMutation/);
  assert.match(outputIpc, /neud:output:getActiveOutputs/);
  assert.match(outputIpc, /stopRoutes/);
});

test("1–9: Stream Bid title layout + bitmap fixture wired (current pass22)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const fixture = read("desktop/scripts/test-stream-bid-descender-fixture.mjs");
  // Pass 17 baseline evolved through later correction passes; current locked layout is pass22.
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /viewBox/);
  assert.match(html, /__streamBidCaptureTitleGeometry|captureTitleGeometry|title-layout/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.match(fixture, /SLyy|SLygj/);
  assert.match(fixture, /safetyViewBox|safetyPx/);
  assert.match(fixture, /hardCut/);
  assert.match(fixture, /pass22/);
});

test("10–14: editor toolbar Undo/Redo left of Group; zoom icons present", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  const icons = read("src/components/editor/editor-toolbar-icons.tsx");
  const groupIdx = client.indexOf('iconBtn("Group"');
  const undoIdx = client.indexOf('iconBtn("Undo"');
  const redoIdx = client.indexOf('iconBtn("Redo"');
  const selectIdx = client.indexOf('iconBtn("Select"');
  // Pass 18+: Undo/Redo sit left; Group sits right on the layers toolbar strip.
  assert.ok(undoIdx > 0 && redoIdx > undoIdx && groupIdx > redoIdx);
  assert.ok(selectIdx > 0, "canvas Select tool remains available");
  assert.equal((client.match(/iconBtn\("Undo"/g) || []).length, 1);
  assert.equal((client.match(/iconBtn\("Redo"/g) || []).length, 1);
  assert.match(icons, /EditorZoomOutIcon/);
  assert.match(icons, /EditorZoomInIcon/);
  assert.match(client, /EditorZoomOutIcon/);
  assert.match(client, /EditorZoomInIcon/);
  assert.match(client, /Zoom Out/);
  assert.match(client, /Zoom In/);
});

test("15–28: selection, draw tools, transform handles", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  const tools = read("src/lib/editor/canvas-tools.ts");
  const handles = read("src/lib/editor/transform-handles.ts");
  assert.match(tools, /hitTestTopLayer/);
  assert.match(tools, /computeShapeDrawBounds/);
  assert.match(client, /hitTestTopLayer/);
  assert.match(client, /clearSelection|setSelectedId\(null\)/);
  assert.match(client, /activeTool === "rect"/);
  assert.match(client, /activeTool === "ellipse"/);
  assert.match(client, /shapeDraw/);
  assert.match(client, /Escape/);
  assert.match(handles, /HANDLE_VISUAL|visualSize|hitSize/);
  assert.match(handles, /nwse-resize/);
  assert.match(handles, /nesw-resize/);
  assert.match(handles, /ew-resize/);
  assert.match(handles, /ns-resize/);
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/scripts/test-neud-graphic-editor-pass-17.mjs")));
});

test("29–41: Phase 5 working UI modules and panels", () => {
  const required = [
    "src/lib/editor/smart-guides.ts",
    "src/lib/editor/rulers.ts",
    "src/lib/editor/editor-history.ts",
    "src/lib/editor/project-assets.ts",
    "src/lib/editor/brand-kit.ts",
    "src/lib/editor/text-styles.ts",
    "src/lib/editor/inline-text-tokens.ts",
    "src/lib/editor/editor-components.ts",
    "src/lib/editor/operator-controls.ts",
    "src/lib/editor/named-drafts.ts",
    "src/lib/editor/font-management.ts",
    "src/lib/editor/neudgraphic-package.ts",
    "src/components/editor/EditorHistoryPanel.tsx",
    "src/components/editor/EditorRulers.tsx",
    "src/components/editor/AssetLibraryPanel.tsx",
    "src/components/editor/EditorDesignPanel.tsx",
    "src/components/editor/InlineTokenEditor.tsx",
    "src/components/editor/NamedDraftsPanel.tsx",
    "src/components/editor/VersionCompareModal.tsx",
  ];
  for (const rel of required) {
    assert.ok(fs.existsSync(path.join(repoRoot, rel)), `missing ${rel}`);
  }
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(client, /EditorHistoryPanel/);
  assert.match(client, /EditorRulers/);
  assert.match(client, /AssetLibraryPanel/);
  assert.match(client, /VersionCompareModal/);
  assert.match(client, /parseNeudGraphicPackage|Import \.neudgraphic/);
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/scripts/test-graphic-editor-phase5.mjs")));
});
