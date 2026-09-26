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

test("Help menu exposes Export Diagnostics", () => {
  const menu = read("desktop/src/menu/application-menu.ts");
  assert.match(menu, /Export Diagnostics/);
  assert.match(menu, /exportDiagnosticsHandler/);
});

test("diagnostics export service redacts secret-like keys", () => {
  const service = read("desktop/src/services/diagnostics-export-service.ts");
  assert.match(service, /SECRET_KEY_PATTERN/);
  assert.match(service, /\[redacted\]/);
  assert.match(service, /live-display-pipeline\.jsonl/);
  assert.doesNotMatch(service, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("IPC exposes neud:app:exportDiagnostics", () => {
  const ipc = read("desktop/src/ipc/app.ts");
  const preload = read("desktop/src/preload.ts");
  assert.match(ipc, /neud:app:exportDiagnostics/);
  assert.match(preload, /exportDiagnostics/);
});
