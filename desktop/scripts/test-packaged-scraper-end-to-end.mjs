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

test("engine IPC start reaches EngineManager.start", () => {
  const ipc = read("desktop/src/ipc/engines.ts");
  const manager = read("desktop/src/services/engine-manager.ts");
  assert.match(ipc, /neud:engines:start/);
  assert.match(ipc, /engineManager\.start/);
  assert.match(manager, /async start\(/);
});

test("start surfaces spawn and validation failures to UI result", () => {
  const manager = read("desktop/src/services/engine-manager.ts");
  assert.match(manager, /code: "missing-credentials"/);
  assert.match(manager, /lastError: message/);
  assert.match(manager, /child\.on\("error"/);
});

test("renderer uses desktop IPC control path", () => {
  const controls = read("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  const client = read("src/lib/desktop/client.ts");
  assert.match(controls, /controlDesktopEngine/);
  assert.match(client, /api\.engines\.start/);
});

test("migration normalizes remote-worker scrapers to local-desktop", () => {
  const migration = read("desktop/src/database/migrations/036_display_revision_version_repair.sql");
  assert.match(migration, /execution_mode/);
  assert.match(migration, /local-desktop/);
});
