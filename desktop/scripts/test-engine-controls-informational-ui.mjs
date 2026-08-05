#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("engine controls do not render informational no-op helper message block", () => {
  const controls = read("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  assert.doesNotMatch(controls, /helperMessages/);
  assert.doesNotMatch(controls, /Engine is already running\./);
  assert.doesNotMatch(controls, /Stop is unavailable while the engine is idle\./);
});

test("engine controls do not show persistent green stop success notification", () => {
  const controls = read("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  assert.doesNotMatch(controls, /Stop requested\. Waiting for worker shutdown\./);
  assert.match(controls, /command !== "stop"/);
});

test("engine controls do not show green start success notification", () => {
  const controls = read("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  assert.doesNotMatch(controls, /Local Data Engine started/);
  const startSuccessBlock = controls.slice(
    controls.indexOf("if (result.ok)"),
    controls.indexOf("} else {", controls.indexOf("if (result.ok)")),
  );
  assert.doesNotMatch(startSuccessBlock, /command === "start"/);
  assert.doesNotMatch(startSuccessBlock, /setDesktopMessage\([\s\S]*start/);
});

test("engine manager does not return start success message", () => {
  const manager = read("desktop/src/services/engine-manager.ts");
  assert.doesNotMatch(manager, /Local Data Engine started\./);
});

test("engine controls still surface real desktop and server errors", () => {
  const controls = read("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  assert.match(controls, /showDesktopError/);
  assert.match(controls, /showServerError/);
  assert.match(controls, /operationalError/);
});

test("engine controls preserve stopping state transition", () => {
  const controls = read("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  assert.match(controls, /setStoppingDesktop\(true\)/);
  assert.match(controls, /desktopStoppingActive/);
  assert.match(controls, /"stopping"/);
});
