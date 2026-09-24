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

test("developer html display card does not parent-poll preview data", () => {
  const source = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.doesNotMatch(source, /pollDataEndpoint/);
  assert.doesNotMatch(source, /setInterval\(\(\) => \{\s*void pollDataEndpoint/);
});

test("display runtime poller uses single-flight", () => {
  const source = read("public/displays/shared/display-connection.js");
  assert.match(source, /if \(dataInFlight\)/);
});

test("display card avoids management-card data polling", () => {
  const source = read("src/components/displays/DisplayCard.tsx");
  assert.doesNotMatch(source, /pollDataEndpoint/);
  assert.doesNotMatch(source, /setInterval\(\(\) => \{/);
  assert.match(source, /previewOpen/);
});

test("app settings skip identical sqlite writes", () => {
  assert.match(
    read("desktop/src/repositories/app-settings-repository.ts"),
    /existing\?\.value_json === nextJson/,
  );
});

test("shared auth diagnostics dedupe before sqlite", () => {
  assert.match(
    read("desktop/src/services/supabase-user-session.ts"),
    /lastPersistedSharedDiagnosticsJson/,
  );
  assert.match(read("desktop/src/services/supabase-user-session.ts"), /peekAuthenticatedClient/);
});

test("cloud coordinator can return cached client", () => {
  assert.match(read("desktop/src/services/authenticated-cloud-coordinator.ts"), /cache_hit/);
});

test("display sync coalesces duplicate requests", () => {
  const source = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(source, /if \(this\.syncInProgress\)/);
  assert.match(source, /syncFollowUpRequested = true/);
});

test("display bridge read path avoids ticker diagnostics refresh", () => {
  const source = read("desktop/src/services/local-data-service.ts");
  const genericBlock = source.match(
    /getGenericDisplayBridgeData\(projectId: string\) \{[\s\S]*?^\  \}/m,
  )?.[0];
  assert.ok(genericBlock);
  assert.doesNotMatch(genericBlock, /refreshStreamTickerFilterDiagnostics/);
});

test("local database debounces wasm export", () => {
  assert.match(read("desktop/src/database/connection.ts"), /schedulePersist/);
});

test("performance diagnostic script exists", () => {
  assert.match(
    read("scripts/live-validation/diagnose-neud-runtime-performance.mjs"),
    /neud-runtime-performance\.json/,
  );
});
