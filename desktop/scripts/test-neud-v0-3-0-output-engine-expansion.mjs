#!/usr/bin/env node
/**
 * NEUD v0.3.0 Output Engine expansion — UI contracts:
 * submenu collision placement, disk adapter label, interruption copy,
 * global tally / performance IPC wiring.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  buildOutputInterruptionPrompt,
  isActiveOutputSessionStatus,
} from "../../shared/output/output-interruption-guard.ts";
import { resolveSubmenuPlacement } from "../../src/lib/displays/context-menu-placement.ts";
import { adapterTypeToOperatorLabel } from "../../src/lib/output/output-adapter-labels.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("submenu placement: opens left when right space is insufficient", () => {
  const placement = resolveSubmenuPlacement({
    menuRect: { left: 900, right: 1100, top: 40, bottom: 200 },
    submenuWidth: 220,
    submenuHeight: 120,
    viewport: { width: 1200, height: 800 },
  });
  assert.equal(placement.openLeft, true);
  assert.equal(placement.offsetTop, 0);
});

test("submenu placement: stays right when space allows", () => {
  const placement = resolveSubmenuPlacement({
    menuRect: { left: 100, right: 320, top: 40, bottom: 200 },
    submenuWidth: 220,
    submenuHeight: 120,
    viewport: { width: 1200, height: 800 },
  });
  assert.equal(placement.openLeft, false);
  assert.equal(placement.offsetTop, 0);
});

test("submenu placement: shifts upward when bottom overflows", () => {
  const placement = resolveSubmenuPlacement({
    menuRect: { left: 100, right: 320, top: 720, bottom: 780 },
    submenuWidth: 220,
    submenuHeight: 160,
    viewport: { width: 1200, height: 800 },
  });
  assert.equal(placement.openLeft, false);
  assert.equal(placement.offsetTop, 800 - (720 + 160));
  assert.ok(placement.offsetTop < 0);
});

test("PinnedViewerContextMenu wires collision helper + data attributes", () => {
  const menu = read("src/components/displays/PinnedViewerContextMenu.tsx");
  assert.match(menu, /resolveSubmenuPlacement/);
  assert.match(menu, /data-submenu-open-left/);
  assert.match(menu, /data-submenu-panel/);
  assert.match(menu, /right-full left-auto/);
  assert.match(menu, /group-hover:visible/);
  assert.match(menu, /group-focus-within:visible/);
});

test("adapterType disk → Record to Disk", () => {
  assert.equal(adapterTypeToOperatorLabel("disk"), "Record to Disk");
  assert.equal(adapterTypeToOperatorLabel("display"), "Computer Display");
  const desktop = read("desktop/src/output/decklink-model.ts");
  assert.match(desktop, /case "disk":\s*return "Record to Disk"/);
});

test("active session statuses include recording and finalizing", () => {
  assert.equal(isActiveOutputSessionStatus("live"), true);
  assert.equal(isActiveOutputSessionStatus("starting"), true);
  assert.equal(isActiveOutputSessionStatus("recording"), true);
  assert.equal(isActiveOutputSessionStatus("finalizing"), true);
  assert.equal(isActiveOutputSessionStatus("stopped"), false);
});

test("stackChange interruption copy lists outputs and recording risk", () => {
  const copy = buildOutputInterruptionPrompt({
    reason: "stackChange",
    activeOutputs: [
      {
        routeId: "r1",
        name: "Arena Rec",
        projectId: "p1",
        sourceType: "stack",
        sourceId: "s1",
        status: "recording",
        adapterType: "disk",
      },
    ],
  });
  assert.equal(copy.title, "Display Is Currently On Air");
  assert.match(copy.description, /Arena Rec/);
  assert.match(copy.description, /Recording may be interrupted/);
  assert.equal(copy.confirmLabel, "Disconnect Anyway");
});

test("global tally + performance bar + IPC wiring present", () => {
  const tally = read("src/components/output/GlobalOutputTally.tsx");
  const titleBar = read("src/components/portal/AppTitleBar.tsx");
  const perf = read("src/components/portal/PerformanceStatusBar.tsx");
  const shell = read("src/components/portal/DesktopAppShell.tsx");
  const outputIpc = read("desktop/src/ipc/output.ts");
  const systemIpc = read("desktop/src/ipc/system.ts");
  const preload = read("desktop/src/preload.ts");
  const metrics = read("desktop/src/services/performance-metrics-service.ts");
  const dialogHost = read("src/components/portal/NeudAppDialogHost.tsx");

  assert.match(tally, /getTally/);
  assert.match(tally, /onSessionChanged/);
  assert.match(tally, /router\.push\("\/outputs"\)/);
  assert.match(titleBar, /GlobalOutputTally/);
  assert.match(perf, /--neud-perf-bar-height/);
  assert.match(perf, /performanceMetrics/);
  assert.match(shell, /PerformanceStatusBar/);
  assert.match(shell, /--neud-perf-bar-height/);
  assert.match(outputIpc, /neud:output:getTally/);
  assert.match(outputIpc, /neud:output:recordingCodecs/);
  assert.match(outputIpc, /neud:output:pickRecordingFolder/);
  assert.match(outputIpc, /neud:output:openRecordingFolder/);
  assert.match(outputIpc, /neud:output:sessionChanged/);
  assert.match(systemIpc, /neud:system:performanceMetrics/);
  assert.match(preload, /getTally:/);
  assert.match(preload, /recordingCodecs:/);
  assert.match(preload, /onSessionChanged:/);
  assert.match(preload, /performanceMetrics:/);
  assert.match(metrics, /available/);
  assert.doesNotMatch(metrics, /gpuPercent|gpuUsage/);
  assert.match(dialogHost, /getOutputInterruptionPromptCopy|buildOutputInterruptionPrompt/);
});

test("performance metrics collector returns real CPU/RAM shape", async () => {
  const mod = await import(
    pathToFileURL(path.join(repoRoot, "desktop/src/services/performance-metrics-service.ts")).href
  );
  const snapshot = mod.collectPerformanceMetrics();
  assert.equal(typeof snapshot.cpu.neudPercent, "number");
  assert.ok(snapshot.memory.neudBytes > 0);
  assert.ok(snapshot.memory.systemTotalBytes > 0);
  // GPU availability depends on native addon load; assert boolean shape only.
  assert.equal(typeof snapshot.gpu.available, "boolean");
});
