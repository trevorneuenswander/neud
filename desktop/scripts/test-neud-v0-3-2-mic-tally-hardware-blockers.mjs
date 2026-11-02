#!/usr/bin/env node
/**
 * Mic Tally hardware-testing blocker regressions:
 * - IP draft stability vs status polling
 * - Display hydration repair for already-installed projects
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("Data Source IP draft is not overwritten by status polling while dirty", () => {
  const client = read("src/components/mic-tally/MicTallyDataSourceClient.tsx");
  assert.match(client, /formDirty/);
  assert.match(client, /forceForm \|\| !formDirty\.current/);
  assert.match(client, /markDirty/);
  assert.match(client, /setHost\(e\.target\.value\)/);
  // Poll path must call applyState with forceForm=false
  assert.match(client, /applyState\(next,\s*false\)/);
  // Authoritative save/connect path forces form from server
  assert.match(client, /applyState\(next,\s*true\)/);
  // Must not call hydrateForm unconditionally on every refresh anymore
  assert.doesNotMatch(client, /hydrateForm\(next\)/);
});

test("IP validation error is shown for invalid addresses", () => {
  const client = read("src/components/mic-tally/MicTallyDataSourceClient.tsx");
  assert.match(client, /hostValidationError/);
  assert.match(client, /Enter a valid IPv4 address/);
  assert.match(client, /Mixer IP address is required/);
});

test("Local-dev IP prefill is draft-only and not a package default", () => {
  const client = read("src/components/mic-tally/MicTallyDataSourceClient.tsx");
  assert.match(client, /192\.168\.2\.87/);
  assert.match(client, /isLocalDevHost/);
  assert.match(client, /does not persist until Save|One-time local-dev draft/i);
  const builder = read("desktop/src/packages/mic-tally-package-builder.ts");
  assert.doesNotMatch(builder, /192\.168\.2\.87/);
  const service = read("desktop/src/packages/mic-tally/mic-tally-service.ts");
  assert.doesNotMatch(service, /192\.168\.2\.87/);
  const migration = read("desktop/src/database/migrations/049_mic_tally_state.sql");
  assert.doesNotMatch(migration, /192\.168\.2\.87/);
  assert.match(migration, /mixer_host TEXT NOT NULL DEFAULT ''/);
});

test("Connection status labels distinguish connecting / connected / awaiting / error", () => {
  const client = read("src/components/mic-tally/MicTallyDataSourceClient.tsx");
  assert.match(client, /Connecting…/);
  assert.match(client, /Connected/);
  assert.match(client, /awaiting channel state/);
  assert.match(client, /Disconnected/);
  assert.match(client, /return "Error"/);
  assert.match(client, /connectionLabel\(state\?\.connectionStatus, state\?\.lastError\)/);
});

test("Mic Tally display repair is wired for already-installed projects", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /repairMicTallyProjectDisplays/);
  assert.match(main, /setMicTallyDisplayRepair/);
  assert.match(main, /project\.projectType !== "mic-tally"/);
  assert.match(main, /reconcileDevelopmentBuiltinPackage\("mic-tally"\)/);
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /repair-displays/);
  assert.match(api, /repairMicTallyDisplays/);
  const data = read("desktop/src/services/local-data-service.ts");
  assert.match(data, /repairMicTallyDisplays/);
  const client = read("src/components/mic-tally/MicTallyDataSourceClient.tsx");
  assert.match(client, /repair-displays/);
});

test("Display hydration is idempotent, keyed by slug, and preserves user content", () => {
  const hydration = read(
    "desktop/src/packages/mic-tally/mic-tally-package-display-hydration.ts",
  );
  assert.match(hydration, /getBySlug\(projectId, definition\.slug\)/);
  assert.match(hydration, /Display already published with the packaged HTML/);
  assert.match(hydration, /leaving published content unchanged/);
  assert.match(hydration, /MIC_TALLY_UHD_PREVIOUS_PACKAGED_SOURCE_HASHES/);
  assert.match(hydration, /Upgraded from prior packaged Mic Tally HTML/);
  assert.match(hydration, /projectType === "mic-tally"/);
  assert.match(hydration, /mic-tally-three-mics-uhd/);
});

test("UHD graphic uses compact top-row layout", () => {
  const html = read("desktop/src/displays/bundled/mic-tally-three-mics-uhd-v1.html");
  assert.match(html, /width:\s*3840px/);
  assert.match(html, /height:\s*2160px/);
  assert.match(html, /background:\s*transparent/);
  assert.match(html, /top:\s*60px/);
  assert.match(html, /width:\s*850px/);
  assert.match(html, /height:\s*250px/);
  assert.match(html, /data-slot="1"/);
  assert.match(html, /data-slot="2"/);
  assert.match(html, /data-slot="3"/);
  assert.match(html, /\.card\[data-slot="1"\]/);
  assert.match(html, /left:\s*215px/);
  assert.match(html, /left:\s*1495px/);
  assert.match(html, /left:\s*2775px/);
  assert.doesNotMatch(html, /height:\s*1480px/);
});

test("Connect saves before connecting and does not clear host on disconnect path", () => {
  const client = read("src/components/mic-tally/MicTallyDataSourceClient.tsx");
  assert.match(client, /const saved = await saveConfig\(\)/);
  assert.match(client, /if \(saved\) await run\("connect"\)/);
  const service = read("desktop/src/packages/mic-tally/mic-tally-service.ts");
  // disconnect must not wipe mixer_host
  assert.match(service, /disconnect\(projectId: string\)/);
  const disconnectBody = service.slice(service.indexOf("disconnect(projectId: string)"));
  const disconnectFn = disconnectBody.slice(0, disconnectBody.indexOf("\n  async reconnect"));
  assert.doesNotMatch(disconnectFn, /mixer_host\s*=/);
});

test("SEMA package baseline remains 10", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION = 10/);
});
