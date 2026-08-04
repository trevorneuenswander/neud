#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("developer html card uses refreshRateMs state for preview poll interval", () => {
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /useMemo\([\s\S]*refreshRateMs/);
  assert.match(card, /notifyDisplayRefreshRateChanged/);
  assert.doesNotMatch(
    card,
    /handleRefreshRateChange[\s\S]{0,300}requestDisplayViewerReload/,
  );
});

test("display config script injects pollIntervalMs from saved refresh rate", () => {
  const templates = readSrc("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /pollIntervalMs\?: number/);
  assert.match(templates, /config\.pollIntervalMs = input\.pollIntervalMs/);
  assert.match(templates, /pollIntervalMs,/);
});

test("runtime exposes poll interval setter for live updates", () => {
  const runtime = readSrc("public/neud-display-runtime.js");
  assert.match(runtime, /window\.__NEUD_RUNTIME_SET_POLL_INTERVAL__/);
  assert.match(runtime, /function setPollIntervalMs/);
  assert.match(runtime, /resumePolling\(\)/);
});

test("fetch guard forwards refresh-rate changes to runtime", () => {
  const templates = readSrc("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /neud-display-refresh-rate-changed/);
  assert.match(templates, /__NEUD_RUNTIME_SET_POLL_INTERVAL__/);
});

test("refresh rate persists through displays repository field", () => {
  const repo = readSrc("desktop/src/repositories/displays-repository.ts");
  const api = readSrc("desktop/src/services/local-api-server.ts");
  assert.match(repo, /refresh_rate_ms|refreshRateMs/);
  assert.match(api, /refresh-rate/);
});

test("resolve display viewer passes refresh rate into wrapped HTML config", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /pollIntervalMs = normalizeDisplayRefreshRateMs\(display\.refreshRateMs\)/);
  assert.match(service, /pollIntervalMs,/);
});
